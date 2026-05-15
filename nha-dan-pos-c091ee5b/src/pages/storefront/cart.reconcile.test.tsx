import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const fetchMock = vi.fn();

vi.mock("@/services/catalog/publicCatalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/catalog/publicCatalog")>();
  return {
    ...mod,
    fetchPublicVariantAvailability: (...args: unknown[]) => fetchMock(...args),
  };
});

vi.mock("@/services", () => ({
  promotions: { evaluateAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("cart reconcile via public batch availability", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    fetchMock.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  const staleLine = (over: Record<string, unknown>) => ({
    id: "ci-stale",
    productId: "101",
    variantId: "202",
    productCode: "P101",
    variantCode: "V202",
    productName: "N",
    variantName: "V",
    categoryId: "10",
    categoryName: "Cat",
    qty: 20,
    unitPrice: 1000,
    lineSubtotal: 20000,
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

  it("cart_reconciles_missing_available_qty_from_public_batch", async () => {
    fetchMock.mockResolvedValue([
      { variantId: 202, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" },
    ]);
    await renderCartFromStorage(staleLine({}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const { getCartSnapshot } = await import("@/lib/cart");
    await waitFor(() => {
      const [row] = getCartSnapshot();
      expect(row.availableQty).toBe(9);
    });
  });

  it("cart_reconcile_clamps_stale_qty", async () => {
    fetchMock.mockResolvedValue([
      { variantId: 202, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" },
    ]);
    await renderCartFromStorage(staleLine({}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const { getCartSnapshot } = await import("@/lib/cart");
    await waitFor(() => {
      expect(getCartSnapshot()[0].qty).toBe(9);
    });
  });

  it("cart_reconcile_preserves_public_safe_fields_only", async () => {
    fetchMock.mockResolvedValue([
      Object.assign(
        { variantId: 202, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" },
        { stockQty: 999, remainingQty: 888 },
      ),
    ]);
    await renderCartFromStorage(staleLine({}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const { getCartSnapshot } = await import("@/lib/cart");
    await waitFor(() => {
      const [row] = getCartSnapshot();
      expect(row.availableQty).toBe(9);
      expect(row).not.toHaveProperty("stockQty");
      expect(row).not.toHaveProperty("remainingQty");
    });
  });

  it("cart_reconcile_single_batch_request_for_multiple_lines", async () => {
    fetchMock.mockResolvedValue([
      { variantId: 202, availableQty: 5, availabilityStatus: "IN_STOCK", sellUnit: "cái" },
      { variantId: 303, availableQty: 4, availabilityStatus: "IN_STOCK", sellUnit: "cái" },
    ]);
    window.localStorage.setItem(
      "nhadan.cart.v1",
      JSON.stringify({
        items: [
          staleLine({ id: "a", variantId: "202", qty: 10 }),
          staleLine({ id: "b", variantId: "303", productId: "102", productCode: "P2", variantCode: "V3" }),
        ],
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const arg0 = fetchMock.mock.calls[0][0] as string[];
    expect(arg0.sort().join(",")).toBe("202,303");
  });
});
