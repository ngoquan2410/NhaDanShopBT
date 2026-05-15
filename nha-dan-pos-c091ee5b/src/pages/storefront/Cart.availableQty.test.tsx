import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/catalog/publicCatalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/catalog/publicCatalog")>();
  return {
    ...mod,
    fetchPublicVariantAvailability: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/services", () => ({
  promotions: { evaluateAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("Cart page availableQty UX", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  const backendLine = (over: Record<string, unknown>) => ({
    id: "ci-ui",
    productId: "1",
    variantId: "2",
    productCode: "P1",
    variantCode: "V2",
    productName: "N",
    variantName: "V",
    categoryId: "10",
    categoryName: "Cat",
    qty: 1,
    unitPrice: 1000,
    lineSubtotal: 1000,
    catalogSource: "backend",
    schemaVersion: 2,
    ...over,
  });

  async function renderCartFromStorage(line: Record<string, unknown>) {
    window.localStorage.setItem(
      "nhadan.cart.v1",
      JSON.stringify({
        items: [line],
        selectedPromotionId: null,
        selectedPromotionMode: "auto",
      }),
    );
    await import("@/lib/cart");
    const { default: CartPage } = await import("./Cart");
    render(
      <MemoryRouter>
        <CartPage />
      </MemoryRouter>,
    );
  }

  it("cart_page_stepper_uses_available_qty_max", async () => {
    await renderCartFromStorage(
      backendLine({
        qty: 9,
        lineSubtotal: 9000,
        availableQty: 9,
        availabilityStatus: "IN_STOCK",
        sellUnit: "cái",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("cart-promo-eval-status").textContent).toMatch(/loaded|idle/));
    const plus = await screen.findByTestId("storefront-cart-line-qty-plus-1-2");
    for (let i = 0; i < 15; i++) fireEvent.click(plus);
    const input = screen.getByTestId("storefront-cart-line-qty-1-2") as HTMLInputElement;
    expect(input.value).toBe("9");
  });

  it("cart_page_shows_green_available_qty", async () => {
    await renderCartFromStorage(
      backendLine({
        qty: 2,
        lineSubtotal: 2000,
        availableQty: 9,
        availabilityStatus: "IN_STOCK",
        sellUnit: "cái",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("storefront-cart-line-availability")).toBeTruthy());
    const el = screen.getByTestId("storefront-cart-line-availability");
    expect(el.textContent).toContain("Còn 9 cái");
    expect(el.className).toMatch(/text-success/);
  });
});
