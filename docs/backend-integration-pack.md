# Backend Integration Pack

## Current Backend Integration Addendum — 2026-04-27

This addendum documents the completed local backend state after ProductBatch status slices 0-6.

- `ProductBatch.remainingQty` is stock truth.
- `ProductVariant.stockQty` is current/system compatibility projection, not canonical stock truth.
- Product-level stock is not canonical.
- `InventoryMovement` is append-only.
- `ProductBatch.status` values: `active`, `depleted`, `voided`, `blocked`, `archived`.
- Expired is a date predicate, not persisted status.
- Sales sellable predicate: `remainingQty > 0`, status `active`, non-expired, product active, variant active, and `variant.isSellable=true`.
- `InventoryProjection` keeps `onHand` / `available` current-system semantics and adds optional `sellableQty`.
- SINGLE `sellableQty` is integer; COMBO `sellableQty` is `null` because combo stock is virtual.
- Receipt void behavior: controlled stock zeroing via `StockMutationService`, `goods_receipt_void` movement when remaining > 0, fully consumed void is metadata-only, voided delete rejected.
- Goods Receipt backend uses the accepted **confirmed-on-create** model: `POST /api/receipts` creates the confirmed receipt, batches, stock mutation, and `goods_receipt` movements in one transaction.
- No backend draft/confirm receipt lifecycle exists for now. FE backend adapters must keep `createDraft` / `confirm` explicitly unsupported for backend usage.
- Supported Goods Receipt lifecycle is `canDelete` / `deleteBlockReason`, metadata update, delete, and void.
- Pack Slice 4 draft/confirm wording below is historical/stale unless product later approves a real draft lifecycle.
- Invoice allocation and `invoice_cancel` movements are allocation-backed; cancel does not use sellable predicate.
- StockAdjustment unsourced negative uses `currentAdjustable`: `remainingQty > 0`, status `active` / `blocked`, no expiry filter, no product/variant active requirement for negative correction.
- Explicit stock adjustment `sourceBatch` negative allows active / blocked / expired and rejects voided / depleted / archived / unknown.
- StockAdjustment reverse remains trace-based exact inverse; no FEFO guessing.
- PendingOrder confirm remains sole authority to create invoice.
- Manual payment link does not create invoice or mark confirmed.
- Casso/payment events are backend-owned; no Supabase live path.
- `ProductionOrder` is the source of truth for internal raw-material consumption and finished-batch creation.
- Production is not Combo and not Goods Receipt: Combo is a virtual commercial bundle; Goods Receipt is supplier inbound stock; Production consumes raw material batches and creates real finished product batches.
- Production movements are append-only `InventoryMovement` rows with source types `production_consume`, `production_output`, `production_void_restore`, and `production_void_output`.
- `ProductVariant.isSellable=false` means the variant is active for inventory/production but hidden from sales/POS/storefront.
- Raw/weighted stock should use integer base units, e.g. `1 kg = 1000 g`, not decimal stock like `0.2 kg`.
- Production output batch expiry defaults to the minimum expiry date among consumed component batches.
- Production output batch cost comes from actual weighted consumed component allocations plus optional overhead.

Older sections below may contain historical/transitional wording; use this addendum as the current local baseline until the full pack is rewritten carefully.

## 1. Business Rule Summary

1. `PendingOrder` is the canonical pre-invoice record for online checkout. Online methods (`bank_transfer`, `momo`, `zalopay`) create a pending order first; `cash` creates an invoice immediately.
2. Checkout and invoice commercial snapshots must preserve VAT explicitly as:
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
   Do not collapse VAT into a single ambiguous `vat` number in order/invoice commercial DTOs.
3. `PricingBreakdownSnapshot` is the commercial source of truth for displayed totals. Backend must persist and return it exactly, including:
   - `subtotal`
   - `manualDiscount`
   - `promotionDiscount`
   - `voucherDiscount`
   - `shippingFee`
   - `shippingDiscount`
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
   - `total`
4. `paymentReference` is the transfer content reference the customer sees and copies. Backend should formalize `paymentReference = code` for pending orders unless a stricter future payment-session scheme replaces it.
5. Shipping quote snapshots store the pre-discount shipping fee. Shipping payable is derived from `shippingFee - shippingDiscount`, not by mutating the base quote.
6. Voucher discount and promotion discount are separate invariants and must never be merged.
7. Pending-order business transitions should be modeled as commands, not a generic business PATCH:
   - mark `waiting_confirm`
   - change payment method
   - confirm
   - cancel
8. Invoice creation from a pending order is the authoritative completion point for the online sales flow and must be transactional with stock effects.
9. `PendingOrderStatus` in FE is business-facing:
   - `pending_payment`
   - `waiting_confirm`
   - `confirmed`
   - `paid_auto`
   - `cancelled`
10. `Invoice` is the canonical commercial record after sale confirmation. It must retain origin metadata:
   - `sourceType`
   - `pendingOrderId`
   - snapshots identical in shape to `PendingOrder`
11. `GoodsReceipt` confirmation is the business point where inventory batches are created. FE already reserves `lotCode`, `batchId`, and allocation/cost fields for BE ownership.
12. `GoodsReceipt.canDelete` means no downstream stock consumption has occurred from any batch created by that receipt.
13. Inventory is batch/lot aware in canonical types even though the current local adapter returns no real batches/movements. BE should not collapse inventory back to single stock numbers.
14. `InventoryMovement` is append-only. Stock projections must be derived, not mutated ad hoc.
15. Promotions are evaluated against cart lines and shipping quote. Best promotion is the eligible promotion with the highest combined customer value: `discountAmount + shippingDiscountAmount`.
16. Voucher validation is contextual to cart subtotal and can yield either item discount or shipping discount cap. FE expects human-readable invalid reasons.
17. Product admin UI still has legacy translation, but operational truth must remain variant-centric:
   - stock belongs to variants and batches, not products
   - barcode belongs to variants
   - expiry belongs to batches
   - profit should resolve from variant-level cost/inventory data, not product-level approximations
18. Legacy product-level stock/read models are transitional UI compatibility only. They must not drive backend inventory design.
19. Production creates real finished stock; it is not combo virtual stock.
20. Production consumes component batches FEFO and creates one finished output batch in the same transaction.
21. Production component consumption does not require component `isSellable=true`, but still requires active product/variant and a valid batch predicate.
22. Sales requires `product.active && variant.active && variant.isSellable`.
23. Production void is allowed only if the output batch has no downstream consumption.
24. Raw/weighted ingredients must be stored in integer base units such as grams; avoid fractional stock quantities for inventory math.
25. Production output expiry and cost are derived from consumed batch allocations, not recipe estimates alone.

## 2. Frontend Canonical Contract Summary

### Compatibility Note

The backend contract is upgraded so commercial DTOs explicitly preserve:

- `vatBase`
- `vatPercent`
- `vatAmount`

This is the target contract for pending-order and invoice commercial snapshots.

If the current frontend still has transitional fields in some places, backend integration should use adapter compatibility temporarily. Do not assume every FE screen has already migrated 100%. During rollout:

- backend persists and returns the upgraded commercial shape
- FE adapters may temporarily map older/transitional fields into the upgraded shape
- duplicated transitional fields, if still present on some screens, must be kept consistent by the adapter layer rather than weakening the backend contract

### Core Shared Types

- `ID = string`
- `ISODateString = string`
- `Money = number`
- `PagedResult<T> = { items, total, page, pageSize }`
- `ListQuery = { page?, pageSize?, query?, sort?, filters? }`

### Products and variants

