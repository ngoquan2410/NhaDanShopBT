import { describe, expect, it } from "vitest";
import { storefrontAvailabilityTextClass, storefrontAvailabilityUi } from "./storefrontAvailability";
import type { StorefrontVariant } from "@/services/catalog/publicCatalog";

const v = (partial: Partial<StorefrontVariant> & Pick<StorefrontVariant, "id" | "code" | "name" | "sellUnit" | "sellPrice">): StorefrontVariant => ({
  id: partial.id ?? "1",
  code: partial.code ?? "C",
  name: partial.name ?? "N",
  sellUnit: partial.sellUnit ?? "cái",
  sellPrice: partial.sellPrice ?? 1,
  ...partial,
});

describe("storefrontAvailabilityTextClass", () => {
  it("maps ok tone to text-success", () => {
    expect(storefrontAvailabilityTextClass("ok")).toContain("text-success");
  });
  it("maps warn tone to text-warning", () => {
    expect(storefrontAvailabilityTextClass("warn")).toContain("text-warning");
  });
  it("maps out tone to text-danger", () => {
    expect(storefrontAvailabilityTextClass("out")).toContain("text-danger");
  });
});

describe("storefrontAvailabilityUi", () => {
  it("in-stock numeric uses success class", () => {
    const ui = storefrontAvailabilityUi(v({ availableQty: 5, availabilityStatus: "IN_STOCK" }));
    expect(ui.text).toMatch(/Còn 5/);
    expect(ui.textClassName).toContain("text-success");
  });
  it("low stock uses warning class", () => {
    const ui = storefrontAvailabilityUi(v({ availableQty: 2, availabilityStatus: "LOW_STOCK" }));
    expect(ui.textClassName).toContain("text-warning");
  });
  it("out of stock uses danger class", () => {
    const ui = storefrontAvailabilityUi(v({ availableQty: 0, availabilityStatus: "OUT_OF_STOCK" }));
    expect(ui.text).toBe("Hết hàng");
    expect(ui.textClassName).toContain("text-danger");
  });
});
