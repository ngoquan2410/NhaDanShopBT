// Adapter that wraps the existing rule engine in src/lib/promotions.ts and
// exposes it through the canonical PromotionEvaluationService contract.
//
// Source of promotion definitions: the in-memory store (src/lib/store.ts),
// which already migrates legacy mock data into the discriminated-union model.
// When the EC2 backend lands, only this adapter changes — the UI keeps
// consuming `promotions.pickBest()` / `promotions.evaluateAll()` unchanged.
import type { PromotionEvaluationService } from "@/services/promotions/PromotionEvaluationService";
import type {
  CartContext,
  EvaluatedPromotion,
  GiftLine,
  PromotionAffectedLine,
  PromotionType as ServicePromotionType,
} from "@/services/types";
import {
  applyPromotionToCart,
  formatPromotionSummary,
  type Cart as LibCart,
  type CartLine as LibCartLine,
  type Promotion as LibPromotion,
  type PromotionApplication,
  type PromotionType as LibPromotionType,
} from "@/lib/promotions";
import { getStoreState } from "@/lib/store";

const TYPE_MAP: Record<LibPromotionType, ServicePromotionType> = {
  percent: "percent_discount",
  fixed: "fixed_discount",
  "buy-x-get-y": "buy_x_get_y",
  gift: "gift",
  "free-shipping": "free_shipping",
};

function toLibCart(ctx: CartContext): LibCart {
  const lines: LibCartLine[] = ctx.lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    productName: l.productName,
    unitPrice: l.unitPrice,
    quantity: l.qty,
  }));
  return {
    lines,
    subtotal: ctx.subtotal,
    shippingFee: ctx.shippingQuote?.fee ?? 0,
  };
}

// Distribute the line-level discount proportionally across cart lines.
// Free-shipping promotions never affect line items.
function buildAffectedLines(ctx: CartContext, app: PromotionApplication): PromotionAffectedLine[] {
  if (app.discount <= 0) return [];
  const totalSubtotal = ctx.lines.reduce((s, l) => s + l.lineSubtotal, 0);
  if (totalSubtotal <= 0) return [];
  return ctx.lines.map((l) => ({
    lineId: l.id,
    productId: l.productId,
    variantId: l.variantId,
    productName: l.productName,
    variantName: l.variantName,
    eligibleQty: l.qty,
    discountedAmount: Math.round((l.lineSubtotal / totalSubtotal) * app.discount),
  }));
}

function buildGiftLines(app: PromotionApplication): GiftLine[] {
  if (!app.freeItems?.length) return [];
  return app.freeItems.map((g) => ({
    productId: g.productId,
    productName: g.productName,
    qty: g.quantity,
    unitPrice: 0,
    lineTotal: 0,
    promotionId: app.promotionId,
    promotionName: app.promotionName,
  }));
}

function toEvaluated(
  p: LibPromotion,
  app: PromotionApplication,
  ctx: CartContext
): EvaluatedPromotion {
  return {
    promotionId: app.promotionId,
    name: app.promotionName,
    type: TYPE_MAP[p.type],
    ruleSummary: formatPromotionSummary(p),
    eligible: app.applied,
    reasonIfIneligible: app.applied ? undefined : app.skipReason,
    discountAmount: app.discount,
    shippingDiscountAmount: app.shippingDiscount,
    voucherDiscountAmount: 0,
    affectedLines: buildAffectedLines(ctx, app),
    giftLines: buildGiftLines(app),
  };
}

export class LocalPromotionAdapter implements PromotionEvaluationService {
  async evaluateAll(ctx: CartContext): Promise<EvaluatedPromotion[]> {
    const promos = getStoreState().promotions;
    if (!promos.length) return [];
    const libCart = toLibCart(ctx);
    return promos.map((p) => toEvaluated(p, applyPromotionToCart(libCart, p), ctx));
  }

  async pickBest(ctx: CartContext): Promise<EvaluatedPromotion | null> {
    const all = await this.evaluateAll(ctx);
    const eligible = all.filter((e) => e.eligible);
    if (!eligible.length) return null;
    // Best = highest combined value to the customer (line discount + shipping discount).
    eligible.sort(
      (a, b) =>
        b.discountAmount + b.shippingDiscountAmount -
        (a.discountAmount + a.shippingDiscountAmount)
    );
    return eligible[0];
  }
}
