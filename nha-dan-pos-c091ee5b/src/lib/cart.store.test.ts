import { describe, expect, it, beforeEach } from "vitest";
import { cartActions, getSelectedPromotionId, getSelectedPromotionMode } from "@/lib/cart";

describe("cart store promotion selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cartActions.clear();
  });

  it("setSelectedPromotionId enforces manual mode", () => {
    cartActions.setSelectedPromotionId("101");
    expect(getSelectedPromotionId()).toBe("101");
    expect(getSelectedPromotionMode()).toBe("manual");
  });

  it("clearSelectedPromotion resets id and keeps requested mode", () => {
    cartActions.setSelectedPromotion("22", "auto");
    cartActions.clearSelectedPromotion("auto");
    expect(getSelectedPromotionId()).toBeNull();
    expect(getSelectedPromotionMode()).toBe("auto");
  });
});
