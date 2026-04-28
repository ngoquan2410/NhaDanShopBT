// Active pending-order adapter.
// Pending-order ownership now lives behind backend APIs in production.
// This adapter only keeps thin compatibility normalization for the
// existing service contract. The legacy "Cloud" name is kept temporarily
// to avoid broad call-site churn after the migration.

import type {
  PendingOrderOnlinePaymentMethod,
  PendingOrderService,
} from "@/services/pendingOrders/PendingOrderService";
import type {
  CreatePendingOrderInput,
  PagedResult,
  PaymentMethod,
  PendingOrder,
  PendingOrderListParams,
  PendingOrderStatus,
  PricingBreakdownSnapshot,
} from "@/services/types";
import { LocalPendingOrderAdapter } from "../local/LocalPendingOrderAdapter";
import { adminFetchJson } from "@/services/auth/adminApi";

type BackendPendingOrder = {
  id: string | number;
  code: string;
  createdAt: string;
  expiresAt?: string;
  status: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  shippingAddress?: unknown;
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
  lines?: unknown[];
  giftLinesSnapshot?: unknown[];
  promotionSnapshot?: unknown | null;
  voucherSnapshot?: unknown | null;
  shippingQuoteSnapshot?: unknown | null;
  pricingBreakdownSnapshot: unknown;
  note?: string | null;
};

type BackendPendingOrderConfirmResponse = {
  pendingOrder: BackendPendingOrder;
  invoice?: unknown | null;
};

const API_BASE = "/api/pending-orders";
const isTestEnv =
  typeof process !== "undefined" &&
  typeof process.env !== "undefined" &&
  process.env.NODE_ENV === "test";

function normalizePricingBreakdown(value: any): PricingBreakdownSnapshot {
  const subtotal = Number(value?.subtotal ?? 0);
  const manualDiscount = Number(value?.manualDiscount ?? 0);
  const promotionDiscount = Number(value?.promotionDiscount ?? value?.promoDiscount ?? 0);
  const voucherDiscount = Number(value?.voucherDiscount ?? 0);
  const shippingFee = Number(value?.shippingFee ?? 0);
  const shippingDiscount = Number(value?.shippingDiscount ?? 0);
  const vatBase = Number(
    value?.vatBase ??
    Math.max(0, subtotal - manualDiscount - promotionDiscount - voucherDiscount),
  );
  const vatPercent = Number(value?.vatPercent ?? 0);
  const vatAmount = Number(value?.vatAmount ?? value?.vat ?? 0);
  const total = Number(value?.total ?? 0);

  return {
    subtotal,
    manualDiscount,
    promotionDiscount,
    voucherDiscount,
    shippingFee,
    shippingDiscount,
    vatBase,
    vatPercent,
    vatAmount,
    vat: Number(value?.vat ?? vatAmount),
    total,
  };
}

