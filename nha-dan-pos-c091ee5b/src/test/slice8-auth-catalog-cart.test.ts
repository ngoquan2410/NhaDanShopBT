import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBackendCartLine } from "@/lib/cart";
import { mapProduct } from "@/services/catalog/publicCatalog";

describe("Slice 8 unified auth/catalog/cart contracts", () => {
  it("adminApi has no prompt auth and uses the unified session key", () => {
    const source = readFileSync(resolve(process.cwd(), "src/services/auth/adminApi.ts"), "utf8");
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("nhadan.auth.session.v1");
    expect(source).not.toContain("const STORAGE_KEY = \"nhadan.adminAuth.session\"");
  });

  it("cart rejects legacy/mock ids and accepts backend numeric ids only", () => {
    expect(isBackendCartLine({ productId: "1", variantId: "v1", qty: 1, catalogSource: "backend", schemaVersion: 2 })).toBe(false);
    expect(isBackendCartLine({ productId: "1", variantId: "2", qty: 1, catalogSource: "mock" as never, schemaVersion: 2 })).toBe(false);
    expect(isBackendCartLine({ productId: "1", variantId: "2", qty: 1, catalogSource: "backend", schemaVersion: 2 })).toBe(true);
  });

  it("public catalog adapter maps backend product/variant ids as numeric strings and filters non-sellable variants", () => {
    const p = mapProduct({
      id: 10,
      code: "P10",
      name: "Backend Product",
      categoryId: 3,
      categoryName: "Cat",
      active: true,
      variants: [
        { id: 101, variantCode: "V101", variantName: "Sellable", sellUnit: "cái", sellPrice: 1000, stockQty: 5, isSellable: true },
        { id: 102, variantCode: "V102", variantName: "Raw", sellUnit: "kg", sellPrice: 1000, stockQty: 5, isSellable: false },
      ],
    });
    expect(p.id).toBe("10");
    expect(p.variants.map((v) => v.id)).toEqual(["101"]);
  });
});

