// Canonical shared types for the service layer.
// Source of truth for service contracts and data models.
// No runtime logic. No localStorage. UI may import these types via "@/services/types".

/* ========================= CORE / SHARED ========================= */

export type ID = string;
export type ISODateString = string;
export type Money = number;

export type SortDirection = "asc" | "desc";
export interface MultiSortRule {
  field: string;
  direction: SortDirection;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OptionItem {
  label: string;
  value: string;
}

/* ListQuery — backend-friendly shape for list/search endpoints.
 * - `query` is the free-text term (server applies its own search rules)
 * - `sort` is a multi-rule array (servers can honour the first rule or all)
 * - `filters` is a string-keyed map of primitive scalars / arrays / ranges,
 *   chosen so it serialises cleanly to query-string or JSON without losing
 *   type. Per-resource list params extend this and narrow `filters`.
 */
export type FilterScalar = string | number | boolean;
export type FilterValue =
  | FilterScalar
  | FilterScalar[]
  | { from?: FilterScalar; to?: FilterScalar }
  | null;

export interface ListQuery {
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: MultiSortRule[];
  /** Generic, serialisable filter map. Resource-specific params should
   *  redeclare a narrower `filters` shape on top of this. */
  filters?: Record<string, FilterValue>;
}

/* ========================= STORE SETTINGS / VIETQR ========================= */

export type VietQrTemplate = "compact" | "compact2" | "qr_only" | "print";

export interface StorePaymentSettings {
  shopName: string;
  qrEnabled: boolean;
  vietQrBankCode: string; // NAPAS / VietQR bank code (e.g. "VCB","TCB","ACB")
  bankName: string;
  accountNumber: string;
  accountName: string;
  branch?: string;
  transferPrefix?: string; // e.g. "DH"
  qrTemplate?: VietQrTemplate;
  // E-wallet static QR images (data URLs or external URLs).
  // When set, PendingPayment shows these instead of the VietQR for the
  // matching payment method.
  momoQrImage?: string;
  momoAccountName?: string;
  momoPhone?: string;
  zalopayQrImage?: string;
  zalopayAccountName?: string;
  zalopayPhone?: string;
}

export interface VietQrRequest {
  amount: Money;
  transferContent: string;
  cacheKey?: string;
}

export interface VietQrResult {
  imageUrl: string;
  scanImageUrl: string;
  rawPayload: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: Money;
  transferContent: string;
  template: VietQrTemplate;
}

/* ========================= ADDRESS / SHIPPING ========================= */

export interface Province { code: string; name: string; }
export interface District { code: string; name: string; provinceCode: string; }
export interface Ward { code: string; name: string; districtCode: string; }

export interface ShippingAddress {
  receiverName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  wardCode: string;
  wardName: string;
  street: string;
  rawAddress?: string;
  note?: string;
}

export type ShippingQuoteSource = "zone_fallback" | "carrier_api" | "client_snapshot";
export type ShippingQuoteStatus = "incomplete" | "loading" | "quoted" | "unavailable";

export interface ShippingQuote {
  status: ShippingQuoteStatus;
  source?: ShippingQuoteSource;
  zoneCode?: string;
  fee?: Money;
  etaDays?: { min: number; max: number };
  reasonIfUnavailable?: string;
  freeShipApplied?: boolean;
  /** True when the carrier API failed and the result came from the local zone fallback. */
  usedFallback?: boolean;
  /** Machine-readable reason set when usedFallback=true (e.g. "no_config", "address_unmapped", "ghn_error", "timeout"). */
  fallbackReason?: string;
  /** Latency in ms of the most recent carrier attempt (success or failure). */
  latencyMs?: number;
  /** ISO timestamp of the most recent carrier attempt. */
  attemptedAt?: ISODateString;
}

export interface ShippingZoneRule {
  zoneCode: string;
  label: string;
  baseFee: Money;
  freeShipThreshold?: Money;
  etaDays: { min: number; max: number };
  /** Province codes assigned to this zone. "*" = catch-all. */
  provinceCodes: string[];
}

export type DeclaredValueMode = "none" | "subtotal" | "fixed";

export interface ShippingParcelDefaults {
  /** cm */
  length: number;
  /** cm */
  width: number;
  /** cm */
  height: number;
  /** g — fallback weight when cart total weight unknown */
  weightGrams: number;
  /** how to compute insurance_value sent to carrier */
  declaredValueMode: DeclaredValueMode;
  /** Used when declaredValueMode === "fixed" */
  declaredValueFixed?: Money;
}

export interface ShippingConfig {
  zoneRules: ShippingZoneRule[];
  parcelDefaults?: ShippingParcelDefaults;
}

export interface ShippingQuoteInput {
  address: Pick<
    ShippingAddress,
    "provinceCode" | "provinceName" | "districtCode" | "wardCode"
  > & Partial<ShippingAddress>;
  subtotal: Money;
  weightGrams?: number;
  /** Optional draft order code so admin log rows can be traced to an order. */
  orderCode?: string;
  /** Optional parcel size override (cm). Falls back to ShippingConfig.parcelDefaults. */
  parcel?: Partial<Pick<ShippingParcelDefaults, "length" | "width" | "height">>;
  /** Override declared/insurance value sent to carrier. If omitted, derived from config. */
  declaredValue?: Money;
}

/* ========================= PRODUCT / VARIANT ========================= */

export interface ProductImage { id: ID; url: string; alt?: string; isPrimary?: boolean; }
export interface VariantImage { id: ID; url: string; alt?: string; isPrimary?: boolean; }

export interface Product {
  id: ID;
  code: string;
  name: string;
  categoryId?: ID;
  categoryName?: string;
  images: ProductImage[];
}

export interface Variant {
  id: ID;
  productId: ID;
  code: string;
  name?: string;
  barcode?: string;
  sellUnit?: string;
  retailPrice: Money;
  images?: VariantImage[];
}

export interface ResolvedVariantDisplay {
  productId: ID;
  variantId: ID;
  productName: string;
  variantName?: string;
  imageUrl?: string;
  barcode?: string;
  retailPrice: Money;
}

/* ========================= CUSTOMER / POINTS ========================= */

export interface Customer {
  id: ID;
  code?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  points: number;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export type CustomerPointSourceType = "invoice" | "redemption" | "manual_adjustment";

export interface CustomerPointHistoryItem {
  id: ID;
  customerId: ID;
  createdAt: ISODateString;
  delta: number;
  balanceAfter: number;
  reason: string;
  sourceType: CustomerPointSourceType;
  sourceId?: ID;
}

/* ========================= CART / PROMOTION / VOUCHER ========================= */

export interface CartLine {
  id: ID;
  productId: ID;
  variantId: ID;
  productCode?: string;
  variantCode?: string;
  productName: string;
  variantName?: string;
  categoryId?: ID;
  categoryName?: string;
  qty: number;
  unitPrice: Money;
  lineSubtotal: Money;
  catalogSource?: "backend";
  schemaVersion?: number;
  /** Exact batch for stock trace only (Slice 6B/6C). */
  batchId?: ID;
}

export interface GiftLine {
  productId: ID;
  variantId?: ID;
  productName: string;
  variantName?: string;
  qty: number;
  unitPrice: Money;
  lineTotal: Money;
  promotionId: ID;
  promotionName: string;
}

export type PromotionType =
  | "percent_discount"
  | "fixed_discount"
  | "buy_x_get_y"
  | "gift"
  | "free_shipping";

export interface VoucherSnapshot {
  code: string;
  ruleSummary: string;
  discountAmount: Money;
  /** Giảm phí ship (cho voucher freeship). Mặc định 0. */
  shippingDiscountAmount?: Money;
}

export interface PromotionAffectedLine {
  lineId: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  variantName?: string;
  eligibleQty?: number;
  discountedAmount?: Money;
  rewardQty?: number;
  note?: string;
}

export interface PromotionProgressItem {
  productId?: ID;
  variantId?: ID;
  requiredQty?: number;
  currentQty?: number;
  remainingQty?: number;
}

export interface PromotionProgress {
  type?: string;
  basis?: "ELIGIBLE_ITEMS" | "WHOLE_ORDER" | "ITEM_QUANTITY" | "SHIPPING_ADDRESS" | string;
  currentAmount?: Money;
  remainingAmount?: Money;
  requiredAmount?: Money;
  items?: PromotionProgressItem[];
}

export interface EvaluatedPromotion {
  promotionId: ID;
  name: string;
  type: PromotionType;
  ruleSummary: string;
  eligible: boolean;
  reasonIfIneligible?: string;
  discountAmount: Money;
  shippingDiscountAmount: Money;
  voucherDiscountAmount: Money;
  affectedLines: PromotionAffectedLine[];
  giftLines: GiftLine[];
  progress?: PromotionProgress;
}

export interface CartPricingBreakdown {
  subtotal: Money;
  manualDiscount: Money;
  promotionDiscount: Money;
  voucherDiscount: Money;
  shippingFee: Money;
  shippingDiscount: Money;
  vat: Money;
  total: Money;
}

export interface CartContext {
  lines: CartLine[];
  subtotal: Money;
  customerId?: ID;
  voucherCode?: string;
  manualDiscount?: Money;
  shippingAddress?: ShippingAddress;
  shippingQuote?: ShippingQuote;
}

/* ========================= ORDER / PENDING PAYMENT ========================= */

export type PaymentMethod = "cash" | "cod" | "cash_on_delivery" | "bank_transfer" | "momo" | "zalopay";

export type PendingOrderStatus =
  | "pending_payment"
  | "waiting_confirm"
  | "confirmed"
  | "paid_auto"
  | "cancelled";

export interface PromotionSnapshot {
  promotionId: ID;
  name: string;
  type: PromotionType;
  ruleSummary: string;
  discountAmount: Money;
  shippingDiscountAmount: Money;
  affectedLines: PromotionAffectedLine[];
  giftLines: GiftLine[];
}

export interface PricingBreakdownSnapshot {
  subtotal: Money;
  manualDiscount: Money;
  promotionDiscount: Money;
  voucherDiscount: Money;
  shippingFee: Money;
  shippingDiscount: Money;
  itemNetRevenue?: Money;
  shippingNetRevenue?: Money;
  loyaltyDiscount?: Money;
  loyaltyRedeemedPoints?: number;
  vatBase: Money;
  vatPercent: number;
  vatAmount: Money;
  /** Transitional compatibility field for older UI reads. Prefer `vatAmount`. */
  vat?: Money;
  total: Money;
  commercialAllocationVersion?: number;
}

export interface ShippingQuoteSnapshot {
  source: ShippingQuoteSource;
  zoneCode?: string;
  fee: Money;
  etaDays?: { min: number; max: number };
}

export interface PendingOrderLine {
  id: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  variantName?: string;
  qty: number;
  unitPrice: Money;
  lineSubtotal: Money;
  batchId?: ID;
  rewardLine?: boolean;
  originalUnitPrice?: Money;
}

export interface PendingOrder {
  id: ID;
  code: string;
  createdAt: ISODateString;
  expiresAt?: ISODateString;
  status: PendingOrderStatus;
  customerId?: ID;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  lines: PendingOrderLine[];
  giftLinesSnapshot: GiftLine[];
  promotionSnapshot?: PromotionSnapshot | null;
  voucherSnapshot?: VoucherSnapshot | null;
  shippingQuoteSnapshot?: ShippingQuoteSnapshot | null;
  pricingBreakdownSnapshot: PricingBreakdownSnapshot;
  note?: string;
  /** Present only on the immediate `confirm()` response when backend returns an invoice. */
  confirmedInvoiceId?: string;
  confirmedInvoiceNo?: string;
}

export interface CreatePendingOrderInput {
  customerId?: ID;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  paymentMethod: PaymentMethod;
  /** Transitional compatibility field. Backend generates `paymentReference = code`. */
  paymentReference?: string;
  /** Omitted when {@link quotePublicId} is set (backend quote snapshot). */
  lines?: PendingOrderLine[];
  promotionSnapshot?: PromotionSnapshot | null;
  voucherSnapshot?: VoucherSnapshot | null;
  shippingQuoteSnapshot?: ShippingQuoteSnapshot | null;
  pricingBreakdownSnapshot?: PricingBreakdownSnapshot;
  note?: string;
  expiresAt?: ISODateString;
  /** Slice 6C: backend UUID from POST /api/sales/quote */
  quotePublicId?: string;
}

export interface PendingOrderListParams extends ListQuery {
  status?: PendingOrderStatus;
}

/* ========================= INVENTORY / BATCH ========================= *
 * Canonical batch/lot-aware contracts. FE skeleton only — no real
 * deduction/allocation logic ships yet. The shapes exist so the BE can
 * fill them in without touching screen code, and so UI slots (printers,
 * detail drawers) can render allocation when present.
 */

/** A physical lot/batch belonging to one variant. Stock = sum(qty). */
export interface Batch {
  id: ID;
  variantId: ID;
  lotCode: string;
  qty: number;
  costPrice: Money;
  expiryDate?: ISODateString;
  /** Goods receipt this lot was created from (when known). */
  receiptId?: ID;
  createdAt?: ISODateString;
}

export type InventoryMovementSource =
  | "goods_receipt"
  | "invoice"
  | "invoice_cancel"
  | "stock_adjustment"
  | "manual";

/**
 * Append-only ledger entry. Positive qtyDelta = inbound, negative = outbound.
 * BE will be the source of truth; FE keeps the shape so receipt/cancel/adjust
 * screens can later display "what moved" without refactor.
 */
export interface InventoryMovement {
  id: ID;
  createdAt: ISODateString;
  variantId: ID;
  batchId?: ID;
  qtyDelta: number;
  sourceType: InventoryMovementSource;
  sourceId: ID;
  note?: string;
}

/** One batch row in an inventory projection (from BE `byBatch` or normalized). */
export interface InventoryProjectionBatch {
  batchId: ID;
  /** Backend / receipt lot label (aligns with `Batch.lotCode` on FE). */
  lotCode?: string;
  /** Same as lotCode when the API returns `batchCode` (Java: batchCode on ProductBatch). */
  batchCode?: string;
  qty: number;
  costPrice?: Money;
  expiryDate?: ISODateString;
  receiptId?: ID;
  createdAt?: ISODateString;
}

/** Projection of current stock for a variant (derived from ProductBatch in backend v13+). */
export interface InventoryProjection {
  variantId: ID;
  productId?: ID;
  productCode?: string;
  productName?: string;
  variantCode?: string;
  variantName?: string;
  sellUnit?: string;
  onHand: number;
  reserved: number;
  available: number;
  /** Sale-sellable capacity (SINGLE + physical batches); undefined for COMBO virtual stock. */
  sellableQty?: number;
  /** From backend variant min threshold (when provided). */
  minStockQty?: number;
  byBatch?: InventoryProjectionBatch[];
}

/** Optional per-line allocation. UI may render it; BE fills it in. */
export interface InvoiceLineAllocation {
  batchId: ID;
  lotCode?: string;
  /** Filled from backend `batchCode` on allocation rows. */
  batchCode?: string;
  qty: number;
}

/* ========================= INVOICE (CANONICAL) ========================= *
 * The legacy `Invoice` / `InvoiceBreakdown` shapes still live in
 * `src/lib/mock-data.ts` for the admin Invoices UI, but they are now
 * marked as legacy view-models. New code must use the canonical shapes
 * below. `LocalInvoiceAdapter` returns the legacy shape today; when BE
 * arrives the adapter will return `Invoice` (canonical) and the UI will
 * read snapshots directly.
 */

export type InvoiceStatus = "active" | "cancelled";
export type InvoiceSourceType = "pos" | "online_pending" | "manual";

export interface InvoiceLine {
  id: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  variantName?: string;
  qty: number;
  unitPrice: Money;
  lineSubtotal: Money;
  /** True when this line is a free reward generated by a promotion. */
  reward?: boolean;
  /** Promotion that generated this reward line (when reward=true). */
  rewardSourcePromotionId?: ID;
  rewardSourceName?: string;
  /** Optional batch allocation (filled by BE when available). */
  allocations?: InvoiceLineAllocation[];
}

export interface Invoice {
  id: ID;
  number: string;
  date: ISODateString;
  status: InvoiceStatus;
  sourceType: InvoiceSourceType;
  /** Set when invoice was created from a paid/confirmed pending order. */
  pendingOrderId?: ID;

