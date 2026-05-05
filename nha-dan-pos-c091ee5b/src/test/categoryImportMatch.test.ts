import { describe, expect, it } from "vitest";
import {
  findCategoryByImportedName,
  isImportedCategoryNew,
  normalizeCategoryNameForMatch,
} from "@/lib/categoryImportMatch";

describe("categoryImportMatch", () => {
  const cats = [{ id: "1", name: "Rong Biển", active: true as boolean }];

  it("normalizeCategoryNameForMatch collapses whitespace and lowercases", () => {
    expect(normalizeCategoryNameForMatch(" Rong  Biển ")).toBe(normalizeCategoryNameForMatch("rong biển"));
  });

  it("findCategoryByImportedName resolves spacing/case variants to canonical name", () => {
    expect(findCategoryByImportedName(cats, "Rong Biển ")?.name).toBe("Rong Biển");
    expect(findCategoryByImportedName(cats, "rong biển")?.name).toBe("Rong Biển");
  });

  it("isImportedCategoryNew is true only when no normalized match exists", () => {
    expect(isImportedCategoryNew(cats, "Rong Biển")).toBe(false);
    expect(isImportedCategoryNew(cats, " Hải Sản ")).toBe(true);
    expect(isImportedCategoryNew(cats, "  ")).toBe(false);
  });
});
