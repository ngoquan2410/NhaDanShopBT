import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import { resolveReceiptLineIdentity } from "@/pages/admin/GoodsReceiptCreate";
import { normalizeComboComponentFromVariantHit } from "@/pages/admin/Combos";
import { adminCombos } from "@/services/adminBackend";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
  downloadAdminBlob: vi.fn(),
}));

describe("B2.2 hardening: receipt/combo contracts", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("uses selected productId/variantId directly for receipt line mapping", () => {
    const fallback = vi.fn(() => ({ productId: 1, variantId: 2 }));
    const resolved = resolveReceiptLineIdentity({ productId: 88, variantId: 99 }, fallback);
    expect(resolved).toEqual({ productId: 88, variantId: 99 });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back for legacy/import rows missing ids", () => {
    const fallback = vi.fn(() => ({ productId: 7, variantId: 11 }));
    const resolved = resolveReceiptLineIdentity({ productId: undefined, variantId: undefined }, fallback);
    expect(resolved).toEqual({ productId: 7, variantId: 11 });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("normalizes combo variant search hit to product-level component", () => {
    const normalized = normalizeComboComponentFromVariantHit({
      variantId: "2002",
      variantCode: "V-2002",
      variantName: "Variant B",
      productId: "1001",
      productCode: "P-1001",
      productName: "Product A",
      productType: "SINGLE",
      active: true,
      isSellable: true,
      sellUnit: "cai",
      importUnit: "cai",
      categoryId: "10",
      categoryName: "Cat",
      stockQty: 14,
      sellPrice: 12000,
      costPrice: 7000,
      piecesPerUnit: 1,
      minStockQty: 0,
      expiryDays: null,
    });
    expect(normalized.productId).toBe("1001");
    expect(normalized.variantId).toBe("");
    expect(normalized.variantName).toBe("");
  });

  it("combo save payload includes productId + quantity only", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      id: 1,
      code: "COMBO01",
      name: "Combo test",
      active: true,
      stockQty: 0,
      items: [{ productId: 10, productName: "P", quantity: 2 }],
    });
    await adminCombos.save({
      name: "Combo test",
      price: 100000,
      components: [
        { productId: "10", variantId: "200", productName: "P", variantName: "V", quantity: 2, stock: 0 },
      ],
    });

    const request = vi.mocked(adminApi.adminFetchJson).mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? "{}") as { items?: Array<Record<string, unknown>> };
    expect(body.items).toEqual([{ productId: 10, quantity: 2 }]);
    expect(Object.prototype.hasOwnProperty.call(body.items?.[0] ?? {}, "variantId")).toBe(false);
  });
});
