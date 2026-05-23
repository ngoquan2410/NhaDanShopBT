import { describe, expect, it } from "vitest";
import { isPosRenderableProduct, isPosSellableVariant, pickPosSellableVariant } from "./POS";

describe("POS sellable catalog helpers", () => {
  it("excludes non-sellable variants and products without sellable variants", () => {
    expect(isPosSellableVariant({ active: true, isSellable: false })).toBe(false);
    expect(isPosRenderableProduct({ active: true, variants: [{ active: true, isSellable: false }] })).toBe(false);
  });

  it("selects default/first variant only from the active sellable set", () => {
    const picked = pickPosSellableVariant({
      variants: [
        { active: true, isSellable: false, isDefault: true, code: "NS" },
        { active: false, isSellable: true, isDefault: false, code: "OFF" },
        { active: true, isSellable: true, isDefault: false, code: "OK" },
      ],
    } as { variants: Array<{ active?: boolean; isSellable?: boolean; isDefault?: boolean; code: string }> });

    expect(picked?.code).toBe("OK");
  });
});