- `Variant = { id, productId, code, name?, sellUnit, stockQty, isActive, isSellable? }`
- `isSellable?: boolean` controls sales visibility/eligibility only. `false` variants can remain active for inventory, receipt, production, adjustment, and reporting.

### Pricing / Commercial Snapshot

```ts
export interface PricingBreakdownSnapshot {
  subtotal: Money;
  manualDiscount: Money;
  promotionDiscount: Money;
  voucherDiscount: Money;
  shippingFee: Money;
  shippingDiscount: Money;
  vatBase: Money;
  vatPercent: number;
  vatAmount: Money;
  total: Money;
}
```

This same explicit commercial structure should be used for:

- `PendingOrder.pricingBreakdownSnapshot`
- `CreatePendingOrderInput.pricingBreakdownSnapshot`
- `Invoice.pricingBreakdownSnapshot`
- `CreateInvoiceInput.pricingBreakdownSnapshot`

### Shipping

- `ShippingAddress`
  - `receiverName`
  - `phone`
  - `provinceCode`, `provinceName`
  - `districtCode`, `districtName`
  - `wardCode`, `wardName`
  - `street`
  - `note?`
- `ShippingQuote`
  - `status: "incomplete" | "loading" | "quoted" | "unavailable"`
  - `source?: "zone_fallback" | "carrier_api"`
  - `zoneCode?`
  - `fee?`
  - `etaDays?: { min, max }`
  - `reasonIfUnavailable?`
  - `freeShipApplied?`
  - `usedFallback?`
  - `fallbackReason?`
  - `latencyMs?`
  - `attemptedAt?`
- Snapshot used on orders/invoices:
  - `ShippingQuoteSnapshot = { source, zoneCode?, fee, etaDays? }`

### Cart and pricing-related types

- `CartLine = { id, productId, variantId, productCode?, variantCode?, productName, variantName?, categoryId?, categoryName?, qty, unitPrice, lineSubtotal }`
- `GiftLine = { productId, variantId?, productName, variantName?, qty, unitPrice, lineTotal, promotionId, promotionName }`

### Promotions and vouchers

- `PromotionType = "percent_discount" | "fixed_discount" | "buy_x_get_y" | "gift" | "free_shipping"`
- `PromotionSnapshot = { promotionId, name, type, ruleSummary, discountAmount, shippingDiscountAmount, affectedLines, giftLines }`
- `VoucherSnapshot = { code, ruleSummary, discountAmount, shippingDiscountAmount? }`

### Pending orders

- `PaymentMethod = "cash" | "bank_transfer" | "momo" | "zalopay"`
- `PendingOrderStatus = "pending_payment" | "waiting_confirm" | "confirmed" | "paid_auto" | "cancelled"`
- `PendingOrderLine = { id, productId, variantId, productName, variantName?, qty, unitPrice, lineSubtotal }`
- `PendingOrder = { id, code, createdAt, expiresAt?, status, customerId?, customerName?, customerPhone?, shippingAddress?, paymentMethod, paymentReference, lines, giftLinesSnapshot, promotionSnapshot?, voucherSnapshot?, shippingQuoteSnapshot?, pricingBreakdownSnapshot, note? }`
- `CreatePendingOrderInput` matches the above, minus generated fields.

### Invoice compatibility

`Invoice.vatPercent` may still exist as a top-level compatibility field in some FE paths during migration. The backend commercial source of truth must still be:

- `pricingBreakdownSnapshot.vatBase`
- `pricingBreakdownSnapshot.vatPercent`
- `pricingBreakdownSnapshot.vatAmount`

If both top-level and snapshot VAT fields exist temporarily, adapter compatibility must keep them aligned. The upgraded backend contract should not be weakened to match incomplete FE migration.

### Invoices

- `InvoiceStatus = "active" | "cancelled"`
- `InvoiceSourceType = "pos" | "online_pending" | "manual"`
- `InvoiceLine = { id, productId, variantId, productName, variantName?, qty, unitPrice, lineSubtotal, reward?, rewardSourcePromotionId?, rewardSourceName?, allocations? }`
- `Invoice = { id, number, date, status, sourceType, pendingOrderId?, customerId?, customerName, customerPhone?, shippingAddress?, paymentMethod, createdBy?, note?, lines, giftLinesSnapshot, promotionSnapshot?, voucherSnapshot?, shippingQuoteSnapshot?, pricingBreakdownSnapshot, vatPercent }`

### Inventory

- `Batch = { id, variantId, lotCode, qty, costPrice, expiryDate?, receiptId?, createdAt? }`
- `InventoryMovement = { id, createdAt, variantId, batchId?, qtyDelta, sourceType, sourceId, note? }`
- `InventoryProjection = { variantId, onHand, reserved, available, byBatch? }`
- `InvoiceLineAllocation = { batchId, lotCode?, qty }`

### Goods receipts

- `GoodsReceiptStatus = "draft" | "confirmed"`
- `GoodsReceiptLine = { id, variantId?, productCode?, variantCode, productName, variantName?, importUnit, piecesPerUnit, quantity, unitCost, discountPercent, expiryDate?, lineSubtotal?, afterDiscount?, shippingAlloc?, vatAlloc?, finalUnitCost?, lotCode?, batchId? }`
- `GoodsReceipt = { id, number, date, status, supplierId, supplierName, itemCount, subtotal, shippingFee, vat, totalCost, note?, createdBy?, canDelete }`

### Production / assembly

- `ProductionRecipe = { id, code, name, outputProductId, outputVariantId, outputQty, overheadCost?, active, components }`
- `ProductionRecipeComponent = { productId, variantId, qtyPerOutput, unit, requiredBatchPredicate? }`
- `ProductionOrderStatus = "completed" | "voided"`
- `ProductionOrder = { id, number, recipeId?, outputProductId, outputVariantId, outputQty, status, outputBatchId, outputBatchCode, outputExpiryDate, outputUnitCost, overheadCost?, components, movements, createdAt, voidedAt?, voidReason? }`
- `ProductionOrderComponent = { productId, variantId, requiredQty, consumedQty, unit, allocations }`
- `ProductionOrderBatchAllocation = { batchId, lotCode?, qty, unitCost, expiryDate? }`

### Payment events

- `PaymentEvent = { id, provider, providerTxId, amount, transferContent, matchedCode, bankAccount, bankSubAcc, txTime, linkedOrderCode, linkedAt, linkedBy, status: "unmatched" | "matched" | "ignored" | "linked", createdAt }`

### Payment sessions

- `PaymentSessionStatus = "pending" | "matched" | "expired" | "cancelled"`
- `PaymentSession = { id, pendingOrderId, method, reference, amount, status, createdAt, matchedAt?, matchedEventId? }`

## 3. FE-BE Field Mapping

### Pending Order

| FE field | Proposed BE field | Notes |
|---|---|---|
| `id` | `id` | UUID/string id |
| `code` | `code` | Human-facing order code, also default transfer reference |
| `createdAt` | `createdAt` | ISO timestamp |
| `expiresAt` | `expiresAt` | First-class BE field |
| `status` | `status` | Expose FE enum directly |
| `customerId` | `customerId` | Nullable |
| `customerName` | `customerName` | Default `"Khách lẻ"` if absent |
| `customerPhone` | `customerPhone` | Nullable |
| `shippingAddress` | `shippingAddress` | JSON object using canonical shape |
| `paymentMethod` | `paymentMethod` | FE enum |
| `paymentReference` | `paymentReference` | Generated by BE, usually same as `code` |
| `lines` | `lines` | Canonical `PendingOrderLine[]` |
| `giftLinesSnapshot` | `giftLinesSnapshot` | Persist as explicit snapshot |
| `promotionSnapshot` | `promotionSnapshot` | Persist nullable |
| `voucherSnapshot` | `voucherSnapshot` | Persist nullable |
| `shippingQuoteSnapshot` | `shippingQuoteSnapshot` | Persist nullable |
| `pricingBreakdownSnapshot` | `pricingBreakdownSnapshot` | Persist exact submitted object |
| `note` | `note` | Free text/audit append safe |

