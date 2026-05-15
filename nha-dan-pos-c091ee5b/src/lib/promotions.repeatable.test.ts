import { describe, expect, it } from "vitest";
import { makeEmptyPromotion, migratePromotion } from "./promotions";

describe("promotion repeatable defaults and mapping", () => {
  it("new buy-x-get-y and gift promotions default repeatable=false", () => {
    const bxgy = makeEmptyPromotion("buy-x-get-y");
    const gift = makeEmptyPromotion("gift");
    expect(bxgy.type).toBe("buy-x-get-y");
    expect(gift.type).toBe("gift");
    if (bxgy.type === "buy-x-get-y") expect(bxgy.repeatable).toBe(false);
    if (gift.type === "gift") expect(gift.repeatable).toBe(false);
  });

  it("migratePromotion keeps repeatable from backend payload", () => {
    const gift = migratePromotion({
      type: "gift",
      name: "Gift A",
      repeatable: true,
      triggerType: "min-order",
      triggerValue: 100000,
      giftItems: [{ productId: "2", productName: "P", quantity: 1 }],
    });
    expect(gift.type).toBe("gift");
    if (gift.type === "gift") expect(gift.repeatable).toBe(true);
  });
});

