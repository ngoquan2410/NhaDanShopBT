import type { PendingOrderService } from "@/services/pendingOrders/PendingOrderService";
import type {
  CreatePendingOrderInput,
  MultiSortRule,
  PaymentMethod,
  PagedResult,
  PendingOrder,
  PendingOrderListParams,
  PendingOrderStatus,
  PricingBreakdownSnapshot,
} from "@/services/types";
import { readJson, writeJson } from "./storage";
import { generateOrderCode, uid } from "@/services/utils/ids";
import { addHoursIso, nowIso } from "@/services/utils/date";

const KEY = "pending_orders:v1";

const EMPTY_PRICING: PricingBreakdownSnapshot = {
  subtotal: 0,
  manualDiscount: 0,
  promotionDiscount: 0,
  voucherDiscount: 0,
  shippingFee: 0,
  shippingDiscount: 0,
  vatBase: 0,
  vatPercent: 0,
  vatAmount: 0,
  total: 0,
};

function load(): PendingOrder[] {
  return readJson<PendingOrder[]>(KEY, []);
}
function save(list: PendingOrder[]) {
  writeJson(KEY, list);
}

export class LocalPendingOrderAdapter implements PendingOrderService {
  async list(params?: PendingOrderListParams): Promise<PagedResult<PendingOrder>> {
    const all = load();
    const filtered = params?.status ? all.filter((o) => o.status === params.status) : all;
    const q = params?.query?.trim().toLowerCase();
    const matched = q
      ? filtered.filter(
          (o) =>
            o.code.toLowerCase().includes(q) ||
            (o.customerName ?? "").toLowerCase().includes(q) ||
            (o.customerPhone ?? "").toLowerCase().includes(q)
        )
      : filtered;
    const sorted = applySort(matched, params?.sort);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? sorted.length;
    const start = (page - 1) * pageSize;
    return {
      items: sorted.slice(start, start + pageSize),
      total: sorted.length,
      page,
      pageSize,
    };
  }

  async counts(): Promise<Record<string, number>> {
    const all = load();
    return {
      all: all.length,
      pending_payment: all.filter((o) => o.status === "pending_payment").length,
      waiting_confirm: all.filter((o) => o.status === "waiting_confirm").length,
      paid_auto: all.filter((o) => o.status === "paid_auto").length,
      confirmed: all.filter((o) => o.status === "confirmed").length,
      cancelled: all.filter((o) => o.status === "cancelled").length,
    };
  }

  async get(id: string): Promise<PendingOrder | null> {
    return load().find((o) => o.id === id) ?? null;
  }

  async getByCode(code: string): Promise<PendingOrder | null> {
    return load().find((o) => o.code === code) ?? null;
  }

  async create(input: CreatePendingOrderInput): Promise<PendingOrder> {
    const id = uid("po_");
    const code = generateOrderCode("DH");
    const order: PendingOrder = {
      id,
      code,
      createdAt: nowIso(),
      expiresAt: input.expiresAt ?? addHoursIso(12),
      status: "pending_payment",
      paymentReference: input.paymentReference || code,
      giftLinesSnapshot: input.promotionSnapshot?.giftLines ?? [],
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      shippingAddress: input.shippingAddress,
      paymentMethod: input.paymentMethod,
      lines: input.lines ?? [],
      promotionSnapshot: input.promotionSnapshot ?? null,
      voucherSnapshot: input.voucherSnapshot ?? null,
      shippingQuoteSnapshot: input.shippingQuoteSnapshot ?? null,
      pricingBreakdownSnapshot: input.pricingBreakdownSnapshot ?? EMPTY_PRICING,
      note: input.note,
    };
    save([order, ...load()]);
    return order;
  }

  async changePaymentMethod(
    id: string,
    paymentMethod: Exclude<PaymentMethod, "cash">,
  ): Promise<PendingOrder> {
    return this.update(id, { paymentMethod });
  }

  async markWaitingConfirm(id: string, opts?: { note?: string }): Promise<PendingOrder> {
    const current = await this.get(id);
    if (!current) throw new Error("Pending order not found");
    const note = [current.note, opts?.note].filter(Boolean).join(" · ") || undefined;
    return this.update(id, { status: "waiting_confirm", note });
  }

  async update(
    id: string,
    patch: Partial<CreatePendingOrderInput> & { status?: PendingOrderStatus }
  ): Promise<PendingOrder> {
    const list = load();
    const idx = list.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error("Pending order not found");
    const next: PendingOrder = { ...list[idx], ...patch } as PendingOrder;
    list[idx] = next;
    save(list);
    return next;
  }

  /** Convenience wrapper: pending/waiting → confirmed. Notes are appended
   *  to the existing note (separator " · ") so audit context is preserved. */
  async confirm(id: string, opts?: { note?: string }): Promise<PendingOrder> {
    const current = await this.get(id);
    const note = [current?.note, opts?.note].filter(Boolean).join(" · ") || undefined;
    return this.update(id, { status: "confirmed", note });
  }

  async cancel(id: string, opts?: { note?: string }): Promise<PendingOrder> {
    const current = await this.get(id);
    const note = [current?.note, opts?.note].filter(Boolean).join(" · ") || undefined;
    return this.update(id, { status: "cancelled", note });
  }

  async remove(id: string): Promise<void> {
    save(load().filter((o) => o.id !== id));
  }
}

function applySort<T>(items: T[], sort?: MultiSortRule[]): T[] {
  if (!sort?.length) return items;
  const arr = [...items];
  arr.sort((a: any, b: any) => {
    for (const rule of sort) {
      const av = a[rule.field];
      const bv = b[rule.field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return rule.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return arr;
}
