import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "nhadan.cart.v1";

const persistedLine = {
  id: "ci-legacy",
  productId: "1",
  variantId: "2",
  productCode: "P1",
  variantCode: "V2",
  productName: "Legacy product",
  variantName: "Legacy variant",
  categoryId: "10",
  categoryName: "Cat",
  qty: 1,
  unitPrice: 1000,
  lineSubtotal: 1000,
  catalogSource: "backend" as const,
  schemaVersion: 2 as const,
};

async function loadCartModule() {
  vi.resetModules();
  return import("./cart");
}

describe("cart localStorage stock normalization", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("strips legacy fake stock from persisted public backend cart lines", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      items: [{ ...persistedLine, stock: 999 }],
      selectedPromotionId: null,
      selectedPromotionMode: "auto",
    }));

    const { getCartSnapshot } = await loadCartModule();
    const [item] = getCartSnapshot();

    expect(item.variantId).toBe("2");
    expect(item.stock).toBeUndefined();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.items[0]).not.toHaveProperty("stock");
  });

  it("keeps new public cart lines without stock", async () => {
    const { cartActions, getCartSnapshot } = await loadCartModule();

    cartActions.add({
      productId: "1",
      variantId: "2",
      productCode: "P1",
      variantCode: "V2",
      productName: "Public product",
      variantName: "Public variant",
      categoryId: "10",
      categoryName: "Cat",
      qty: 1,
      unitPrice: 1000,
      catalogSource: "backend",
      schemaVersion: 2,
    });

    const [item] = getCartSnapshot();
    expect(item.variantId).toBe("2");
    expect(item.stock).toBeUndefined();
  });

  it("preserves persisted stock only when an explicit trusted marker is present", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      items: [{ ...persistedLine, stock: 7, stockSource: "trusted" }],
      selectedPromotionId: null,
      selectedPromotionMode: "auto",
    }));

    const { getCartSnapshot } = await loadCartModule();
    const [item] = getCartSnapshot();

    expect(item.stock).toBe(7);
    expect(item.stockSource).toBe("trusted");
  });
});