Current persistence names such as `items`, `gift_lines`, `payment_type`, or `pricing_breakdown_snapshot` should be treated as internal storage names, not API contract names.

### Commercial Snapshot Mapping

| FE field | Proposed BE field | Notes |
|---|---|---|
| `pricingBreakdownSnapshot.subtotal` | `pricingBreakdownSnapshot.subtotal` | Pre-discount item subtotal |
| `pricingBreakdownSnapshot.manualDiscount` | `pricingBreakdownSnapshot.manualDiscount` | Separate invariant |
| `pricingBreakdownSnapshot.promotionDiscount` | `pricingBreakdownSnapshot.promotionDiscount` | Separate invariant |
| `pricingBreakdownSnapshot.voucherDiscount` | `pricingBreakdownSnapshot.voucherDiscount` | Separate invariant |
| `pricingBreakdownSnapshot.shippingFee` | `pricingBreakdownSnapshot.shippingFee` | Base shipping before shipping discounts |
| `pricingBreakdownSnapshot.shippingDiscount` | `pricingBreakdownSnapshot.shippingDiscount` | Promotion + voucher shipping relief |
| `pricingBreakdownSnapshot.vatBase` | `pricingBreakdownSnapshot.vatBase` | Post-discount taxable base |
| `pricingBreakdownSnapshot.vatPercent` | `pricingBreakdownSnapshot.vatPercent` | Explicit applied rate |
| `pricingBreakdownSnapshot.vatAmount` | `pricingBreakdownSnapshot.vatAmount` | Explicit monetary VAT |
| `pricingBreakdownSnapshot.total` | `pricingBreakdownSnapshot.total` | Final payable total |

### Invoice Mapping

| FE field | Proposed BE field | Notes |
|---|---|---|
| `number` | `number` | Human-facing invoice number |
| `date` | `date` | ISO timestamp |
| `status` | `status` | `active` or `cancelled` |
| `sourceType` | `sourceType` | `pos`, `online_pending`, `manual` |
| `pendingOrderId` | `pendingOrderId` | Nullable, required for converted online orders |
| `paymentMethod` | `paymentMethod` | Canonical response field |
| `lines` | `lines` | Canonical `InvoiceLine[]` |
| `giftLinesSnapshot` | `giftLinesSnapshot` | Separate from billable lines |
| `promotionSnapshot` | `promotionSnapshot` | Separate snapshot |
| `voucherSnapshot` | `voucherSnapshot` | Separate snapshot |
| `shippingQuoteSnapshot` | `shippingQuoteSnapshot` | Separate snapshot |
| `pricingBreakdownSnapshot` | `pricingBreakdownSnapshot` | Exact commercial basis |
| `vatPercent` | `vatPercent` | Transitional top-level compatibility field allowed |
| `pricingBreakdownSnapshot.vatPercent` | `pricingBreakdownSnapshot.vatPercent` | Canonical commercial VAT rate |
| `pricingBreakdownSnapshot.vatBase` | `pricingBreakdownSnapshot.vatBase` | Canonical taxable base |
| `pricingBreakdownSnapshot.vatAmount` | `pricingBreakdownSnapshot.vatAmount` | Canonical VAT amount |

Recommended backend rule: if top-level `vatPercent` is still accepted for compatibility, normalize it into `pricingBreakdownSnapshot.vatPercent` before persistence.

### Goods Receipt

| FE field | Proposed BE field | Notes |
|---|---|---|
| `number` | `number` | Receipt number |
| `date` | `date` | ISO date/time |
| `status` | `status` | `draft` or `confirmed` |
| `supplierId` | `supplierId` | Required |
| `supplierName` | `supplierName` | Denormalized snapshot for UI |
| `subtotal` | `subtotal` | Derived or stored |
| `shippingFee` | `shippingFee` | Stored |
| `vat` | `vat` | Stored money amount |
| `totalCost` | `totalCost` | Total receipt cost |
| `canDelete` | `canDelete` | Derived by downstream stock usage |
| `lines[].discountPercent` | `lines[].discountPercent` | Preserve name exactly |
| `lines[].lotCode` | `lines[].lotCode` | Filled on confirm |
| `lines[].batchId` | `lines[].batchId` | Filled on confirm |

### Inventory / batches / movements

| FE field | Proposed BE field | Notes |
|---|---|---|
| `InventoryProjection.onHand` | `onHand` | Derived from movements/batches |
| `reserved` | `reserved` | For future reservations |
| `available` | `available` | `onHand - reserved` |
| `byBatch[].qty` | `byBatch[].qty` | Current available qty per batch |
| `InventoryMovement.qtyDelta` | `qtyDelta` | Positive inbound, negative outbound |
| `InventoryMovement.sourceType` | `sourceType` | `goods_receipt`, `goods_receipt_delete`, `goods_receipt_void`, `invoice`, `invoice_cancel`, `production_consume`, `production_output`, `production_void_restore`, `production_void_output`, `stock_adjustment`, `manual` |
| `Batch.receiptId` | `receiptId` | Origin goods receipt |
| `Batch.productionOrderId?` | `productionOrderId` | Origin production order for finished output batches |

### Payment events

| FE field | Proposed BE field | Notes |
|---|---|---|
| `matchedCode` | `matchedCode` | Extracted candidate from transfer content |
| `linkedOrderCode` | `linkedOrderCode` | Final linked order code |
| `linkedBy` | `linkedBy` | `auto` or `admin` |
| `status` | `status` | `unmatched`, `matched`, `ignored`, `linked` |

### Products / Inventory truth mapping

| FE/UI concept | Backend truth | Notes |
|---|---|---|
| Product list row stock | Derived aggregation | Temporary UI projection only |
| Variant stock | `InventoryProjection` / variant-level projection | Operational truth |
| Raw material / non-sellable variant | Active variant with `isSellable=false` | Usable for inventory and production; hidden from sales/POS/storefront |
| Barcode | Variant field | Not product field |
| Expiry | Batch field | Never product field |
| Profit | Derived from invoice lines + batch/variant costs | Not product summary truth |
| Product legacy `sellPrice` / `stock` style fields | Adapter translation only | Transitional compatibility |

## 4. API Contract by Domain

### Pending Orders

#### Read endpoints

1. `POST /api/pending-orders`
   - Purpose: create online pending order from checkout
   - Body:
     - `customerId?`
     - `customerName?`
     - `customerPhone?`
     - `shippingAddress?`
     - `paymentMethod`
     - `lines`
     - `promotionSnapshot?`
     - `voucherSnapshot?`
     - `shippingQuoteSnapshot?`
     - `pricingBreakdownSnapshot`
     - `note?`
     - `expiresAt?`
   - Response: canonical `PendingOrder`

2. `GET /api/pending-orders/{id}`
   - Path param: backend id only
   - Response: `PendingOrder`

3. `GET /api/pending-orders/by-code/{code}`
   - Path param: business code only
   - Response: `PendingOrder`

