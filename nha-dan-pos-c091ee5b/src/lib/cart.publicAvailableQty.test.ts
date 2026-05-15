import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "nhadan.cart.v1";

const baseAdd = {
  productId: "101",
  variantId: "202",
  productCode: "P101",
  variantCode: "V202",
  productName: "Item",
  variantName: "Var",
  categoryId: "10",
  categoryName: "Cat",
  unitPrice: 1000,
  catalogSource: "backend" as const,
  schemaVersion: 2 as const,
};

async function loadCartModule() {
  vi.resetModules();
  return import("./cart");
}

describe("cart public availableQty caps", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("cart_public_available_qty_caps_set_qty", async () => {
    const { cartActions, getCartSnapshot } = await loadCartModule();
    cartActions.add({ ...baseAdd, qty: 1, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" });
    const id = getCartSnapshot()[0].id;
    cartActions.setQty(id, 20);
    expect(getCartSnapshot()[0].qty).toBe(9);
  });

  it("cart_public_available_qty_caps_add_existing", async () => {
    const { cartActions, getCartSnapshot } = await loadCartModule();
    cartActions.add({ ...baseAdd, qty: 8, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" });
    cartActions.add({ ...baseAdd, qty: 5, availableQty: 9, availabilityStatus: "IN_STOCK", sellUnit: "cái" });
    expect(getCartSnapshot()).toHaveLength(1);
    expect(getCartSnapshot()[0].qty).toBe(9);
  });

  it("cart_trusted_stock_still_supported", async () => {
    const { cartActions, getCartSnapshot } = await loadCartModule();
    cartActions.add({
      ...baseAdd,
      qty: 1,
      stock: 5,
      stockSource: "trusted" as const,
    });
    const id = getCartSnapshot()[0].id;
    cartActions.setQty(id, 99);
    expect(getCartSnapshot()[0].qty).toBe(5);
  });
});

describe("cart persisted public availability", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("cart_preserves_public_available_qty_but_strips_raw_stock", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: [
          {
            id: "ci-x",
            ...baseAdd,
            qty: 2,
            lineSubtotal: 2000,
            availableQty: 9,
            availabilityStatus: "IN_STOCK",
            sellUnit: "cái",
            stock: 999,
          },
        ],
        selectedPromotionId: null,
        selectedPromotionMode: "auto",
      }),
    );

    const { getCartSnapshot } = await loadCartModule();
    const [item] = getCartSnapshot();
    expect(item.availableQty).toBe(9);
    expect(item.stock).toBeUndefined();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.items[0].stock).toBeUndefined();
    expect(stored.items[0].availableQty).toBe(9);
  });
});
