import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CheckoutPage from "./Checkout";
import { buildCheckoutGiftSummaryLines, isGiftPromotionType, ShippingBlock } from "./Checkout";

const mocked = vi.hoisted(() => ({
  selectedPromotionId: "1",
  selectedPromotionMode: "manual" as "manual" | "auto",
  evaluateAll: [] as any[],
  pickBest: null as any,
  shippingQuote: { status: "incomplete" } as any,
  postSalesQuoteResult: null as any,
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/components/shared/AddressSelect", () => ({
  AddressSelect: ({ onChange }: { onChange: (v: any) => void }) => {
    const React = require("react");
    React.useEffect(() => {
      onChange({ provinceCode: "01", districtCode: "001", wardCode: "00001", provinceName: "A", districtName: "B", wardName: "C" });
    }, []);
    return <button data-testid="set-address" onClick={() => onChange({ provinceCode: "01", districtCode: "001", wardCode: "00001", provinceName: "A", districtName: "B", wardName: "C" })}>set-address</button>;
  },
}));
vi.mock("@/components/shared/AddressAutocomplete", () => ({ AddressAutocomplete: () => <div /> }));

vi.mock("@/lib/cart", () => ({
  useCart: () => [{
    id: "1",
    productId: "1",
    variantId: "1",
    productName: "A",
    qty: 1,
    unitPrice: 100000,
    lineSubtotal: 100000,
    stock: 10,
    catalogSource: "backend",
    schemaVersion: 2,
  }],
  useSelectedPromotionId: () => mocked.selectedPromotionId,
  useSelectedPromotionMode: () => mocked.selectedPromotionMode,
  cartActions: { clear: vi.fn(), replace: vi.fn(), setSelectedPromotion: vi.fn() },
}));

vi.mock("@/services", () => ({
  pendingOrders: { create: vi.fn() },
  promotions: {
    pickBest: vi.fn(async () => mocked.pickBest),
    evaluateAll: vi.fn(async () => mocked.evaluateAll),
  },
  shipping: { quote: vi.fn(async () => mocked.shippingQuote) },
  postSalesQuote: vi.fn(async () => mocked.postSalesQuoteResult),
}));

vi.mock("@/services/account/accountApi", () => ({ accountApi: { points: vi.fn(), pendingOrders: vi.fn(), me: vi.fn(), cancelPendingOrderForEdit: vi.fn() } }));

