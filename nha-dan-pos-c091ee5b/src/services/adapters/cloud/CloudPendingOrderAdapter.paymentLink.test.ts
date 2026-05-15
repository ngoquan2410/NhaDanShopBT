import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storefrontFetchMock = vi.fn();

vi.mock("@/lib/storefrontAuthHeaders", () => ({
  storefrontAuthHeaders: vi.fn(() => ({})),
  storefrontFetch: (...args: unknown[]) => storefrontFetchMock(...args),
}));

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

function rawBackend(overrides: Record<string, unknown>) {
  return {
    id: 1,
    code: "DH-20260512-001",
    createdAt: "2026-05-12T10:00:00",
    status: "pending_payment",
    paymentMethod: "bank_transfer",
    totalAmount: 100000,
    pricingBreakdownSnapshot: {
      subtotal: 100000,
      manualDiscount: 0,
      promotionDiscount: 0,
      voucherDiscount: 0,
      shippingFee: 0,
      shippingDiscount: 0,
      vatBase: 0,
      vatPercent: 0,
      vatAmount: 0,
      total: 100000,
    },
    ...overrides,
  };
}

describe("CloudPendingOrderAdapter — bank link aggregate mapping", () => {
  beforeEach(() => {
    storefrontFetchMock.mockReset();
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps aggregate sum/count, paymentDelta, latest LINKED event id/amount", async () => {
    storefrontFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          rawBackend({
            paymentLinkStatus: "EXACT_PAID",
            paymentDelta: 0,
            linkedPaymentEventId: "987",
            linkedPaymentAmount: "60000",
            linkedPaymentTotal: "100000",
            linkedPaymentCount: 2,
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { CloudPendingOrderAdapter } = await import("./CloudPendingOrderAdapter");
    const order = await new CloudPendingOrderAdapter().get("1");
    expect(order).toBeTruthy();
    expect(order?.paymentLinkStatus).toBe("EXACT_PAID");
    expect(order?.paymentDelta).toBe(0);
    expect(order?.linkedPaymentEventId).toBe("987");
    expect(order?.linkedPaymentAmount).toBe(60000);
    expect(order?.linkedPaymentTotal).toBe(100000);
    expect(order?.linkedPaymentCount).toBe(2);
    expect(order?.totalAmount).toBe(100000);
  });

  it("treats missing aggregate as undefined sum / zero count", async () => {
    storefrontFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(rawBackend({ paymentLinkStatus: "NONE" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { CloudPendingOrderAdapter } = await import("./CloudPendingOrderAdapter");
    const order = await new CloudPendingOrderAdapter().get("1");
    expect(order?.linkedPaymentTotal).toBeUndefined();
    expect(order?.linkedPaymentCount).toBe(0);
    expect(order?.linkedPaymentEventId).toBeUndefined();
    expect(order?.linkedPaymentAmount).toBeUndefined();
    expect(order?.paymentDelta).toBeUndefined();
  });

  it("UNDERPAID_LINKED: negative paymentDelta surfaces, count >=1, sum < total", async () => {
    storefrontFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          rawBackend({
            paymentLinkStatus: "UNDERPAID_LINKED",
            paymentDelta: -20000,
            linkedPaymentEventId: "21",
            linkedPaymentAmount: "80000",
            linkedPaymentTotal: "80000",
            linkedPaymentCount: 1,
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { CloudPendingOrderAdapter } = await import("./CloudPendingOrderAdapter");
    const order = await new CloudPendingOrderAdapter().get("1");
    expect(order?.paymentLinkStatus).toBe("UNDERPAID_LINKED");
    expect(order?.paymentDelta).toBe(-20000);
    expect(order?.linkedPaymentTotal).toBe(80000);
    expect(order?.linkedPaymentCount).toBe(1);
  });

  it("OVERPAID_LINKED preserves positive delta and sum > total", async () => {
    storefrontFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          rawBackend({
            paymentLinkStatus: "OVERPAID_LINKED",
            paymentDelta: 50000,
            linkedPaymentEventId: "99",
            linkedPaymentAmount: "150000",
            linkedPaymentTotal: "150000",
            linkedPaymentCount: 1,
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { CloudPendingOrderAdapter } = await import("./CloudPendingOrderAdapter");
    const order = await new CloudPendingOrderAdapter().get("1");
    expect(order?.paymentLinkStatus).toBe("OVERPAID_LINKED");
    expect(order?.paymentDelta).toBe(50000);
    expect(order?.linkedPaymentTotal).toBe(150000);
  });
});