4. `GET /api/pending-orders`
   - Query params:
     - `page`
     - `pageSize`
     - `query`
     - `status`
     - `sortField`
     - `sortDirection`
   - Response: `PagedResult<PendingOrder>`

#### Command-style mutation endpoints

5. `POST /api/pending-orders/{id}/mark-waiting-confirm`
   - Purpose: customer declares payment submitted
   - Body:
     - `note?`
   - Response: `PendingOrder`

6. `POST /api/pending-orders/{id}/change-payment-method`
   - Body:
     - `paymentMethod: "bank_transfer" | "momo" | "zalopay"`
   - Response: `PendingOrder`
   - Rules:
     - preserve snapshots and totals
     - regenerate payment session/QR metadata if required
     - reject if order is already terminal (`confirmed`, `cancelled`)
     - explicitly disallow switching a pending online order to `cash` in this endpoint
   - Rationale:
     - switching to `cash` changes fulfillment/commercial semantics and should only be allowed through a separate, explicitly designed conversion flow if the business wants it later

7. `POST /api/pending-orders/{id}/confirm`
   - Body:
     - `note?`
     - `confirmedBy?`
   - Response:
     - `{ pendingOrder, invoice }`
   - Rules:
     - transactional
     - create invoice
     - allocate stock/batches
     - emit inventory movements
     - mark order `confirmed`

8. `POST /api/pending-orders/{id}/cancel`
   - Body:
     - `reason?`
     - `note?`
     - `cancelledBy?`
   - Response: `PendingOrder`

#### Payment-event integration rule

Payment-event linking must not directly replace or bypass the confirm command. Linking may mark a payment event as associated to an order and may mark the order as payment-proven internally, but official sale finalization must still go through the transactional confirm flow that returns both `pendingOrder` and `invoice`.

### Payment Events / Reconciliation

1. `GET /api/payment-events/recent?limit=100`
2. `GET /api/payment-events/unmatched?limit=200`
3. `GET /api/payment-events/ignored?limit=100`
4. `GET /api/payment-events/by-order-code/{code}`
5. `POST /api/payment-events/{eventId}/link`
   - Body:
     - `orderCode`
     - `linkedBy: "auto" | "admin"`
   - Response:
     - `{ paymentEvent, pendingOrder, autoConfirmed: boolean }`
6. `POST /api/payment-events/{eventId}/ignore`
7. `POST /api/payment-events/{eventId}/unignore`
8. `GET /api/payment-events/unmatched/count`

If Casso/webhook ingestion is owned by the same backend:

9. `POST /api/webhooks/casso`
   - Internal auth/signature validation
   - Must extract `matchedCode`, create/update payment event, and optionally mark payment proof state without bypassing transactional confirm

### Payment Sessions

1. `POST /api/payment-sessions`
   - Body:
     - `pendingOrderId`
     - `method`
     - `reference`
     - `amount`
   - Response: `PaymentSession`

2. `GET /api/payment-sessions/by-reference/{reference}`
3. `POST /api/payment-sessions/{id}/cancel`

This can remain internal in Slice 1 if `PendingOrder.paymentReference` is enough for the current UI.

### Invoices

1. `POST /api/invoices`
   - Body:
     - `number?`
     - `date?`
     - `customerId?`
     - `customerName`
     - `customerPhone?`
     - `shippingAddress?`
     - `paymentMethod`
     - `createdBy?`
     - `note?`
     - `sourceType?`
     - `pendingOrderId?`
     - `lines`
     - `giftLinesSnapshot?`
     - `promotionSnapshot?`
     - `voucherSnapshot?`
     - `shippingQuoteSnapshot?`
     - `pricingBreakdownSnapshot` with:
       - `subtotal`
       - `manualDiscount`
       - `promotionDiscount`
       - `voucherDiscount`
       - `shippingFee`
       - `shippingDiscount`
       - `vatBase`
       - `vatPercent`
       - `vatAmount`
       - `total`
   - Response: canonical `Invoice`

2. `GET /api/invoices`
   - Query params:
     - `page`
     - `pageSize`
     - `query`
     - `status`
     - `paymentMethod`
     - `customerId`
     - `dateFrom`
     - `dateTo`
     - `sortField`
     - `sortDirection`

3. `GET /api/invoices/{id}`
4. `POST /api/invoices/{id}/cancel`
5. `DELETE /api/invoices/{id}`
   - Must enforce same-day delete rule or return business error code

### Goods Receipts

Current local backend contract note: Goods Receipt uses **confirmed-on-create** under `/api/receipts`. The older `/api/goods-receipts/drafts` and `/api/goods-receipts/{id}/confirm` entries below are historical / FE-local legacy wording only; backend adapters must not imply these endpoints are supported unless a future product-approved draft lifecycle is implemented.

1. `GET /api/goods-receipts`
   - Query params:
     - `page`
     - `pageSize`
     - `status`
     - `supplierId`
     - `query`
     - `dateFrom`
     - `dateTo`
     - `sortField`
     - `sortDirection`

2. `GET /api/goods-receipts/{id}`
3. `GET /api/goods-receipts/{id}/lines`
4. `POST /api/goods-receipts/drafts` — historical / FE-local legacy only; **not supported by current backend**.
   - Body: `CreateGoodsReceiptInput`
   - Response: `GoodsReceipt`
5. `POST /api/goods-receipts/{id}/confirm` — historical / FE-local legacy only; **not supported by current backend**.
   - Response: confirmed `GoodsReceipt` with `lotCode`/`batchId`
6. Current backend create path: `POST /api/receipts`
   - Creates a confirmed receipt, batches, stock mutation, and `goods_receipt` movements in one transaction.
7. Current backend metadata path: `PATCH /api/receipts/{id}/meta`
   - Updates note, supplier metadata, or receipt date only; no stock/cost mutation.
8. Current backend void path: `PATCH /api/receipts/{id}/void`
   - Voids a confirmed receipt; zeroes remaining stock and writes `goods_receipt_void` movements when remaining stock exists; fully consumed void is metadata-only.
9. `DELETE /api/goods-receipts/{id}` / `DELETE /api/receipts/{id}`
   - Only when `canDelete === true`

### Inventory

1. `GET /api/inventory/projections/{variantId}`
2. `GET /api/inventory/batches?variantId={variantId}`
3. `GET /api/inventory/movements`
   - Query params:
     - `variantId?`
     - `sourceType?`
     - `sourceId?`

### Products

1. `GET /api/products`
   - Query params:
     - `page`
     - `pageSize`
     - `query`
     - `categoryId`
     - `active`
     - `stockFrom`
     - `stockTo`
     - `sortField`
     - `sortDirection`
2. `GET /api/products/{id}`
3. `POST /api/products`
4. `PATCH /api/products/{id}`
5. `DELETE /api/products/{id}`
6. `POST /api/products/{id}/variants`
7. `PATCH /api/products/{id}/variants/{variantId}`
8. `DELETE /api/products/{id}/variants/{variantId}`
9. `POST /api/products/{id}/default-variant/{variantId}`

Product endpoints are administrative/catalog endpoints. Operational inventory truth is not product-level stock. Stock, batch, barcode, expiry, and profit resolve through variant and inventory domains. Any product-level stock numbers returned to current admin screens are temporary adapter projections.

Product and variant create/update must support `isSellable`. Sales-facing reads for POS/storefront must exclude non-sellable variants unless an admin endpoint explicitly requests them.

### Production / Assembly

1. `GET /api/production-recipes`
2. `GET /api/production-recipes/{id}`
3. `POST /api/production-recipes`
   - Body: `CreateProductionRecipeRequest`
   - Response: `ProductionRecipe`
