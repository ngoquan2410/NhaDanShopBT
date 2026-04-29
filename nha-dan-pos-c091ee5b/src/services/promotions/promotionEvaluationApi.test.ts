import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cartContextToPromotionEvaluationPayload,
  parsePromotionEvaluationResponse,
  postPromotionPickBest,
} from "./promotionEvaluationApi";
import type { CartContext } from "@/services/types";

describe("promotionEvaluationApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps cart context into backend evaluation payload", () => {
    const ctx: CartContext = {
      subtotal: 120000,
      lines: [{ id: "l1", productId: "10", variantId: "20", productName: "P", qty: 2, unitPrice: 60000, lineSubtotal: 120000 }],
      shippingQuote: { status: "quoted", fee: 15000 },
    };

    expect(cartContextToPromotionEvaluationPayload(ctx, "7")).toEqual({
      promotionId: 7,
      subtotal: 120000,
      shippingFee: 15000,
      lines: [{ id: "l1", productId: 10, variantId: 20, qty: 2, unitPrice: 60000, lineSubtotal: 120000 }],
    });
  });

  it("maps backend uppercase response into FE evaluated promotion shape", () => {
    const mapped = parsePromotionEvaluationResponse({
      promotionId: "9",
      name: "Free ship",
      type: "FREE_SHIPPING",
      ruleSummary: "Ship",
      eligible: true,
      discountAmount: "0",
      shippingDiscountAmount: "15000",
      voucherDiscountAmount: 0,
      affectedLines: [{ lineId: "l1", productId: "10", variantId: "20", productName: "P", eligibleQty: 1 }],
      giftLines: [{ productId: "30", variantId: "40", productName: "Gift", qty: 1, unitPrice: 0, lineTotal: 0, promotionId: "9", promotionName: "Free ship" }],
    });

    expect(mapped.type).toBe("free_shipping");
    expect(mapped.shippingDiscountAmount).toBe(15000);
    expect(mapped.affectedLines[0].productId).toBe("10");
    expect(mapped.giftLines[0].productName).toBe("Gift");
  });

  it("posts pick-best to backend endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        promotionId: "1",
        name: "10%",
        type: "PERCENT_DISCOUNT",
        eligible: true,
        discountAmount: 10000,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      }),
    } as Response);

    const result = await postPromotionPickBest({ lines: [], subtotal: 0, shippingFee: 0 });
    expect(result?.type).toBe("percent_discount");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/promotions/pick-best",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

