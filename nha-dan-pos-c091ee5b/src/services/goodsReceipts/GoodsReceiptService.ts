// GoodsReceiptService — canonical interface for goods receipt list/detail/delete.
// Draft/confirm: only local; backend is immediate stock-in (POST /api/receipts) and not
// exposed here to avoid faking a draft/confirm flow.

import type {
  GoodsReceipt,
  GoodsReceiptLine,
  ID,
  ListQuery,
  PagedResult,
} from "@/services/types";

/** Backend-friendly list params. Date range collapses to `dateRange` for the
 *  generic filter map; flat fields kept for ergonomic call sites. */
export interface GoodsReceiptListParams extends ListQuery {
  status?: "draft" | "confirmed";
  supplierId?: ID;
  dateFrom?: string;
  dateTo?: string;
  dateRange?: { from?: string; to?: string };
}

export interface CreateGoodsReceiptInput {
  number?: string;
  date: string;
  supplierId: ID;
  supplierName: string;
  shippingFee: number;
  vat: number;
  note?: string;
  lines: Omit<GoodsReceiptLine, "id" | "batchId">[];
}

export interface GoodsReceiptService {
  list(params?: GoodsReceiptListParams): Promise<PagedResult<GoodsReceipt>>;
  get(id: ID): Promise<GoodsReceipt | null>;
  /** Returns the canonical line items for a receipt. UI / printers consume this
   *  shape directly — `discountPercent` is the BE-aligned field name. */
  getLines(id: ID): Promise<GoodsReceiptLine[]>;
  /**
   * Local / legacy store only. Backend does not expose a draft; do not call this expecting
   * BE to match until draft endpoints exist.
   */
  createDraft(input: CreateGoodsReceiptInput): Promise<GoodsReceipt>;
  /** Local / legacy only. Backend POST is already confirmed stock-in. */
  confirm(id: ID): Promise<GoodsReceipt>;
  /** Backend: PATCH /api/receipts/{id}/void — keeps history, adjusts remaining batch qty. */
  voidReceipt(id: ID, body?: { reason?: string; voidedBy?: string }): Promise<GoodsReceipt>;
  remove(id: ID): Promise<void>;
}
