import { adminFetchJson } from "@/services/auth/adminApi";

/** GET /api/batches/receipt/{receiptId} — batches created from a confirmed receipt. */
export type ProductBatchResponse = {
  id: number;
  batchCode: string;
  productId: number;
  productCode: string;
  productName: string;
  expiryDate: string | null;
  importQty: number;
  remainingQty: number;
  costPrice: string | number;
  receiptNo: string | null;
};

export async function fetchBatchesByReceiptId(receiptId: number): Promise<ProductBatchResponse[]> {
  return adminFetchJson<ProductBatchResponse[]>(
    `/api/batches/receipt/${encodeURIComponent(String(receiptId))}`,
  );
}