describe("Checkout promo test ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.selectedPromotionId = "1";
    mocked.selectedPromotionMode = "manual";
    mocked.evaluateAll = [
      { promotionId: "1", name: "Manual Promo A", type: "percent_discount", eligible: true, ruleSummary: "", discountAmount: 10000, shippingDiscountAmount: 0, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
    ];
    mocked.pickBest = null;
    mocked.shippingQuote = { status: "incomplete" };
    mocked.postSalesQuoteResult = null;
  });

  it("manual percent promo before address renders discount row", async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByTestId("checkout-effective-promotion-name").textContent).toBe("Manual Promo A"));
    const row = screen.getByTestId("checkout-promotion-discount");
    expect(row.textContent).toContain("Manual Promo A");
    expect(row.textContent).toMatch(/10\.000/);
  });

  it("blocks submit when street is missing and shows clear error", async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByText("Vui lòng nhập số nhà/tên đường.")).toBeTruthy());
    expect(screen.getByTestId("checkout-create-pending")).toBeDisabled();
  });

  it("manual fixed promo before address renders discount row", async () => {
    mocked.evaluateAll = [
      { promotionId: "1", name: "Fixed Promo", type: "fixed_discount", eligible: true, ruleSummary: "", discountAmount: 5000, shippingDiscountAmount: 0, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByTestId("checkout-effective-promotion-name").textContent).toBe("Fixed Promo"));
    expect(screen.getByTestId("checkout-promotion-discount").textContent).toMatch(/5\.000/);
  });

  it("manual BUY_X_GET_Y pre-address renders gift block and line", async () => {
    mocked.evaluateAll = [
      {
        promotionId: "1",
        name: "Gift Promo",
        type: "buy_x_get_y",
        eligible: true,
        ruleSummary: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "11", variantId: "22", productName: "Bánh tráng sate bò", variantName: "", qty: 1, unitPrice: 0, lineTotal: 0, promotionId: "1", promotionName: "Gift Promo" }],
      },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByTestId("checkout-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("checkout-promotion-gift-line-22").textContent).toContain("Bánh tráng sate bò ×1");
  });

  it("manual QUANTITY_GIFT pre-address with gift lines renders gift block", async () => {
    mocked.evaluateAll = [
      {
        promotionId: "1",
        name: "Quantity Gift Promo",
        type: "gift",
        eligible: true,
        ruleSummary: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "12", variantId: "23", productName: "Muối tôm", variantName: "", qty: 2, unitPrice: 0, lineTotal: 0, promotionId: "1", promotionName: "Quantity Gift Promo" }],
      },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByTestId("checkout-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("checkout-promotion-gift-line-23").textContent).toContain("Muối tôm ×2");
  });

  it("manual QUANTITY_GIFT pre-address without gift lines shows pending fallback", async () => {
    mocked.evaluateAll = [
      {
        promotionId: "1",
        name: "Quantity Gift Promo",
        type: "gift",
        eligible: true,
        ruleSummary: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByTestId("checkout-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("checkout-promotion-gifts-pending").textContent).toContain("Đang xác nhận quà tặng");
  });

  it("manual ineligible free shipping before address is not applied", async () => {
    mocked.evaluateAll = [
      { promotionId: "1", name: "FreeShip Promo", type: "free_shipping", eligible: false, ruleSummary: "", discountAmount: 0, shippingDiscountAmount: 20000, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByText("Vui lòng nhập số nhà/tên đường.")).toBeTruthy());
    expect(screen.queryByText("Miễn phí ship sẽ áp dụng sau khi nhập địa chỉ.")).toBeNull();
    expect(screen.queryByTestId("checkout-shipping-discount")).toBeNull();
  });

  it("manual ineligible promo only shows warning, not applied discount/gift preview", async () => {
    mocked.evaluateAll = [
      {
        promotionId: "1",
        name: "Manual Invalid Gift",
        type: "gift",
        eligible: false,
        reasonIfIneligible: "not enough",
        ruleSummary: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "11", variantId: "22", productName: "Stale Gift", qty: 1, unitPrice: 0, lineTotal: 0, promotionId: "1", promotionName: "Manual Invalid Gift" }],
      },
    ];
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByText("Vui lòng nhập số nhà/tên đường.")).toBeTruthy());
    expect(screen.queryByTestId("checkout-promotion-discount")).toBeNull();
    expect(screen.queryByTestId("checkout-promotion-gifts")).toBeNull();
  });

  it("after quote QUANTITY_GIFT with empty rewards still shows pending gift block", async () => {
    const oldMode = import.meta.env.MODE;
    try {
      (import.meta as any).env.MODE = "production";
      mocked.evaluateAll = [
        { promotionId: "1", name: "Quantity Gift Promo", type: "gift", eligible: true, ruleSummary: "", discountAmount: 0, shippingDiscountAmount: 0, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
      ];
      mocked.shippingQuote = { status: "quoted", fee: 38000 };
      mocked.postSalesQuoteResult = {
        quoteId: "q2",
        expiresAt: new Date().toISOString(),
        lines: [],
        rewardLines: [],
        pricingBreakdownSnapshot: { subtotal: 100000, manualDiscount: 0, promotionDiscount: 0, voucherDiscount: 0, shippingFee: 38000, shippingDiscount: 0, vatBase: 0, vatPercent: 0, vatAmount: 0, total: 138000 },
        shippingQuoteSnapshot: null,
        voucherSnapshot: null,
        loyaltySnapshot: null,
        effectivePromotionName: "Quantity Gift Promo",
        effectivePromotionId: 1,
        effectivePromotionType: "QUANTITY_GIFT",
        promotionSnapshot: { type: "QUANTITY_GIFT", giftLines: [] },
      };
      render(<CheckoutPage />);
      await waitFor(() => expect(screen.getByTestId("checkout-promotion-gifts")).toBeTruthy());
      expect(screen.getByTestId("checkout-promotion-gifts-pending")).toBeTruthy();
    } finally {
      (import.meta as any).env.MODE = oldMode;
    }
  });

  it("gift summary helper prefers rewardLines then promotionSnapshot giftLines", () => {
    const lines = buildCheckoutGiftSummaryLines(
      true,
      [{ productId: 44, variantId: 55, productName: "Server Gift", variantName: "V", quantity: 2, unitPrice: 0, lineSubtotal: 0, rewardLine: true, originalUnitPrice: 0 }],
      [{ productId: "66", variantId: "77", productName: "Snapshot Gift", variantName: "S", qty: 1 }],
      [{ productId: "11", variantId: "22", productName: "Preview Gift", variantName: "", qty: 1, unitPrice: 0, lineTotal: 0, promotionId: "1", promotionName: "Gift Promo" }],
    );
    expect(lines[0].key).toBe("55");
    expect(lines[0].label).toBe("Server Gift V");
    expect(lines[0].qty).toBe(2);
  });

  it("gift type helper supports FE/BE variants", () => {
    expect(isGiftPromotionType("buy_x_get_y")).toBe(true);
    expect(isGiftPromotionType("gift")).toBe(true);
    expect(isGiftPromotionType("BUY_X_GET_Y")).toBe(true);
    expect(isGiftPromotionType("QUANTITY_GIFT")).toBe(true);
  });

  it("Checkout shipping notice maps LOCAL_MO_CAY to a customer-facing label", () => {
    render(
      <ShippingBlock
        quote={{ status: "quoted", source: "local_rule", zoneCode: "LOCAL_MO_CAY", fee: 0, etaDays: { min: 1, max: 1 } }}
        loading={false}
        onRetry={vi.fn()}
        retryCooldown={0}
      />,
    );
    expect(screen.getByText(/Khu vực/i).textContent).toContain("Mỏ Cày");
    expect(screen.getByText(/Khu vực/i).textContent).not.toContain("LOCAL_MO_CAY");
    expect(screen.getByText(/Khu vực/i).textContent).toContain("Miễn phí giao hàng");
  });
});