4. `PATCH /api/production-recipes/{id}`
   - Body: partial recipe metadata/components update
   - Response: `ProductionRecipe`
5. `POST /api/production-recipes/{id}/archive`
   - Metadata-only archive; historical orders remain readable.
6. `POST /api/production-orders/preview`
   - Body: `ProductionPreviewRequest`
   - Response includes required component qty, available qty, max producible qty, estimated cost, and expected output expiry.
7. `POST /api/production-orders`
   - Body: `CreateProductionOrderRequest`
   - v1 is completed-on-create; no draft lifecycle.
   - Consumes raw batches FEFO and creates one finished output batch in the same transaction.
   - Appends `production_consume` and `production_output` movements.
8. `GET /api/production-orders`
9. `GET /api/production-orders/{id}`
10. `POST /api/production-orders/{id}/void`
    - Allowed only when the output batch has no downstream consumption.
    - Restores raw batches exactly from saved allocation trace and removes/zeroes the output batch with `production_void_restore` / `production_void_output` movements.

### Promotions

1. `POST /api/promotions/evaluate`
   - Body: `CartContext`
   - Response: `EvaluatedPromotion[]`
2. `POST /api/promotions/pick-best`
   - Body: `CartContext`
   - Response: `EvaluatedPromotion | null`
3. `GET /api/admin/promotions`
   - Query params:
     - `page`
     - `pageSize`
     - `query`
     - `active`
     - `kinds[]`
     - `dateFrom`
     - `dateTo`
4. `GET /api/admin/promotions/{id}`
5. `PUT /api/admin/promotions/{id}`
6. `POST /api/admin/promotions`
7. `POST /api/admin/promotions/{id}/toggle-active`
8. `DELETE /api/admin/promotions/{id}`

### Vouchers

1. `POST /api/vouchers/validate`
   - Body:
     - `code`
     - `cartContext`
   - Response:
     - `{ valid, snapshot?, reasonIfInvalid? }`
2. Admin voucher CRUD should exist too:
   - `GET /api/admin/vouchers`
   - `GET /api/admin/vouchers/{id}`
   - `POST /api/admin/vouchers`
   - `PATCH /api/admin/vouchers/{id}`
   - `POST /api/admin/vouchers/{id}/toggle-active`
   - `DELETE /api/admin/vouchers/{id}`

### Categories

1. `GET /api/categories?active=true&page=1&pageSize=1000`
2. `POST /api/categories`
3. `PATCH /api/categories/{id}`
4. `DELETE /api/categories/{id}`

### Shipping / Address / Store Settings / VietQR

1. `GET /api/addresses/provinces`
2. `GET /api/addresses/districts?provinceCode=...`
3. `GET /api/addresses/wards?districtCode=...`
4. `POST /api/shipping/quote`
   - Body: `ShippingQuoteInput`
5. `GET /api/store/payment-settings`
6. `PUT /api/store/payment-settings`
7. `POST /api/vietqr/generate`
   - Body: `VietQrRequest`
   - Response: `VietQrResult`

## 5. DTO Proposals

### PricingBreakdownSnapshot DTO

```json
{
  "subtotal": 200000,
  "manualDiscount": 0,
  "promotionDiscount": 10000,
  "voucherDiscount": 5000,
  "shippingFee": 30000,
  "shippingDiscount": 15000,
  "vatBase": 185000,
  "vatPercent": 0,
  "vatAmount": 0,
  "total": 200000
}
```

### CreatePendingOrderRequest

```json
{
  "customerId": "string|null",
  "customerName": "string|null",
  "customerPhone": "string|null",
  "shippingAddress": {
    "receiverName": "string",
    "phone": "string",
    "provinceCode": "string",
    "provinceName": "string",
    "districtCode": "string",
    "districtName": "string",
    "wardCode": "string",
    "wardName": "string",
    "street": "string",
    "note": "string|null"
  },
  "paymentMethod": "bank_transfer|momo|zalopay",
  "lines": [
    {
      "id": "string",
      "productId": "string",
      "variantId": "string",
      "productName": "string",
      "variantName": "string|null",
      "qty": 1,
      "unitPrice": 100000,
      "lineSubtotal": 100000
    }
  ],
  "promotionSnapshot": null,
  "voucherSnapshot": null,
  "shippingQuoteSnapshot": {
    "source": "carrier_api|zone_fallback",
    "zoneCode": "HCM_INNER",
    "fee": 30000,
    "etaDays": { "min": 1, "max": 2 }
  },
  "pricingBreakdownSnapshot": {
    "subtotal": 200000,
    "manualDiscount": 0,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "vatBase": 185000,
    "vatPercent": 0,
    "vatAmount": 0,
    "total": 200000
  },
  "note": "string|null",
  "expiresAt": "2026-04-23T14:30:00.000Z|null"
}
```

### PendingOrderResponse

```json
{
  "id": "uuid",
  "code": "DH-20260423-001",
  "createdAt": "2026-04-23T12:00:00.000Z",
  "expiresAt": "2026-04-23T14:30:00.000Z",
  "status": "pending_payment",
  "customerId": null,
  "customerName": "Nguyen Van A",
  "customerPhone": "0901234567",
  "shippingAddress": {},
  "paymentMethod": "bank_transfer",
  "paymentReference": "DH-20260423-001",
  "lines": [],
  "giftLinesSnapshot": [],
  "promotionSnapshot": null,
  "voucherSnapshot": null,
  "shippingQuoteSnapshot": {},
  "pricingBreakdownSnapshot": {
    "subtotal": 200000,
    "manualDiscount": 0,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "vatBase": 185000,
    "vatPercent": 0,
    "vatAmount": 0,
    "total": 200000
  },
  "note": null
}
```

### MarkWaitingConfirmRequest

```json
{
  "note": "string|null"
}
```

### ChangePaymentMethodRequest

```json
{
  "paymentMethod": "bank_transfer|momo|zalopay"
}
```

### ConfirmPendingOrderRequest

```json
{
  "note": "string|null",
  "confirmedBy": "string|null"
}
```

### CancelPendingOrderRequest

```json
{
  "reason": "string|null",
  "note": "string|null",
  "cancelledBy": "string|null"
}
```

### PaymentEventResponse

```json
{
  "id": "uuid",
  "provider": "casso",
  "providerTxId": "string",
  "amount": 215000,
  "transferContent": "DH-20260423-001",
  "matchedCode": "DH-20260423-001",
  "bankAccount": "string|null",
  "bankSubAcc": "string|null",
  "txTime": "2026-04-23T12:05:00.000Z|null",
  "linkedOrderCode": "DH-20260423-001|null",
  "linkedAt": "2026-04-23T12:06:00.000Z|null",
  "linkedBy": "auto|admin|null",
  "status": "unmatched|matched|ignored|linked",
  "createdAt": "2026-04-23T12:05:10.000Z"
}
```

### LinkPaymentEventRequest

```json
{
  "orderCode": "DH-20260423-001",
  "linkedBy": "admin"
}
```

### CreateInvoiceRequest

```json
{
  "number": "string|null",
  "date": "2026-04-23T12:30:00.000Z|null",
  "customerId": "string|null",
  "customerName": "string",
  "customerPhone": "string|null",
  "shippingAddress": {},
  "paymentMethod": "cash|bank_transfer|momo|zalopay",
  "createdBy": "admin|online|string|null",
  "note": "string|null",
  "sourceType": "pos|online_pending|manual",
  "pendingOrderId": "string|null",
  "lines": [],
  "giftLinesSnapshot": [],
  "promotionSnapshot": {},
  "voucherSnapshot": {},
  "shippingQuoteSnapshot": {},
  "pricingBreakdownSnapshot": {
    "subtotal": 200000,
    "manualDiscount": 0,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "vatBase": 185000,
    "vatPercent": 0,
    "vatAmount": 0,
    "total": 200000
  }
}
```

