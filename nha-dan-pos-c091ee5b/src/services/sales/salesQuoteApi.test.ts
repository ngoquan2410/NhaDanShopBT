import { describe, expect, it, vi, beforeEach } from "vitest";
import { postSalesQuoteAsPos, pricingFromQuoteApi, type SalesQuoteApiResult } from "./salesQuoteApi";
import * as adminApi from "@/services/auth/adminApi";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

const minimalQuotePayload = {
  quoteId: "550e8400-e29b-41d4-a716-446655440000",
  expiresAt: "2026-04-28T12:00:00",
  lines: [],
  rewardLines: [],
  voucherSnapshot: {
    code: "PCT10",
    ruleSummary: "10%",
    discountAmount: 5000,
    shippingDiscountAmount: 0,
  },
  pricingBreakdownSnapshot: {
    subtotal: 100000,
    manualDiscount: 0,
    promotionDiscount: 0,
    voucherDiscount: 0,
    shippingFee: 15000,
    shippingDiscount: 0,
    itemNetRevenue: 100000,
    shippingNetRevenue: 15000,
    vatBase: 100000,
    vatPercent: 8,
    vatAmount: 8000,
    total: 123000,
    commercialAllocationVersion: 1,
  },
  shippingQuoteSnapshot: null,
};

describe("postSalesQuoteAsPos", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("maps backend quote and forces authenticated source pos", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue(minimalQuotePayload);
    const r = await postSalesQuoteAsPos({
      source: "pos",
      lines: [{ productId: 1, variantId: 2, quantity: 1 }],
    });
    expect(r.quoteId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(r.pricingBreakdownSnapshot.total).toBe(123000);
    expect(r.pricingBreakdownSnapshot.vatAmount).toBe(8000);
    expect(r.pricingBreakdownSnapshot.itemNetRevenue).toBe(100000);
    expect(r.pricingBreakdownSnapshot.shippingNetRevenue).toBe(15000);
    expect(r.pricingBreakdownSnapshot.commercialAllocationVersion).toBe(1);
    expect(r.voucherSnapshot?.code).toBe("PCT10");
    expect(r.voucherSnapshot?.discountAmount).toBe(5000);
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/sales/quote",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"source":"pos"'),
      }),
    );
  });
});

describe("pricingFromQuoteApi", () => {
  it("returns snapshot reference fields for POS invoice preview", () => {
    const raw = minimalQuotePayload as unknown as SalesQuoteApiResult;
    const pb = pricingFromQuoteApi(raw);
    expect(pb.shippingFee).toBe(15000);
    expect(pb.vatPercent).toBe(8);
    expect(pb.itemNetRevenue).toBe(100000);
    expect(pb.shippingNetRevenue).toBe(15000);
    expect(pb.commercialAllocationVersion).toBe(1);
  });
});
