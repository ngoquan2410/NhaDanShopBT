// Thin adapter — wraps the legacy in-memory `invoiceActions` store for **tests**
// and **`VITE_ADMIN_INVOICE_LOCAL_DEMO`** only (see `services/index.ts`).
// Production admin invoice list/detail uses **`BackendInvoiceAdapter`**.
//
// P0 invariants (do NOT regress):
//  - voucher discount is NEVER merged into promo discount
//  - vatBase is the POST-discount item base, not the raw subtotal
//  - vatPercent is preserved as a real field (default 0, never inferred)
//  - pendingOrderId / sourceType are recorded so cancel/restore can trace origin

import type {
  CreateInvoiceInput,
  InvoiceService,
  InvoiceListParams,
} from "@/services/invoices/InvoiceService";
import type { Invoice, InvoiceLine, InvoiceBreakdown } from "@/lib/mock-data";
import type { PagedResult, ID } from "@/services/types";
import { invoiceActions } from "@/lib/store";
import { getStoreState } from "@/lib/store";
import { localToday, toLocalDateString } from "@/lib/localDate";

function isoDayRolling(): string {
  return localToday();
}

function buildBreakdown(input: CreateInvoiceInput): InvoiceBreakdown {
  const p = input.pricingBreakdownSnapshot;
  const promo = input.promotionSnapshot;
  const voucher = input.voucherSnapshot;
  const vatPercent = Math.max(0, input.vatPercent ?? 0);
  // Post-discount item base (matches POS pricing engine in src/lib/pos-invoice.ts).
  const vatBase = Math.max(0, p.subtotal - p.manualDiscount - p.promotionDiscount - p.voucherDiscount);
  const vatAmount = Math.floor((vatBase * vatPercent) / 100);
  return {
    subtotal: p.subtotal,
    manualDiscount: p.manualDiscount,
    promoDiscount: p.promotionDiscount,
    promoName: promo?.name,
    voucherDiscount: p.voucherDiscount,
    voucherName: voucher ? voucher.code : undefined,
    shippingFee: p.shippingFee,
    shippingDiscount: p.shippingDiscount,
    shippingPayable: Math.max(0, p.shippingFee - p.shippingDiscount),
    vatPercent,
    vatBase,
    vatAmount,
    total: p.total,
    freeItems: input.giftLines?.map((g) => ({
      productName: g.variantName ? `${g.productName} - ${g.variantName}` : g.productName,
      quantity: g.qty,
    })),
  };
}

function buildLines(input: CreateInvoiceInput): InvoiceLine[] {
  const billable: InvoiceLine[] = input.lines.map((l) => ({
    name: l.variantName ? `${l.productName} - ${l.variantName}` : l.productName,
    code: "",
    qty: l.qty,
    price: l.unitPrice,
  }));
  const rewards: InvoiceLine[] = (input.giftLines ?? []).map((g) => ({
    name: g.variantName ? `${g.productName} - ${g.variantName}` : g.productName,
    code: "",
    qty: g.qty,
    price: 0,
    reward: true,
    rewardSource: g.promotionName,
  }));
  return [...billable, ...rewards];
}

function generateNumber(): string {
  const date = toLocalDateString().replace(/-/g, "");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `HD-${date}-${rand}`;
}

export class LocalInvoiceAdapter implements InvoiceService {
  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const dated = input.date ?? new Date().toISOString();
    const inv = invoiceActions.create({
      number: input.number ?? generateNumber(),
      date: dated,
      customerId: input.customerId ?? "",
      customerName: input.customerName,
      total: input.pricingBreakdownSnapshot.total,
      paymentType: input.paymentType,
      status: "active",
      createdBy: input.createdBy ?? "online",
      itemCount: input.lines.reduce((s, l) => s + l.qty, 0),
      breakdown: buildBreakdown(input),
      lines: buildLines(input),
      note: input.note,
      sourceType: input.sourceType ?? "online_pending",
      pendingOrderId: input.pendingOrderId,
      allowPhysicalDelete: dated.startsWith(isoDayRolling()),
    });
    return inv;
  }

  async list(params?: InvoiceListParams): Promise<PagedResult<Invoice>> {
    const all = getStoreState().invoices;
    const q = (params?.query ?? "").trim().toLowerCase();
    const status = params?.status;
    const paymentType = params?.paymentType;
    const customerId = params?.customerId;
    const fromMs = params?.dateRange?.from ? new Date(params.dateRange.from).getTime() : null;
    const toMs = params?.dateRange?.to ? new Date(params.dateRange.to).getTime() : null;

    let filtered = all.filter((inv) => {
      if (status && inv.status !== status) return false;
      if (paymentType && inv.paymentType !== paymentType) return false;
      if (customerId && inv.customerId !== customerId) return false;
      if (fromMs != null && new Date(inv.date).getTime() < fromMs) return false;
      if (toMs != null && new Date(inv.date).getTime() > toMs) return false;
      if (q) {
        const hay = `${inv.number} ${inv.customerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Apply only the first sort rule (BE-friendly subset; UI can add richer
    // client-side ordering via useTableControls when needed).
    const rule = params?.sort?.[0];
    if (rule) {
      const dir = rule.direction === "desc" ? -1 : 1;
      filtered = [...filtered].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[rule.field];
        const bv = (b as unknown as Record<string, unknown>)[rule.field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1 * dir;
        if (bv == null) return -1 * dir;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.max(1, params?.pageSize ?? (filtered.length || 1));
    const start = (page - 1) * pageSize;
    const items = params?.pageSize ? filtered.slice(start, start + pageSize) : filtered;

    return { items, total: filtered.length, page, pageSize };
  }

  async get(id: ID): Promise<Invoice | null> {
    return getStoreState().invoices.find((i) => i.id === id) ?? null;
  }

  async cancel(id: ID): Promise<Invoice> {
    invoiceActions.update(id, { status: "cancelled" });
    const next = getStoreState().invoices.find((i) => i.id === id);
    if (!next) throw new Error("Invoice not found");
    return next;
  }

  async remove(id: ID): Promise<void> {
    const inv = getStoreState().invoices.find((i) => i.id === id);
    if (!inv) throw new Error("Invoice not found");
    if (inv.allowPhysicalDelete === false) {
      throw new Error("Hóa đơn này không cho phép xóa vật lý.");
    }
    const day = isoDayRolling();
    const ok =
      inv.allowPhysicalDelete === true || (inv.allowPhysicalDelete !== false && inv.date.startsWith(day));
    if (!ok) {
      throw new Error("Chỉ được xóa hóa đơn trong ngày tạo");
    }
    invoiceActions.remove(id);
  }
}