function backendToOrder(raw: BackendPendingOrder): PendingOrder {
  return {
    id: String(raw.id),
    code: raw.code,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    status: (raw.status as PendingOrderStatus) ?? "pending_payment",
    customerId: raw.customerId ?? undefined,
    customerName: raw.customerName ?? undefined,
    customerPhone: raw.customerPhone ?? undefined,
    shippingAddress: (raw.shippingAddress as PendingOrder["shippingAddress"]) ?? undefined,
    paymentMethod: raw.paymentMethod,
    paymentReference: raw.paymentReference || raw.code,
    lines: Array.isArray(raw.lines)
      ? raw.lines.map((line: any) => ({
          id: String(line.id),
          productId: String(line.productId),
          variantId: String(line.variantId),
          productName: line.productName,
          variantName: line.variantName ?? undefined,
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
          lineSubtotal: Number(line.lineSubtotal),
          batchId: line.batchId != null ? String(line.batchId) : undefined,
          rewardLine: Boolean(line.rewardLine),
          originalUnitPrice:
            line.originalUnitPrice != null ? Number(line.originalUnitPrice) : undefined,
        }))
      : [],
    giftLinesSnapshot: Array.isArray(raw.giftLinesSnapshot)
      ? (raw.giftLinesSnapshot as PendingOrder["giftLinesSnapshot"])
      : [],
    promotionSnapshot: (raw.promotionSnapshot as PendingOrder["promotionSnapshot"]) ?? null,
    voucherSnapshot: (raw.voucherSnapshot as PendingOrder["voucherSnapshot"]) ?? null,
    shippingQuoteSnapshot: (raw.shippingQuoteSnapshot as PendingOrder["shippingQuoteSnapshot"]) ?? null,
    pricingBreakdownSnapshot: normalizePricingBreakdown(raw.pricingBreakdownSnapshot),
    note: raw.note ?? undefined,
  };
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.detail || data?.message || data?.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export class CloudPendingOrderAdapter implements PendingOrderService {
  private readonly local = new LocalPendingOrderAdapter();

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
    opts?: { allow404?: boolean },
  ): Promise<T | null> {
    const res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (opts?.allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(await parseError(res));
    return (await res.json()) as T;
  }

  private mapPaymentToApi(m: PaymentMethod): string {
    return m === "cash" ? "cod" : m;
  }

  private buildApiPricingBreakdown(p: PricingBreakdownSnapshot) {
    return {
      subtotal: p.subtotal,
      manualDiscount: p.manualDiscount,
      promotionDiscount: p.promotionDiscount,
      voucherDiscount: p.voucherDiscount,
      shippingFee: p.shippingFee,
      shippingDiscount: p.shippingDiscount,
      vatBase: p.vatBase,
      vatPercent: p.vatPercent,
      vatAmount: p.vatAmount,
      total: p.total,
    };
  }

  async list(params?: PendingOrderListParams): Promise<PagedResult<PendingOrder>> {
    if (isTestEnv) return this.local.list(params);

    const rows = await adminFetchJson<BackendPendingOrder[]>(API_BASE);
    let items = rows.map(backendToOrder);

    if (params?.status) {
      items = items.filter((item) => item.status === params.status);
    }

    if (params?.query?.trim()) {
      const q = params.query.trim().toLowerCase();
      items = items.filter((item) =>
        [item.code, item.customerName, item.customerPhone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }

    items = items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const paged = items.slice(from, from + pageSize);

    return {
      items: paged,
      total: items.length,
      page,
      pageSize,
    };
  }

  async get(id: string): Promise<PendingOrder | null> {
    if (isTestEnv) return this.local.get(id);

    if (/^\d+$/.test(id)) {
      const order = await this.requestJson<BackendPendingOrder>(
        `${API_BASE}/${encodeURIComponent(id)}`,
        undefined,
        { allow404: true },
      );
      return order ? backendToOrder(order) : null;
    }
    return this.getByCode(id);
  }

  async getByCode(code: string): Promise<PendingOrder | null> {
    if (isTestEnv) return this.local.getByCode(code);
    const order = await this.requestJson<BackendPendingOrder>(
      `${API_BASE}/by-code/${encodeURIComponent(code)}`,
      undefined,
      { allow404: true },
    );
    return order ? backendToOrder(order) : null;
  }

  async create(input: CreatePendingOrderInput): Promise<PendingOrder> {
    if (isTestEnv) return this.local.create(input);

    const body: Record<string, unknown> = {
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      shippingAddress: input.shippingAddress,
      paymentMethod: this.mapPaymentToApi(input.paymentMethod),
      promotionSnapshot: input.promotionSnapshot ?? null,
      voucherSnapshot: input.voucherSnapshot ?? null,
      shippingQuoteSnapshot: input.shippingQuoteSnapshot ?? null,
      note: input.note,
      expiresAt: input.expiresAt,
    };
    if (input.quotePublicId) {
      body.quotePublicId = input.quotePublicId;
    }
    if (input.lines !== undefined) {
      body.lines = input.lines;
    }
    if (input.pricingBreakdownSnapshot) {
      body.pricingBreakdownSnapshot = this.buildApiPricingBreakdown(input.pricingBreakdownSnapshot);
    }

    const order = await this.requestJson<BackendPendingOrder>(API_BASE, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return backendToOrder(order as BackendPendingOrder);
  }

  async changePaymentMethod(
    id: string,
    paymentMethod: PendingOrderOnlinePaymentMethod,
  ): Promise<PendingOrder> {
    if (isTestEnv) return this.local.changePaymentMethod(id, paymentMethod);

    const order = await this.requestJson<BackendPendingOrder>(
      `${API_BASE}/${encodeURIComponent(id)}/change-payment-method`,
      {
        method: "POST",
        body: JSON.stringify({ paymentMethod }),
      },
    );
    return backendToOrder(order as BackendPendingOrder);
  }

  async markWaitingConfirm(id: string, opts?: { note?: string }): Promise<PendingOrder> {
    if (isTestEnv) return this.local.markWaitingConfirm(id, opts);

    const order = await this.requestJson<BackendPendingOrder>(
      `${API_BASE}/${encodeURIComponent(id)}/mark-waiting-confirm`,
      {
        method: "POST",
        body: JSON.stringify({ note: opts?.note }),
      },
    );
    return backendToOrder(order as BackendPendingOrder);
  }

  async update(
    id: string,
    patch: Partial<CreatePendingOrderInput> & { status?: PendingOrderStatus }
  ): Promise<PendingOrder> {
    const keys = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined);
    if (keys.length === 0) {
      const current = await this.get(id);
      if (!current) throw new Error("Pending order not found");
      return current;
    }

    const statusOnly = keys.every((key) => key === "status" || key === "note");
    if (patch.status === "waiting_confirm" && statusOnly) {
      return this.markWaitingConfirm(id, { note: patch.note });
    }

    const paymentMethodOnly = keys.length === 1 && keys[0] === "paymentMethod";
    if (
      paymentMethodOnly &&
      patch.paymentMethod &&
      patch.paymentMethod !== "cash"
    ) {
      return this.changePaymentMethod(
        id,
        patch.paymentMethod as PendingOrderOnlinePaymentMethod,
      );
    }

    if (statusOnly && patch.status === "confirmed") {
      return this.confirm(id, { note: patch.note });
    }

    if (statusOnly && patch.status === "cancelled") {
      return this.cancel(id, { note: patch.note });
    }

    throw new Error(
      "Generic pending-order updates are no longer supported. Use command-style mutations only.",
    );
  }

  async confirm(id: string, opts?: { note?: string; confirmedBy?: string }): Promise<PendingOrder> {
    if (isTestEnv) {
      const current = await this.get(id);
      const note = [current?.note, opts?.note].filter(Boolean).join(" · ") || undefined;
      return this.update(id, { status: "confirmed", note });
    }
    const hasBody = Boolean(opts?.note || opts?.confirmedBy);
    const data = await adminFetchJson<BackendPendingOrderConfirmResponse>(
      `${API_BASE}/${encodeURIComponent(id)}/confirm`,
      {
        method: "POST",
        ...(hasBody
          ? {
              body: JSON.stringify({
                note: opts?.note ?? null,
                confirmedBy: opts?.confirmedBy ?? null,
              }),
            }
          : {}),
      },
    );
    return backendToOrder(data.pendingOrder);
  }

  async cancel(id: string, opts?: { note?: string }): Promise<PendingOrder> {
    if (isTestEnv) {
      const current = await this.get(id);
      const note = [current?.note, opts?.note].filter(Boolean).join(" · ") || undefined;
      return this.update(id, { status: "cancelled", note });
    }
    const order = await adminFetchJson<BackendPendingOrder>(`${API_BASE}/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: opts?.note }),
    });
    return backendToOrder(order);
  }

  async remove(id: string): Promise<void> {
    void id;
    if (isTestEnv) {
      throw new Error("Pending-order remove is not supported in backend-owned mode.");
    }
    throw new Error("Pending-order remove is not supported by the backend API.");
  }
}
