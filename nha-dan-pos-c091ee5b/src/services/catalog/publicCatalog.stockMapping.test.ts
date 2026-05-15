import { describe, expect, it } from "vitest";
import { mapProduct } from "./publicCatalog";

describe("public catalog storefront mapping", () => {
  it("public_catalog_does_not_map_raw_stock_fields", () => {
    const raw = {
      id: 99,
      code: "RAW",
      name: "Raw product",
      categoryId: 1,
      categoryName: "C",
      active: true,
      variants: [
        {
          id: 1,
          variantCode: "V",
          variantName: "Var",
          sellUnit: "cái",
          sellPrice: 5000,
          isDefault: true,
          stockQty: 42,
          remainingQty: 40,
          minStockQty: 5,
          costPrice: 1,
        },
      ],
    };
    const p = mapProduct(raw as never);
    expect(p.variants).toHaveLength(1);
    const v = p.variants[0];
    expect(v).not.toHaveProperty("stockQty");
    expect(v).not.toHaveProperty("remainingQty");
    expect(v).not.toHaveProperty("stock");
    expect(v).not.toHaveProperty("minStock");
  });

  it("public_catalog_adapter_maps_available_qty_not_raw_stock_fields", () => {
    const raw = {
      id: 1,
      code: "A",
      name: "A",
      categoryId: 1,
      categoryName: "C",
      active: true,
      variants: [{
        id: 2,
        variantCode: "V",
        variantName: "V",
        sellUnit: "chai",
        sellPrice: 1000,
        isDefault: true,
        availableQty: 11,
        availabilityStatus: "IN_STOCK",
        stockQty: 999,
        remainingQty: 888,
      }],
    };
    const p = mapProduct(raw as never);
    const v = p.variants[0];
    expect(v.availableQty).toBe(11);
    expect(v.availabilityStatus).toBe("IN_STOCK");
    expect(v.available).toBe(true);
    expect(v).not.toHaveProperty("stockQty");
    expect(v).not.toHaveProperty("remainingQty");
  });

  it("maps explicit public availability booleans only", () => {
    const outFalse = mapProduct({
      id: 1,
      code: "A",
      name: "A",
      categoryId: 1,
      categoryName: "C",
      active: true,
      variants: [{ id: 1, variantCode: "V", variantName: "V", sellUnit: "cái", sellPrice: 1, isDefault: true, available: false }],
    } as never);
    expect(outFalse.variants[0].available).toBe(false);

    const outTrue = mapProduct({
      id: 2,
      code: "B",
      name: "B",
      categoryId: 1,
      categoryName: "C",
      active: true,
      variants: [{ id: 1, variantCode: "V", variantName: "V", sellUnit: "cái", sellPrice: 1, isDefault: true, inStock: true }],
    } as never);
    expect(outTrue.variants[0].available).toBe(true);
  });
});
