import { describe, expect, it } from "vitest";
import { buildVariantsForProductImportCreate } from "@/lib/productImportSavePayload";

const baseDraft = {
  sellPrice: 10000,
  costPrice: 8000,
  stock: 5,
  sellUnit: "Hộp",
  importUnit: "Thùng",
  piecesPerImportUnit: 12,
  expiryDays: 30,
  minStock: 2,
  active: true,
  isSellable: true as boolean | undefined,
  isSellableInvalid: false as boolean | undefined,
};

describe("buildVariantsForProductImportCreate", () => {
  it("single variant with blank code uses productCode", () => {
    const payload = buildVariantsForProductImportCreate("RBCT", "Rong biển", [{
      ...baseDraft,
      code: "",
      name: "",
    }]);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.code).toBe("RBCT");
    expect(payload[0]?.name).toBe("Rong biển");
    expect(payload[0]?.isDefault).toBe(true);
    expect(payload[0]?.isSellable).toBe(true);
  });

  it("second variant blank code gets padded suffix after productCode", () => {
    const payload = buildVariantsForProductImportCreate("RBCT", "Rong biển", [
      { ...baseDraft, code: "RBCT", name: "Rong biển" },
      { ...baseDraft, code: "", name: "Lốc" },
    ]);
    expect(payload[1]?.code).toBe("RBCT-02");
    expect(payload[1]?.isDefault).toBe(false);
  });
});