### GoodsReceiptDraftRequest

```json
{
  "number": "PN-20260423-001|null",
  "date": "2026-04-23T00:00:00.000Z",
  "supplierId": "string",
  "supplierName": "string",
  "shippingFee": 100000,
  "vat": 50000,
  "note": "string|null",
  "lines": [
    {
      "variantId": "string|null",
      "productCode": "string|null",
      "variantCode": "SP001-RED",
      "productName": "string",
      "variantName": "string|null",
      "importUnit": "thung",
      "piecesPerUnit": 24,
      "quantity": 10,
      "unitCost": 50000,
      "discountPercent": 5,
      "expiryDate": "2026-12-31T00:00:00.000Z|null"
    }
  ]
}
```

### GoodsReceiptResponse

```json
{
  "id": "uuid",
  "number": "PN-20260423-001",
  "date": "2026-04-23T00:00:00.000Z",
  "status": "draft|confirmed",
  "supplierId": "string",
  "supplierName": "string",
  "itemCount": 3,
  "subtotal": 1000000,
  "shippingFee": 100000,
  "vat": 50000,
  "totalCost": 1150000,
  "note": null,
  "createdBy": "admin",
  "canDelete": true
}
```

### InventoryProjectionResponse

```json
{
  "variantId": "string",
  "onHand": 120,
  "reserved": 10,
  "available": 110,
  "byBatch": [
    {
      "batchId": "string",
      "lotCode": "LO240423A",
      "qty": 60,
      "expiryDate": "2026-10-01T00:00:00.000Z"
    }
  ]
}
```

### Production DTOs

Raw/weighted stock uses integer base units. Example: raw bánh tráng and raw muối use `g`; importing `1kg` stores `1000g`. Finished `Bánh tráng muối 400g` output qty `1` pack consumes `200g` bánh tráng + `200g` muối.

#### CreateProductionRecipeRequest

```json
{
  "code": "BTM-400G",
  "name": "Bánh tráng muối 400g",
  "outputProductId": "finished-product-id",
  "outputVariantId": "finished-variant-id",
  "outputQty": 1,
  "overheadCost": 0,
  "components": [
    { "productId": "banh-trang-raw", "variantId": "banh-trang-g", "qtyPerOutput": 200, "unit": "g" },
    { "productId": "muoi-raw", "variantId": "muoi-g", "qtyPerOutput": 200, "unit": "g" }
  ]
}
```

#### ProductionPreviewRequest / Response

```json
{
  "recipeId": "recipe-id",
  "outputQty": 1,
  "overheadCost": 0
}
```

```json
{
  "maxProducibleQty": 5,
  "estimatedOutputUnitCost": 12000,
  "expectedOutputExpiryDate": "2026-10-01",
  "components": [
    { "variantId": "banh-trang-g", "requiredQty": 200, "availableQty": 1000, "unit": "g" },
    { "variantId": "muoi-g", "requiredQty": 200, "availableQty": 1000, "unit": "g" }
  ]
}
```

#### CreateProductionOrderRequest

```json
{
  "recipeId": "recipe-id",
  "outputQty": 1,
  "overheadCost": 0,
  "note": "Đóng gói BTM 400g"
}
```

#### ProductionOrderResponse

```json
{
  "id": "production-order-id",
  "number": "SX-20260427-001",
  "status": "completed",
  "outputVariantId": "finished-variant-id",
  "outputQty": 1,
  "outputBatchId": "batch-id",
  "outputExpiryDate": "2026-10-01",
  "outputUnitCost": 12000,
  "components": [
    {
      "variantId": "banh-trang-g",
      "consumedQty": 200,
      "allocations": [{ "batchId": "raw-batch-1", "qty": 200, "unitCost": 20 }]
    }
  ]
}
```

### VoucherValidationRequest / Response

```json
{
  "code": "NHADAN10",
  "cartContext": {
    "lines": [],
    "subtotal": 200000,
    "customerId": "string|null",
    "voucherCode": "NHADAN10",
    "manualDiscount": 0,
    "shippingAddress": {},
    "shippingQuote": {}
  }
}
```

```json
{
  "valid": true,
  "snapshot": {
    "code": "NHADAN10",
    "ruleSummary": "Giảm 10%",
    "discountAmount": 20000,
    "shippingDiscountAmount": 0
  },
  "reasonIfInvalid": null
}
```

## 6. Status Transition Matrix

### Pending Order

| Current | Trigger | Next | Notes |
|---|---|---|---|
| `pending_payment` | Customer clicks "Tôi đã thanh toán" | `waiting_confirm` | Claim only |
| `pending_payment` | Bank webhook/payment event matched fully | `paid_auto` | FE already distinguishes auto-paid |
| `pending_payment` | Admin confirms manually | `confirmed` | Should create invoice transactionally |
| `pending_payment` | Admin cancels | `cancelled` | Final |
| `pending_payment` | Expiry job runs | `cancelled` | Recommended explicit expiry outcome |
| `waiting_confirm` | Admin confirms | `confirmed` | Invoice creation point |
| `waiting_confirm` | Bank webhook matched fully before admin action | `paid_auto` | Still invoice should be created or queued through confirm flow |
| `waiting_confirm` | Admin cancels | `cancelled` | Final |
| `paid_auto` | Admin finalizes/creates invoice | `confirmed` or remain `paid_auto` | Open design choice; confirm flow should still own invoice creation |
| `confirmed` | none | terminal | Invoice exists |
| `cancelled` | none | terminal | Final |

Recommended backend simplification: expose both `paid_auto` and `confirmed`, but treat `confirmed` as "invoice created / order completed" and `paid_auto` as "payment proven, awaiting fulfillment finalization".

### Invoice

| Current | Trigger | Next | Notes |
|---|---|---|---|
| `active` | Cancel invoice | `cancelled` | Must restore stock/inventory if stock was deducted |
| `active` | Delete same-day invoice | deleted | Hard-delete rule |
| `cancelled` | none | terminal | No restore route exposed in FE |

### Goods Receipt

| Current | Trigger | Next | Notes |
|---|---|---|---|
| `draft` | Confirm receipt | `confirmed` | Create batches and movements |
| `draft` | Delete draft | deleted | Allowed |
| `confirmed` | Delete receipt when `canDelete=true` | deleted | Must reverse stock and delete derived batches/movements safely |
| `confirmed` | Delete when `canDelete=false` | blocked | Business error |

### ProductionOrder

| Current | Trigger | Next | Notes |
|---|---|---|---|
| `completed` | Void and output batch has no downstream consumption | `voided` | Restore consumed raw batches exactly and reverse/zero output batch |
| `completed` | Void when output batch has been sold/consumed | blocked | Business error; no partial guessing |
| `voided` | none | terminal | Historical allocation snapshot remains readable |

### Payment Session

| Current | Trigger | Next |
|---|---|---|
| `pending` | Matching payment event | `matched` |
| `pending` | Timeout/expiry | `expired` |
| `pending` | Manual cancel | `cancelled` |
| `matched` | none | terminal |

### Payment Event

| Current | Trigger | Next |
|---|---|---|
| `unmatched` | code extracted automatically | `matched` |
| `unmatched` | admin ignores | `ignored` |
| `unmatched` | admin links to order | `linked` |
| `matched` | admin links to order | `linked` |
| `ignored` | admin restores | `unmatched` |

