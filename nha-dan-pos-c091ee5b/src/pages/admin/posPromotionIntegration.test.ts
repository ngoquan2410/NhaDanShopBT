import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const posSource = readFileSync(resolve(here, "POS.tsx"), "utf8");
const checkoutSource = readFileSync(resolve(here, "..", "storefront", "Checkout.tsx"), "utf8");

describe("promotion FE-BE integration guards", () => {
  it("POS uses backend promotion CRUD/evaluation, not local promotion eligibility", () => {
    expect(posSource).toContain("promotionsCrud.list");
    expect(posSource).toContain("promotionEvaluationService.evaluateAll");
    expect(posSource).not.toContain("applyPromotionToCart");
    expect(posSource).not.toContain("promotions, products: storeProducts");
  });

  it("Checkout handles backend pick-best preview failures", () => {
    expect(checkoutSource).toContain("promotions.pickBest(ctx)");
    expect(checkoutSource).toContain(".catch(() =>");
    expect(checkoutSource).toContain("setBestPromo(null)");
  });
});

