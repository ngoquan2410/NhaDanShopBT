/**
 * Slice 6C — backend commercial quote (anonymous storefront allowed; POS/admin send JWT).
 */

import { adminFetchJson } from "@/services/auth/adminApi";
import type { PricingBreakdownSnapshot, ShippingAddress, ShippingQuoteSnapshot } from "@/services/types";

export type SalesQuoteLinePayload = {
  productId: number;
  variantId: number;
  quantity: number;
  discountPercent?: number;
  batchId?: number | null;
  rewardLine?: boolean;
};

export type SalesQuoteRequestPayload = {
  source: "storefront" | "pos" | "admin";
  customerId?: string | null;
  lines: SalesQuoteLinePayload[];
  promotionId?: number | null;
  voucherCode?: string | null;
  /** POS/admin: optional client shipping context. Storefront: ignored — server computes shipping from {@link shippingAddress}. */
  shippingQuoteSnapshot?: ShippingQuoteSnapshot | null;
  /** Storefront: required for server-side shipping quote; same shape as checkout address. */
  shippingAddress?: ShippingAddress | null;
  manualDiscount?: number | null;
  vatPercent?: number | null;
};

export type SalesQuoteLineResponse = {
  productId: number;
  variantId: number;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  discountPercent?: number;
  batchId?: number | null;
  rewardLine: boolean;
  originalUnitPrice: number;
};

export type VoucherSnapshotFromQuote = {
  code: string;
  ruleSummary?: string | null;
  discountAmount: number;
  shippingDiscountAmount: number;
};

export type SalesQuoteApiResult = {
  quoteId: string;
  expiresAt: string;
  lines: SalesQuoteLineResponse[];
  rewardLines: SalesQuoteLineResponse[];
  pricingBreakdownSnapshot: PricingBreakdownSnapshot;
  shippingQuoteSnapshot: ShippingQuoteSnapshot | null;
  voucherSnapshot: VoucherSnapshotFromQuote | null;
};

function normalizePricing(v: Record<string, unknown>): PricingBreakdownSnapshot {
  const subtotal = Number(v.subtotal ?? 0);
  const manualDiscount = Number(v.manualDiscount ?? 0);
  const promotionDiscount = Number(v.promotionDiscount ?? 0);
  const voucherDiscount = Number(v.voucherDiscount ?? 0);
  const shippingFee = Number(v.shippingFee ?? 0);
  const shippingDiscount = Number(v.shippingDiscount ?? 0);
  const vatBase = Number(v.vatBase ?? subtotal);
  const vatPercent = Number(v.vatPercent ?? 0);
  const vatAmount = Number(v.vatAmount ?? 0);
  const total = Number(v.total ?? 0);
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
    vat: vatAmount,
    total,
  };
}

function mapVoucherSnapshot(v: unknown): VoucherSnapshotFromQuote | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const code = o.code != null ? String(o.code) : "";
  if (!code) return null;
  return {
    code,
    ruleSummary: o.ruleSummary != null ? String(o.ruleSummary) : undefined,
    discountAmount: Number(o.discountAmount ?? 0),
    shippingDiscountAmount: Number(o.shippingDiscountAmount ?? 0),
  };
}

/** Maps backend {@link SalesQuoteApiResult} for UI / pending-order payloads. */
export function pricingFromQuoteApi(raw: SalesQuoteApiResult): PricingBreakdownSnapshot {
  return raw.pricingBreakdownSnapshot;
}

function mapQuoteResponse(j: Record<string, unknown>): SalesQuoteApiResult {
  return {
    quoteId: String(j.quoteId ?? ""),
    expiresAt: String(j.expiresAt ?? ""),
    lines: (j.lines as SalesQuoteLineResponse[]) ?? [],
    rewardLines: (j.rewardLines as SalesQuoteLineResponse[]) ?? [],
    pricingBreakdownSnapshot: normalizePricing(
      (j.pricingBreakdownSnapshot as Record<string, unknown>) ?? {},
    ),
    shippingQuoteSnapshot: (j.shippingQuoteSnapshot as ShippingQuoteSnapshot) ?? null,
    voucherSnapshot: mapVoucherSnapshot(j.voucherSnapshot),
  };
}

export async function postSalesQuote(req: SalesQuoteRequestPayload): Promise<SalesQuoteApiResult> {
  const res = await fetch("/api/sales/quote", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = (j.detail || j.message || j.error || detail) as string;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const j = (await res.json()) as Record<string, unknown>;
  return mapQuoteResponse(j);
}

/** Authenticated quote for POS/admin (`source` must be `pos` or `admin`). */
export async function postSalesQuoteAsPos(req: SalesQuoteRequestPayload): Promise<SalesQuoteApiResult> {
  const src = req.source === "admin" ? "admin" : "pos";
  const j = await adminFetchJson<Record<string, unknown>>("/api/sales/quote", {
    method: "POST",
    body: JSON.stringify({ ...req, source: src }),
  });
  return mapQuoteResponse(j);
}