  customerId?: ID;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;

  paymentMethod: PaymentMethod;
  createdBy?: string;
  note?: string;

  lines: InvoiceLine[];
  giftLinesSnapshot: GiftLine[];

  promotionSnapshot?: PromotionSnapshot | null;
  voucherSnapshot?: VoucherSnapshot | null;
  shippingQuoteSnapshot?: ShippingQuoteSnapshot | null;
  pricingBreakdownSnapshot: PricingBreakdownSnapshot;

  /** VAT applied at invoice time (0 today; kept as a real field, never inferred). */
  vatPercent: number;
}

/* ========================= GOODS RECEIPT (CANONICAL) ========================= */

export type GoodsReceiptStatus = "draft" | "confirmed" | "voided";

export interface GoodsReceiptLine {
  id: ID;
  variantId?: ID;
  productCode?: string;
  variantCode: string;
  productName: string;
  variantName?: string;
  importUnit: string;
  piecesPerUnit: number;
  quantity: number;
  unitCost: Money;
  /** % discount on unitCost, allocated by BE. */
  discountPercent: number;
  expiryDate?: ISODateString;
  /** BE-allocated breakdown — source of truth for cost columns. */
  lineSubtotal?: Money;
  afterDiscount?: Money;
  shippingAlloc?: Money;
  vatAlloc?: Money;
  finalUnitCost?: Money;
  /** Lot code created on confirm (one batch per line in v1). */
  lotCode?: string;
  /** Batch id created on confirm (filled by BE). */
  batchId?: ID;
  /** false = raw/NVL / ẩn bán lẻ — optional, Excel/import staging; BE đích là source of truth. */
  isSellable?: boolean;
  /** Retail / label price from variant at receipt fetch (`InventoryReceiptItemResponse.variantSellPrice`). */
  variantSellPrice?: Money;
}

export interface GoodsReceipt {
  id: ID;
  number: string;
  date: ISODateString;
  status: GoodsReceiptStatus;
  supplierId: ID;
  supplierName: string;
  itemCount: number;
  subtotal: Money;
  shippingFee: Money;
  vat: Money;
  totalCost: Money;
  note?: string;
  createdBy?: string;
  /** When present and canDelete is false, e.g. {@code "downstream_consumption"}. */
  deleteBlockReason?: string;
  /** True when every batch on the receipt still has remainingQty == importQty (not consumed downstream). */
  canDelete: boolean;
}

/* ========================= STOCK ADJUSTMENT (CANONICAL) ========================= */

export type StockAdjustmentStatus = "draft" | "confirmed";

