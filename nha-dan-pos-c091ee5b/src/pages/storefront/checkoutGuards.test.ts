import { describe, expect, it } from "vitest";
import { storefrontRequiresBackendQuoteForCheckout } from "./checkoutGuards";

describe("checkoutGuards", () => {
  it("storefront uses backend quote as pricing source of truth", () => {
    expect(storefrontRequiresBackendQuoteForCheckout()).toBe(true);
  });
});
