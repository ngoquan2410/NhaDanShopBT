import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CartPage from "./Cart";

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const mockedState = vi.hoisted(() => {
  const defaultCartLine = () => ({
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
  });
  return {
    defaultCartLine,
    selectedPromotionId: "2",
    evalResponse: [] as any[],
    /** Refreshed in `beforeEach` so Cart promo `useEffect([items])` re-runs when mocks change. */
    cartItems: [defaultCartLine()],
    cartSpy: {
      setSelectedPromotion: vi.fn(),
      setQty: vi.fn(),
      remove: vi.fn(),
      clearSelectedPromotion: vi.fn(),
    },
  };
});

vi.mock("@/services/catalog/publicCatalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/catalog/publicCatalog")>();
  return {
    ...mod,
    fetchPublicVariantAvailability: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/cart", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cart")>("@/lib/cart");
  const c = actual.cartActions;
  mockedState.cartSpy.setSelectedPromotion.mockImplementation((a: string | null, b: "auto" | "manual") =>
    c.setSelectedPromotion(a, b));
  mockedState.cartSpy.setQty.mockImplementation((id: string, q: number) => c.setQty(id, q));
  mockedState.cartSpy.remove.mockImplementation((id: string) => c.remove(id));
  mockedState.cartSpy.clearSelectedPromotion.mockImplementation((mode?: "auto" | "manual") =>
    c.clearSelectedPromotion(mode));
  return {
    ...actual,
    useCart: () => mockedState.cartItems,
    useSelectedPromotionId: () => mockedState.selectedPromotionId,
    useSelectedPromotionMode: () => "manual" as const,
    cartActions: { ...c, ...mockedState.cartSpy },
  };
});

vi.mock("@/services", () => ({
  promotions: {
    evaluateAll: vi.fn(async () => mockedState.evalResponse),
  },
}));

describe("Cart promo render flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedState.cartItems = [mockedState.defaultCartLine()];
    mockedState.selectedPromotionId = "2";
    mockedState.evalResponse = [
      { promotionId: "1", name: "FS", type: "free_shipping", eligible: true, ruleSummary: "", reasonIfIneligible: "", discountAmount: 0, shippingDiscountAmount: 20000, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
      { promotionId: "2", name: "Manual Invalid", type: "percent_discount", eligible: false, ruleSummary: "r", reasonIfIneligible: "not enough", discountAmount: 0, shippingDiscountAmount: 0, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
    ];
  });

  it("loading does not clear stale selection", async () => {
    render(<CartPage />);
    expect(screen.getByTestId("cart-promo-eval-status").textContent).toBe("loading");
    expect(mockedState.cartSpy.clearSelectedPromotion).not.toHaveBeenCalled();
  });

  it("loaded + missing selected promotion clears selection in auto mode", async () => {
    mockedState.evalResponse = [
      { promotionId: "1", name: "FS", type: "free_shipping", eligible: true, ruleSummary: "", reasonIfIneligible: "", discountAmount: 0, shippingDiscountAmount: 20000, voucherDiscountAmount: 0, affectedLines: [], giftLines: [] },
    ];
    mockedState.cartItems = [mockedState.defaultCartLine()];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-promo-eval-status").textContent).toBe("loaded"));
    await waitFor(() => {
      expect(mockedState.cartSpy.clearSelectedPromotion).toHaveBeenCalledWith("auto");
    });
  });

  it("loaded + selected in list but ineligible keeps selection and shows reason", async () => {
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-promo-eval-status").textContent).toBe("loaded"));
    expect(screen.getByTestId("cart-promo-selected-id").textContent).toBe("2");
    expect(screen.getByTestId("cart-promo-selected-mode").textContent).toBe("manual");
    expect(mockedState.cartSpy.clearSelectedPromotion).not.toHaveBeenCalled();
    expect(screen.getByText(/khuyến mãi đã chọn hiện chưa đủ điều kiện/i)).toBeTruthy();
    expect(screen.queryByTestId("cart-summary-promotion-gifts")).toBeNull();
  });

  it("ineligible manual selection does not apply stale gift/discount summary", async () => {
    mockedState.selectedPromotionId = "old-gift";
    mockedState.evalResponse = [
      {
        promotionId: "old-gift",
        name: "Old Gift",
        type: "gift",
        eligible: false,
        ruleSummary: "",
        reasonIfIneligible: "removed items",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "99", variantId: "99", productName: "Stale Gift", qty: 1 }],
      },
      {
        promotionId: "auto-percent",
        name: "Auto Percent",
        type: "percent_discount",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 12000,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-promo-eval-status").textContent).toBe("loaded"));
    expect(screen.queryByText("Stale Gift")).toBeNull();
    expect(screen.queryByTestId("cart-summary-promotion-gifts")).toBeNull();
    expect(screen.getByText(/khuyến mãi \(Auto Percent\)/i)).toBeTruthy();
  });

  it("summary shows gift block for selected BUY_X_GET_Y with gift lines", async () => {
    mockedState.selectedPromotionId = "9";
    mockedState.evalResponse = [
      {
        promotionId: "9",
        name: "Buy X Get Y Promo",
        type: "buy_x_get_y",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "11", variantId: "22", productName: "Bánh tráng", qty: 1 }],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-summary-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("cart-summary-promotion-gift-line-22").textContent).toContain("Bánh tráng ×1");
  });

  it("summary shows gift block for selected QUANTITY_GIFT with gift lines", async () => {
    mockedState.selectedPromotionId = "10";
    mockedState.evalResponse = [
      {
        promotionId: "10",
        name: "Quantity Gift Promo",
        type: "gift",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [{ productId: "12", variantId: "23", productName: "Muối tôm", qty: 2 }],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-summary-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("cart-summary-promotion-gift-line-23").textContent).toContain("Muối tôm ×2");
  });

  it("summary shows pending fallback when selected gift promo has empty gift lines", async () => {
    mockedState.selectedPromotionId = "11";
    mockedState.evalResponse = [
      {
        promotionId: "11",
        name: "Gift Pending Promo",
        type: "gift",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 0,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByTestId("cart-summary-promotion-gifts")).toBeTruthy());
    expect(screen.getByTestId("cart-summary-promotion-gifts-pending").textContent).toContain("Đang xác nhận quà tặng");
  });

  it("summary still shows discount row for selected percent promo", async () => {
    mockedState.selectedPromotionId = "12";
    mockedState.evalResponse = [
      {
        promotionId: "12",
        name: "Percent Promo",
        type: "percent_discount",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 10000,
        shippingDiscountAmount: 0,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByText(/khuyến mãi \(Percent Promo\)/i)).toBeTruthy());
  });

  it("selected free shipping keeps shipping note and does not reduce total in cart", async () => {
    mockedState.selectedPromotionId = "13";
    mockedState.evalResponse = [
      {
        promotionId: "13",
        name: "FreeShip Promo",
        type: "free_shipping",
        eligible: true,
        ruleSummary: "",
        reasonIfIneligible: "",
        discountAmount: 0,
        shippingDiscountAmount: 20000,
        voucherDiscountAmount: 0,
        affectedLines: [],
        giftLines: [],
      },
    ];
    render(<CartPage />);
    await waitFor(() => expect(screen.getByText(/miễn phí ship sẽ được xác nhận sau khi nhập địa chỉ giao hàng/i)).toBeTruthy());
    const totalRow = screen.getByText("Tổng cộng").parentElement;
    expect(totalRow?.textContent).toContain("100.000");
  });
});
