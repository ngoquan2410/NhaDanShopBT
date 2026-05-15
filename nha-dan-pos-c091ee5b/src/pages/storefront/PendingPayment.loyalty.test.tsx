import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingPaymentPage from "./PendingPayment";

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "1" }),
}));

vi.mock("@/services", () => ({
  pendingOrders: {
    get: vi.fn(async () => ({
      id: "1",
      code: "PO-1",
      status: "pending_payment",
      paymentMethod: "bank_transfer",
      paymentReference: "R",
      createdAt: new Date().toISOString(),
      lines: [],
      giftLinesSnapshot: [],
      pricingBreakdownSnapshot: {
        subtotal: 100000, manualDiscount: 0, promotionDiscount: 0, voucherDiscount: 0,
        loyaltyDiscount: 5000, loyaltyRedeemedPoints: 50, shippingFee: 0, shippingDiscount: 0, vat: 0, total: 95000,
      },
    })),
    markWaitingConfirm: vi.fn(),
    changePaymentMethod: vi.fn(),
  },
  storeSettings: { getPaymentSettings: vi.fn(async () => ({})) },
  vietQr: { generate: vi.fn() },
}));

vi.mock("@/services/account/accountApi", () => ({ accountApi: { cancelPendingOrderForEdit: vi.fn() } }));

describe("PendingPayment loyalty rows", () => {
  it("renders loyalty discount row when loyalty > 0", async () => {
    render(<PendingPaymentPage />);
    expect(await screen.findByTestId("pending-loyalty-discount")).toBeTruthy();
    expect(await screen.findByTestId("loyalty-redeemed-points")).toBeTruthy();
  });
});
