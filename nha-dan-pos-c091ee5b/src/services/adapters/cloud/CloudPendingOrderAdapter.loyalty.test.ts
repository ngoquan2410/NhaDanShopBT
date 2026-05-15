import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storefrontFetchMock = vi.fn();

vi.mock("@/lib/storefrontAuthHeaders", () => ({
  storefrontAuthHeaders: vi.fn(() => ({})),
  storefrontFetch: (...args: unknown[]) => storefrontFetchMock(...args),
}));

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("CloudPendingOrderAdapter loyalty mapping", () => {
  beforeEach(() => {
    storefrontFetchMock.mockReset();
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps loyalty fields from pricingBreakdownSnapshot", async () => {
    storefrontFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 1,
          code: "DH-20260508-001",
          createdAt: "2026-05-08T10:00:00",
          status: "pending_payment",
          paymentMethod: "bank_transfer",
          pricingBreakdownSnapshot: {
            subtotal: 100000,
            manualDiscount: 0,
            promotionDiscount: 0,
            voucherDiscount: 0,
            loyaltyDiscount: 5000,
            loyaltyRedeemedPoints: 50,
            shippingFee: 0,
            shippingDiscount: 0,
            vatBase: 0,
            vatPercent: 0,
            vatAmount: 0,
            total: 95000,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { CloudPendingOrderAdapter } = await import("./CloudPendingOrderAdapter");
    const adapter = new CloudPendingOrderAdapter();
    const order = await adapter.get("1");
    expect(order?.pricingBreakdownSnapshot.loyaltyDiscount).toBe(5000);
    expect(order?.pricingBreakdownSnapshot.loyaltyRedeemedPoints).toBe(50);
  });
});