## 7. Source-of-Truth Rules

1. `src/services/types.ts` remains the FE contract baseline, while the upgraded backend commercial truth explicitly preserves:
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
2. `pricingBreakdownSnapshot` is the canonical commercial record for pending orders and invoices.
3. Transitional FE fields may still exist in some screens; adapter compatibility may bridge them temporarily, but backend persistence and response contracts should stay on the upgraded snapshot shape.
4. The following are immutable historical snapshots once an order or invoice is created:
   - `promotionSnapshot`
   - `voucherSnapshot`
   - `shippingQuoteSnapshot`
   - `pricingBreakdownSnapshot`
   - `giftLinesSnapshot`
5. These snapshot fields must never be recomputed for old orders or invoices based on current promotions, current vouchers, current shipping rules, current tax rules, or current catalog state.
6. `paymentReference` is the source of truth for customer transfer content and should be generated deterministically from the business order code unless a future payment-session design supersedes it.
7. Payment event ingestion is the source of truth for bank-transfer proof; customer self-confirm only marks intent/claim.
8. Business transitions on pending orders should use explicit command endpoints, not a broad business PATCH.
9. Invoice creation is the source of truth for finalized sale completion and stock deduction for online orders.
10. `GoodsReceipt` confirmation is the source of truth for inbound stock creation.
11. `canDelete` on goods receipts must be derived by downstream stock consumption, not manually toggled.
12. Inventory truth is variant/batch/movement-centric, not product-summary-centric.
13. Any product-level stock/profit summaries returned to current admin pages are compatibility projections only.
14. Production order snapshot/allocation is immutable after completion.
15. Production output batch cost must come from actual consumed batch allocations plus approved overhead, not from current recipe estimates.
16. Inventory reporting must be movement-aware or explicitly include production movements; receipt/invoice-only reporting is invalid after production is introduced.

## 8. Vertical Slice Plan

1. Slice 1A: PendingOrder creation and pending-payment read path
   - `POST /api/pending-orders`
   - `GET /api/pending-orders/{id}`
   - `GET /api/pending-orders/by-code/{code}`
   - `POST /api/pending-orders/{id}/change-payment-method`
   - support pending-payment page reads
   - persist `expiresAt`
   - generate `paymentReference`
   - preserve full snapshots including explicit VAT fields

2. Slice 1B: Payment events and reconciliation worklist
   - unmatched/recent/ignored payment event queries
   - manual link flow
   - count endpoint
   - webhook-fed event ingestion if owned by same backend
   - keep order reads consistent with linked payment results

3. Slice 2: PendingOrder confirm -> Invoice transactional creation
   - `POST /api/pending-orders/{id}/confirm`
   - create linked invoice transactionally
   - preserve snapshots
   - record invoice origin metadata
   - move stock/allocation side effects into the same transaction boundary or durable workflow

4. Slice 3: Inventory ledger and batch allocation
   - real `InventoryMovement`
   - `InventoryProjection`
   - invoice allocations
   - stock restore on invoice cancel

5. Slice 4: Goods receipts with lifecycle rules
   - current local model: confirmed-on-create receipt lifecycle (`POST /api/receipts`)
   - delete / void / `canDelete` / `deleteBlockReason` complete
   - real draft/confirm deferred as a new feature if ever needed

6. Slice 5: Products/categories remote CRUD
   - remote catalog CRUD
   - temporary legacy translation for current admin UI
   - keep inventory truth outside product summary fields
   - audit/add `isSellable` support for variants before production
   - include Excel import compatibility because imports can create or update `ProductVariant` rows outside normal product CRUD
   - `ProductVariant.isSellable` must flow through every variant creation/update path:
     - product/variant admin CRUD
     - product Excel import
     - goods receipt Excel import
     - FE backend adapter
     - FE local/mock adapter
     - FE import parser, staging, and preview types

### Slice 5 Excel Import Compatibility

`ProductVariant.isSellable` is required in Slice 5 because raw materials and admin inventory variants can be active inventory records without being customer-facing products.

- `isSellable=true` means the variant is sellable in POS, storefront, and other customer-facing sales flows.
- `isSellable=false` means the variant is active for inventory/admin/production later, but hidden from sales.
- Missing or `null` `isSellable` defaults to `true` for backward compatibility.
- Receipt/manual inventory flows may use active non-sellable variants.
- Sales-facing flows must reject inactive products, inactive variants, and `isSellable=false` variants.
- Excel imports that create raw materials must be able to set `isSellable=false`.

Goods receipt Excel import requirements:

- Add optional Excel column `isSellable` / `Bán hàng?`.
- Recommended placement is after the current expiry columns so existing N/O expiry columns remain stable.
- Missing or blank `isSellable` defaults to `true`.
- Accepted true values: `true`, `1`, `yes`, `y`, `co`, `có`, `ban`, `bán`, `sellable`.
- Accepted false values: `false`, `0`, `no`, `n`, `khong`, `không`, `nguyen_lieu`, `nguyên liệu`, `raw`, `inventory`.
- Preview must show whether each row creates/updates a sellable or non-sellable variant.
- When creating `NEW_PRODUCT` or `CREATE_NEW` variants, set `ProductVariant.isSellable` from Excel.
- For existing variants, do not silently overwrite `isSellable` unless the value is explicit. Prefer warning/preview visibility if the value differs from DB.
- Old templates without this column must still work.

Product Excel import requirements:

- If product import creates default variants, it must support `isSellable`.
- Existing product import rows without `isSellable` default to `true`.
- Product import preview response/type should expose `isSellable` if added to the template.

Variant code guard:

- `variantCode` is strongly required/recommended when importing products with multiple variants, raw materials, non-sellable variants, or new variants under existing products.
- If `variantCode` is blank, backend may fall back to a default variant. This is dangerous for raw materials because stock can be imported into the wrong variant.
- Slice 5 acceptance must include warning or validation behavior for missing `variantCode` when the row appears to create raw/non-sellable material or when the product has multiple variants.
- Do not make old Excel files fail globally. Preserve backward compatibility, but add clear preview warnings or stricter validation only for risky cases.

Unit semantics for raw/weighted materials:

- For raw/weighted materials, `sellUnit` should be treated as the base stock unit, not necessarily a customer-sale unit.
- Example: `importUnit=kg`, `sellUnit/baseUnit=g`, `piecesPerUnit=1000`, `isSellable=false`.
- `ProductBatch.remainingQty` stores quantity in the variant base/sell unit.
- `ProductVariant.stockQty` remains a projection.
- Product-level stock remains adapter/read-model compatibility only.
- Do not introduce product-level stock truth.

Expiry field synchronization:

- Goods receipt import must distinguish `expiryDateOverride` as the actual batch expiry date from `expiryDays` as shelf-life days used for new variants and default batch expiry calculation.
- Template docs, controller comments, FE parser, and backend parser must stay aligned.
- For new product/new variant rows created by receipt import, `expiryDays` should be required unless a deliberate no-expiry policy is documented.
- If no-expiry products are supported, use an explicit convention such as `3650` days rather than `null` ambiguity.
- Existing batches must not be retroactively changed when `variant.expiryDays` is updated.

Optional / Deferred Field Candidates:

- Optional but useful in Slice 5 if low risk:
  - `variantName`: lets Excel create readable variant names instead of deriving from product name/unit; defaults to `productName` or generated name when missing.
  - `minStockQty`: product import already has min stock behavior; receipt import-created variants currently risk defaulting to a meaningless value such as `5`, especially for gram-based raw materials; missing value can default to the existing system default.
