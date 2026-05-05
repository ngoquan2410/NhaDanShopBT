import type { ProductVariant } from "@/lib/catalog-types";

/** Minimal variant shape from product import review before POST /api/products. */
export interface ProductImportVariantDraft {
  code: string;
  name: string;
  sellPrice: number;
  costPrice: number;
  stock: number;
  sellUnit: string;
  importUnit: string;
  piecesPerImportUnit: number;
  expiryDays: number;
  minStock: number;
  active: boolean;
  isSellable?: boolean;
  isSellableInvalid?: boolean;
}

/**
 * Build {@link ProductVariant} payloads for `productService.create({ variants })`.
 * Row 0 with blank variant code uses `productCode` (matches backend default-variant semantics).
 * Further rows use `${productCode}-02`, `-03`, … when code left blank.
 */
export function buildVariantsForProductImportCreate(
  productCode: string,
  productName: string,
  drafts: ProductImportVariantDraft[],
): Omit<ProductVariant, "id">[] {
  const pname = productName.trim();
  return drafts.map((v, index) => {
    const variantCode =
      v.code.trim()
      || (index === 0 ? productCode : `${productCode}-${String(index + 1).padStart(2, "0")}`);
    const variantName = v.name.trim() || pname;
    return {
      code: variantCode,
      name: variantName,
      sellUnit: v.sellUnit.trim(),
      importUnit: (v.importUnit || v.sellUnit).trim(),
      piecesPerImportUnit: v.piecesPerImportUnit || 1,
      sellPrice: v.sellPrice,
      costPrice: v.costPrice,
      stock: v.stock,
      minStock: v.minStock,
      expiryDays: v.expiryDays,
      isDefault: index === 0,
      isSellable: v.isSellable !== false && !v.isSellableInvalid,
    };
  });
}
