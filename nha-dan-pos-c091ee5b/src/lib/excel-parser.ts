/**
 * UI-facing Excel import: maps low-level template rows to {@link import-types} rows
 * (status, isSellable, …). Raw reads live in {@link readProductExcelTemplate} and
 * {@link readReceiptExcelTemplate}.
 */
import type { ImportSeverity, ProductImportRow, ReceiptImportRow } from "./import-types";
import { readProductExcelTemplate, type ProductExcelRow } from "./productExcelImport";
import {
  readReceiptExcelTemplate,
  type ReceiptExcelRow,
  receiptImportPreviewLabel,
} from "./receiptExcelImport";

function mapProductExcelRow(r: ProductExcelRow): ProductImportRow {
  let status: ImportSeverity = "ready";
  let message: string | undefined;
  if (r.isSellableInvalid) {
    status = "error";
    message = "Cột bán hàng (N) không hợp lệ.";
  } else if (!r.isSellable) {
    status = "warning";
    message = "NVL / không bán lẻ (cột N).";
  }
  return {
    status,
    message,
    sourceRow: r.lineNumber,
    code: r.code,
    name: r.name,
    category: r.categoryName,
    variantCode: "",
    variantName: "Mặc định",
    sellPrice: r.sellPrice ?? 0,
    costPrice: r.costPrice ?? 0,
    stock: r.stockQty ?? 0,
    importUnit: r.importUnit,
    sellUnit: r.sellUnit,
    piecesPerImportUnit: r.piecesPerUnit ?? 1,
    expiryDays: r.expiryDays ?? 0,
    minStock: r.minStockQty ?? 5,
    active: r.active ?? true,
    note: r.conversionNote,
    isSellable: r.isSellable,
    isSellableExplicit: r.isSellableExplicit,
    isSellableInvalid: r.isSellableInvalid,
  };
}

function mapReceiptExcelRow(r: ReceiptExcelRow): ReceiptImportRow {
  let status: ImportSeverity = "ready";
  let message: string | undefined;
  if (r.isSellableInvalid) {
    status = "error";
    message = "Cột bán hàng (P) không hợp lệ.";
  } else if (r.importWarnings.length > 0) {
    status = "warning";
    message = r.importWarnings[0];
  }
  return {
    status,
    message,
    outcome: "ok",
    sourceRow: r.lineNumber,
    productCode: r.productCode,
    variantCode: r.variantCode,
    productName: r.productName,
    variantName: r.variantCode || "",
    category: r.category,
    newProductUnit: r.unit,
    importUnit: r.importUnit,
    sellUnit: r.sellUnit,
    piecesPerUnit: r.pieces ?? 1,
    quantity: r.quantity ?? 0,
    unitCost: r.unitCost ?? 0,
    sellPrice: r.sellPrice ?? 0,
    discountPercent: r.discountPercent ?? 0,
    expiryDate: r.expiryDateOverride ?? "",
    expiryDays: r.expiryDays ?? undefined,
    note: r.note,
    isSellable: r.isSellable,
    isSellableExplicit: r.isSellableExplicit,
    isSellableInvalid: r.isSellableInvalid,
    importWarnings: r.importWarnings,
  };
}

export async function parseProductExcel(file: File): Promise<ProductImportRow[]> {
  const raw = await readProductExcelTemplate(file);
  return raw.map(mapProductExcelRow);
}

export async function parseReceiptExcel(file: File): Promise<ReceiptImportRow[]> {
  const raw = await readReceiptExcelTemplate(file);
  return raw.map(mapReceiptExcelRow);
}

export {
  productImportPreviewLabel,
  readProductExcelTemplate,
  type ProductExcelRow,
} from "./productExcelImport";
export {
  receiptImportPreviewLabel,
  readReceiptExcelTemplate,
  buildReceiptImportVariantWarnings,
  type ReceiptExcelRow,
} from "./receiptExcelImport";
