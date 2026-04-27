import type { ProductImportRow, ReceiptImportRow } from "./import-types";

/** In-memory handoff from import modal → review page (single consumer per load). */
export type StagedProductImport = {
  filename: string;
  rows: ProductImportRow[];
  createdAt: number;
};

export type StagedReceiptImport = {
  filename: string;
  rows: ReceiptImportRow[];
  meta: { supplierName: string; receiptDate: string };
  createdAt: number;
};

let productStage: StagedProductImport | null = null;
let receiptStage: StagedReceiptImport | null = null;

export const importStaging = {
  setProducts(payload: StagedProductImport) {
    productStage = payload;
  },
  takeProducts(): StagedProductImport | null {
    const x = productStage;
    productStage = null;
    return x;
  },
  setReceipt(payload: StagedReceiptImport) {
    receiptStage = payload;
  },
  takeReceipt(): StagedReceiptImport | null {
    const x = receiptStage;
    receiptStage = null;
    return x;
  },
};

export function stageProductImportRows(rows: ProductImportRow[]): StagedProductImport {
  return { filename: "staged", rows, createdAt: Date.now() };
}

export function stageReceiptImportRows(
  rows: ReceiptImportRow[],
  meta: StagedReceiptImport["meta"] = { supplierName: "", receiptDate: new Date().toISOString().slice(0, 10) }
): StagedReceiptImport {
  return { filename: "staged", rows, meta, createdAt: Date.now() };
}