- Optional, should likely defer unless already easy:
  - `mfgDate`: `ProductBatch` already has `mfgDate`, but import request/import Excel may not expose it. Useful for traceability, but not required for Slice 5 CRUD closure.
  - `supplierLotNo` / `vendorBatchCode`: useful for recall and supplier traceability. Requires a new DB field if not present, so defer from Slice 5 unless explicitly approved.
  - `inventoryRole`: possible values could be `RAW`, `FINISHED`, `PACKAGING`, `BOTH`. Do not add now as a required Slice 5 field. For the current plan, use `isSellable=false` plus category/type conventions. Revisit in Slice 6 Production if raw/finished classification becomes necessary.

Concrete import examples:

Raw bánh tráng import:

- `productCode=BT-RAW`
- `variantCode=BT-RAW-G`
- `productName=Bánh tráng nguyên liệu`
- `category=Nguyên liệu`
- `quantity=1`
- `unitCost=50000`
- `importUnit=kg`
- `sellUnit/baseUnit=g`
- `piecesPerUnit=1000`
- `expiryDays=30` or `expiryDateOverride=<actual date>`
- `sellPrice=0` or blank
- `isSellable=false`

Salt raw import:

- `productCode=MUOI-RAW`
- `variantCode=MUOI-RAW-G`
- `importUnit=kg`
- `sellUnit/baseUnit=g`
- `piecesPerUnit=1000`
- `isSellable=false`

7. Slice 6: Production recipes + production orders
   - `isSellable` support for raw/non-sellable variants
   - recipe CRUD/archive
   - completed-on-create production orders
   - raw component FEFO allocation
   - finished output batch creation
   - production movement ledger
   - production void guard and exact allocation restore

8. Slice 7: Promotion evaluation + voucher validation
   - backend evaluation/validation with identical snapshots

9. Slice 8: Payment sessions formalization
   - explicit payment session lifecycle if needed beyond `paymentReference`

10. Slice 9: Reporting endpoints
   - revenue, profit, inventory reporting after invoice/inventory truth is live
   - inventory reporting must include all inventory movement source types, especially production, not only receipts and invoices

## 9. Acceptance Checklist

1. Pending-order create/read responses preserve `pricingBreakdownSnapshot.vatBase`, `vatPercent`, and `vatAmount`.
2. Adapter compatibility is used only where current FE screens still carry transitional VAT/commercial fields; backend contract remains on the upgraded snapshot shape.
3. `expiresAt` is persisted and returned on pending-order reads.
4. `paymentReference` is generated and returned as `code`.
5. Pending-order lookup is split cleanly between:
   - `GET /api/pending-orders/{id}`
   - `GET /api/pending-orders/by-code/{code}`
6. `POST /api/pending-orders/{id}/mark-waiting-confirm` transitions status from `pending_payment` to `waiting_confirm`.
7. `POST /api/pending-orders/{id}/change-payment-method` supports only online methods and explicitly rejects `cash`.
8. Payment-event linking does not bypass the transactional confirm flow.
9. `POST /api/pending-orders/{id}/confirm` returns both `pendingOrder` and `invoice`.
10. Confirming a pending order preserves invoice linkage with `invoice.pendingOrderId = pendingOrder.id`.
11. Invoice responses preserve explicit VAT fields in the commercial snapshot.
12. Invoice cancellation is logical state change only, not hard delete.
13. Hard delete, where allowed, remains a separate restricted invoice operation.
14. Snapshot fields remain immutable on historical reads:
   - `promotionSnapshot`
   - `voucherSnapshot`
   - `shippingQuoteSnapshot`
   - `pricingBreakdownSnapshot`
   - `giftLinesSnapshot`
15. Product API docs state clearly that legacy product translation is temporary and inventory truth is variant-centric.
16. Non-sellable raw variants do not appear in POS/storefront sales reads.
17. Product Excel import can create variants with `isSellable`, defaulting missing values to `true`.
18. Goods receipt Excel import can create product/variant rows with `isSellable`, defaulting missing values to `true`.
19. FE receipt import parser/staging/preview types preserve `isSellable`.
20. FE product import parser/preview types preserve `isSellable` if product import creates variants.
21. Import preview clearly shows non-sellable/raw-material rows.
22. Risky missing `variantCode` cases show a clear warning or validation error.
23. `expiryDateOverride` and `expiryDays` are not confused.
24. New raw-material imports can be active inventory items but cannot appear in POS/storefront.
25. Existing templates remain backward-compatible.
26. No Production/Slice 6 endpoints, classes, or tables are implemented as part of Slice 5.

**Slice 5 is not considered closed** until the following are covered by **passing automated tests** (not manual-only): backend integration tests for product Excel and goods receipt Excel (`ExcelImportService` / `ExcelReceiptImportService` preview and import, including `isSellable` cột N/P, defaults, invalid tokens, batch qty, and existing-variant / blank-`variantCode` warnings as implemented), and Vitest on the active FE parser facade (`parseProductExcel` / `parseReceiptExcel` from `excel-parser`, real in-memory `.xlsx`). **Do not mark Slice 5 done** until these tests pass, plus the same end-to-end product behavior above: `isSellable` (N/P), FE parser/staging preserves `isSellable`, and risky blank `variantCode` paths emit warning/error as designed. Checklist items 17–26 above are the Slice 5 import/Catalog bar; do not mark Slice 5 done if any of 17–22 or 25–26 fail verification.

#### Slice 6 / future acceptance (not required to close Slice 5)

27. Production consumes exact raw batch quantities and creates the exact finished output batch.
28. Production output batch cost and expiry match the consumed allocation rules.
29. Production movements are append-only.
30. Inventory projection remains correct after production.
31. Inventory report is production-aware or explicitly documented as not production-ready until Slice 9.

## 10. Risks / Open Questions

1. Some FE surfaces may still rely on transitional invoice/commercial fields during migration, so short-term adapter compatibility is expected even though the backend contract is tightened.
2. Because `cash` is disallowed in `change-payment-method`, any future switch from a pending online order to cash requires a separate designed conversion flow. That is intentionally left out of the current pack to avoid hidden business side effects.
3. Payment-event linking currently suggests possible direct order confirmation in existing FE behavior; the real backend must tighten this so link/payment-proof and transactional confirm are distinct steps unless a single orchestrated confirm command is invoked.
4. The FE currently distinguishes `paid_auto` from `confirmed`, but admin list views do not fully surface that distinction. Backend implementation should decide whether `paid_auto` is a durable visible state or just an intermediate payment-proven state before `confirm`.
5. Product admin screens still consume legacy product summary fields, so there is short-term risk that stakeholders read product-level stock/profit as authoritative; the backend spec should keep repeating that these are temporary compatibility projections only.
6. Production depends on Slice 5 exposing `isSellable` across Product/Variant CRUD and Excel import paths; implement Production only after Slice 5 confirms raw/non-sellable variant support.
7. Reporting that only reads receipts and invoices becomes incomplete after Production exists; Slice 9 must include production movement source types or clearly mark reports as not production-ready.
8. Should receipt import be allowed to update `isSellable` on existing variants, or only set it when creating new variants?
9. Should `variantCode` become mandatory for all receipt imports after migration, or only for multi-variant/raw-material rows?
10. Should `mfgDate` be exposed now because `ProductBatch` already has it?
11. Should `supplierLotNo` be deferred to a dedicated traceability slice?
12. Should `inventoryRole` be added in Slice 6 Production or remain category/`isSellable` driven?
