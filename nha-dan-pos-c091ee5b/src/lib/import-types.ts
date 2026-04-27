export type ImportSeverity = "ready" | "warning" | "error";

export interface ProductImportRow {
  status: ImportSeverity;
  message?: string;
  sourceRow: number;
  code: string;
  name: string;
  category: string;
  variantCode: string;
  variantName: string;
  sellPrice: number;
  costPrice: number;
  stock: number;
  importUnit: string;
  sellUnit: string;
  piecesPerImportUnit: number;
  expiryDays: number;
  minStock: number;
  active: boolean;
  note: string;
  /** From Excel cột N; missing defaults true at parse. */
  isSellable?: boolean;
  isSellableExplicit?: boolean;
  isSellableInvalid?: boolean;
}

export type ReceiptImportOutcome =
  | "create-product-and-variant"
  | "create-variant"
  | "use-default-variant"
  | "update-legacy-unit"
  | "update-pricing"
  | "ok";

export interface ReceiptImportRow {
  status: ImportSeverity;
  message?: string;
  outcome: ReceiptImportOutcome;
  sourceRow: number;
  productCode: string;
  variantCode: string;
  productName: string;
  variantName: string;
  category?: string;
  newProductUnit?: string;
  importUnit: string;
  sellUnit: string;
  piecesPerUnit: number;
  quantity: number;
  unitCost: number;
  sellPrice: number;
  discountPercent: number;
  expiryDate: string;
  expiryDays?: number;
  note?: string;
  /** From Excel cột P; missing defaults true at parse. */
  isSellable?: boolean;
  isSellableExplicit?: boolean;
  isSellableInvalid?: boolean;
  /** Heuristic / parse-time warnings (e.g. thiếu mã quy cách). */
  importWarnings?: string[];
}

export function productImportRowSellableLabel(
  r: Pick<ProductImportRow, "isSellable" | "isSellableInvalid">
): string {
  if (r.isSellableInvalid) return "Bán? (cột lỗi)";
  if (r.isSellable === false) return "NVL / không bán lẻ";
  return "Bán lẻ";
}

export function receiptImportRowSellableLabel(
  r: Pick<ReceiptImportRow, "isSellable" | "isSellableInvalid">
): string {
  if (r.isSellableInvalid) return "Bán? (cột lỗi)";
  if (r.isSellable === false) return "NVL / ẩn bán lẻ";
  return "Bán lẻ";
}
