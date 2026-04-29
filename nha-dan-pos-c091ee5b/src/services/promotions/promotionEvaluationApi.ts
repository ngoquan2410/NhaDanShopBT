import type {
  CartContext,
  EvaluatedPromotion,
  GiftLine,
  PromotionAffectedLine,
  PromotionType,
} from "@/services/types";

export type BackendPromotionType =
  | "PERCENT_DISCOUNT"
  | "FIXED_DISCOUNT"
  | "BUY_X_GET_Y"
  | "QUANTITY_GIFT"
  | "FREE_SHIPPING";

const BACKEND_TO_SERVICE_TYPE: Record<BackendPromotionType, PromotionType> = {
  PERCENT_DISCOUNT: "percent_discount",
  FIXED_DISCOUNT: "fixed_discount",
  BUY_X_GET_Y: "buy_x_get_y",
  QUANTITY_GIFT: "gift",
  FREE_SHIPPING: "free_shipping",
};

export type PromotionEvaluationLinePayload = {
  id?: string;
  productId: number;
  variantId?: number | null;
  qty: number;
  unitPrice?: number;
  lineSubtotal?: number;
};

export type PromotionEvaluationPayload = {
  promotionId?: number | null;
  lines: PromotionEvaluationLinePayload[];
  subtotal?: number;
  shippingFee?: number;
};

type RawEvaluation = Record<string, unknown>;

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function toId(v: unknown): string {
  return String(v ?? "");
}

export function cartContextToPromotionEvaluationPayload(
  ctx: CartContext,
  promotionId?: string | number | null,
): PromotionEvaluationPayload {
  const numericPromotionId = promotionId == null || promotionId === "" ? null : Number(promotionId);
  return {
    promotionId: Number.isFinite(numericPromotionId as number) ? (numericPromotionId as number) : null,
    lines: ctx.lines.map((line) => ({
      id: line.id,
      productId: Number(line.productId),
      variantId: line.variantId == null ? null : Number(line.variantId),
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
    })),
    subtotal: ctx.subtotal,
    shippingFee: ctx.shippingQuote?.fee ?? 0,
  };
}

export function parsePromotionEvaluationResponse(raw: RawEvaluation): EvaluatedPromotion {
  const backendType = String(raw.type ?? "") as BackendPromotionType;
  const affectedRaw = Array.isArray(raw.affectedLines) ? raw.affectedLines : [];
  const giftRaw = Array.isArray(raw.giftLines) ? raw.giftLines : [];
  return {
    promotionId: toId(raw.promotionId),
    name: String(raw.name ?? ""),
    type: BACKEND_TO_SERVICE_TYPE[backendType] ?? "fixed_discount",
    ruleSummary: String(raw.ruleSummary ?? ""),
    eligible: Boolean(raw.eligible),
    reasonIfIneligible: raw.reasonIfIneligible != null ? String(raw.reasonIfIneligible) : undefined,
    discountAmount: toNumber(raw.discountAmount),
    shippingDiscountAmount: toNumber(raw.shippingDiscountAmount),
    voucherDiscountAmount: toNumber(raw.voucherDiscountAmount),
    affectedLines: affectedRaw.map((x) => {
      const row = x as Record<string, unknown>;
      return {
        lineId: toId(row.lineId),
        productId: toId(row.productId),
        variantId: toId(row.variantId),
        productName: String(row.productName ?? ""),
        variantName: row.variantName != null ? String(row.variantName) : undefined,
        eligibleQty: row.eligibleQty == null ? undefined : toNumber(row.eligibleQty),
        discountedAmount: row.discountedAmount == null ? undefined : toNumber(row.discountedAmount),
        rewardQty: row.rewardQty == null ? undefined : toNumber(row.rewardQty),
        note: row.note != null ? String(row.note) : undefined,
      } satisfies PromotionAffectedLine;
    }),
    giftLines: giftRaw.map((x) => {
      const row = x as Record<string, unknown>;
      return {
        productId: toId(row.productId),
        variantId: row.variantId != null ? toId(row.variantId) : undefined,
        productName: String(row.productName ?? ""),
        variantName: row.variantName != null ? String(row.variantName) : undefined,
        qty: toNumber(row.qty),
        unitPrice: toNumber(row.unitPrice),
        lineTotal: toNumber(row.lineTotal),
        promotionId: toId(row.promotionId),
        promotionName: String(row.promotionName ?? ""),
      } satisfies GiftLine;
    }),
  };
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as Record<string, unknown>;
      detail = String(j.detail || j.message || j.error || detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function postPromotionEvaluate(payload: PromotionEvaluationPayload): Promise<EvaluatedPromotion[]> {
  const raw = await postJson("/api/promotions/evaluate", payload);
  return Array.isArray(raw) ? raw.map((row) => parsePromotionEvaluationResponse(row as RawEvaluation)) : [];
}

export async function postPromotionPickBest(payload: PromotionEvaluationPayload): Promise<EvaluatedPromotion | null> {
  const raw = await postJson("/api/promotions/pick-best", payload);
  return raw && typeof raw === "object" ? parsePromotionEvaluationResponse(raw as RawEvaluation) : null;
}

