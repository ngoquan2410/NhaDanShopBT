import { beforeEach, describe, expect, it } from "vitest";
import { cartActions, getSelectedPromotionId, getSelectedPromotionMode, getCartSnapshot } from "./cart";

const line = {
  productId: "1",
  variantId: "1",
  productCode: "P1",
  variantCode: "V1",
  productName: "A",
  variantName: "V",
  categoryId: "10",
  categoryName: "C",
  qty: 1,
  unitPrice: 1000,
  stock: 10,
  catalogSource: "backend" as const,
  schemaVersion: 2 as const,
};

describe("cart promotion reset on topology changes", () => {
  beforeEach(() => {
    cartActions.clear();
  });

  it("remove resets selected promotion to auto", () => {
    cartActions.add(line);
    cartActions.setSelectedPromotion("promo-1", "manual");
    const id = getCartSnapshot()[0]?.id;
    if (!id) throw new Error("missing cart item id");
    cartActions.remove(id);
    expect(getSelectedPromotionId()).toBeNull();
    expect(getSelectedPromotionMode()).toBe("auto");
  });

  it("replace resets selected promotion to auto", () => {
    cartActions.add(line);
    cartActions.setSelectedPromotion("promo-1", "manual");
    cartActions.replace([{ ...line, id: "replaced", lineSubtotal: 1000 }]);
    expect(getSelectedPromotionId()).toBeNull();
    expect(getSelectedPromotionMode()).toBe("auto");
  });
});
