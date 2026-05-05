import { adminFetchJson } from "@/services/auth/adminApi";

/** POST /api/invoices is separate — this module is goods receipt create only. */

export type InventoryReceiptCreateItem = {
  productId: number;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  /** Catalog current sell price update hint. Does not affect receipt totals. */
  sellPrice?: number | null;
  /** Catalog sellable update hint. Applied only when isSellableExplicit is true. */
  isSellable?: boolean | null;
  /** True only when admin explicitly provided the Excel/UI sellable value. */
  isSellableExplicit?: boolean | null;
  importUnit: string;
  piecesOverride: number;
  variantId: number | null;
  /** yyyy-MM-dd or null → server derives */
  expiryDateOverride: string | null;
};

export type InventoryReceiptCreateRequest = {
  supplierName?: string | null;
  supplierId?: number | null;
  note?: string | null;
  shippingFee: number;
  vatPercent: number;
  items: InventoryReceiptCreateItem[];
  comboItems?: unknown[];
  /** ISO local datetime string; server rejects future */
  receiptDate?: string | null;
};

export type InventoryReceiptItemResponse = {
  id: number;
  productId: number;
  variantId: number | null;
  variantCode: string;
  variantName: string;
  retailQtyAdded: number | null;
};

export type InventoryReceiptCreateResponse = {
  id: number;
  receiptNo: string;
  receiptDate: string;
  items: InventoryReceiptItemResponse[];
};

export async function createInventoryReceipt(
  body: InventoryReceiptCreateRequest,
): Promise<InventoryReceiptCreateResponse> {
  return adminFetchJson<InventoryReceiptCreateResponse>("/api/receipts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
