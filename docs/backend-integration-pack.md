# Backend Integration Pack

## Current Backend Integration Addendum — 2026-04-27

This addendum documents the completed local backend state after ProductBatch status slices 0-6 and records the decision-complete target for the next Production / Đóng Gói Thành Phẩm Từ Nguyên Liệu slice.

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
- Slice 6 scope is DB + Backend API + React admin UI for Production recipes and completed-on-create Production orders.
- `ProductionOrder` is the source of truth for internal raw-material consumption and finished-batch creation.
- `ProductionOrder` must store recipe snapshot, output batch identity, consumed component snapshot, and exact raw batch allocation trace.
- Production is not Combo and not Goods Receipt: Combo is a virtual commercial bundle; Goods Receipt is supplier inbound stock; Production consumes raw material batches and creates real finished product batches.
- Production movements are append-only `InventoryMovement` rows with source types `production_consume`, `production_output`, `production_void_restore`, and `production_void_output`.
- `ProductVariant.isSellable=false` means the variant is active for inventory/production but hidden from sales/POS/storefront.
- Production raw input eligibility is `ProductBatch.status=active`, `remainingQty > 0`, `expiryDate >= current date`, product active, and variant active. Do not require component `variant.isSellable=true`; non-sellable raw variants are valid production inputs.
- `ProductBatch.remainingQty` remains inventory truth for raw consumption and finished output. `ProductVariant.stockQty` remains a synced projection. Product-level stock must not drive inventory truth.
- Production recipe adds `outputMustBeSellable`, default `true`. When `true`, the output variant must be active and `isSellable=true`; when `false`, only active product + active variant is required. The recipe validates output intent but never mutates `ProductVariant.isSellable`.
- Slice 6 does not create a separate raw-material table. Raw materials are normal `ProductVariant` + `ProductBatch` records, often with `isSellable=false`.
- Raw/weighted stock should use integer base units, e.g. `1 kg = 1000 g`, not decimal stock like `0.2 kg`.
- Production output batch expiry defaults to the minimum expiry date among consumed component batches.
- Production output batch cost is `(actual weighted consumed allocation cost + overheadCost) / outputQty`.
- Production v1 is completed-on-create. There is no draft lifecycle in Slice 6; `ProductionOrderStatus` is `completed` or `voided`.
- Production void is all-or-nothing: allowed only when the completed order output batch has no downstream consumption; restore exact raw allocations from the saved trace; zero/void the output batch; no guessing and no partial void.

Older sections below may contain historical/transitional wording; use this addendum as the current local baseline until the full pack is rewritten carefully.

## Slice 6B: Batch-Level POS Traceability

### Problem

Current POS barcode flow usually scans a product or variant barcode. Invoice creation then deducts stock by FEFO, so the backend may allocate a different batch than the physical item the customer is holding. That breaks physical traceability and can make COGS/profit inaccurate when batches have different costs, especially for Production output batches.

### Locked Local Solution

- Canonical batch barcode payload is `BATCH:{batchId}`.
- POS scan resolves the barcode through backend API, adds batch-scanned cart lines with `batchId`, and sends that `batchId` on invoice item creation.
- When an invoice line has `batchId`, backend locks and deducts exactly that `ProductBatch`; it must not auto-FEFO that line.
- FEFO remains the fallback only for invoice lines without `batchId`, including legacy variant scans, pending-order confirmation for now, and combo component deduction for now.
- Exact-batch invoice allocation writes `SalesInvoiceItemBatchAllocation` for the scanned batch, and invoice cancel/void restores from that allocation trace.
- Profit/COGS for a batch-scanned sale uses the exact scanned batch `costPrice` as the invoice item `unitCostSnapshot`.
- Production output batches become physically traceable only when sold by their batch barcode; otherwise legacy no-`batchId` sales still use FEFO fallback.

### Backend Contract

`GET /api/pos/scan/{code}` supports both batch and variant scans.

- Batch scan input: `BATCH:{batchId}`.
- Variant scan input: existing variant code / product code behavior.
- Security must explicitly protect `GET /api/pos/scan/**` in `SecurityConfig`; use authenticated access or the same access policy as invoice creation. Do not rely on the endpoint falling through to `anyRequest`.
- Response identifies `kind: "batch" | "variant"` and returns POS display fields:
  - `productId`, `productName`
  - `variantId`, `variantName`, `variantCode`
  - `price`
  - product active/inactive state
  - variant active/inactive state
  - `isSellable`
  - for batch scans: `batchId`, `batchCode`, `expiryDate`, `remainingQty`, `batchStatus`, batch active/sellable state
  - `blockReason` or equivalent when the scanned target is known but not currently sellable/scannable
- Scan response validation is for POS display and cashier feedback only. Final invoice creation still revalidates under lock.

`InvoiceItemRequest.batchId` is optional. When present, invoice creation must revalidate under lock:

- batch belongs to requested product and variant
- backend must not trust frontend `productId` / `variantId` blindly; mismatch between request identity and locked batch identity must be rejected
- product is active
- variant is active and `isSellable=true`
- batch status is `active`
- batch is not expired by the business date
- batch has enough `remainingQty`
- deduction updates `ProductBatch.remainingQty`, syncs `ProductVariant.stockQty`, and returns the same deduction result shape as FEFO so invoice allocation/movement code remains shared
- expiry validation must use the configured app/business clock, for example `LocalDate.now(businessClock)`, not `ProductBatch.isExpired()` if that helper uses system `LocalDate.now()`
- exact-batch deduction still appends normal invoice inventory movements through the existing allocation/movement path; do not introduce a new movement source type for batch-scanned POS sales. Movement source type remains `invoice`, and trace precision comes from `SalesInvoiceItemBatchAllocation.batchId`.

### Frontend Contract

- Batch-scanned cart lines carry `batchId`, `batchCode`, `expiryDate`, and `remainingQty`.
- Same batch scans merge by `batchId`.
- Different batches of the same variant stay as separate cart lines.
- Legacy variant scans may still merge by variant identity and send no `batchId`.
- Checkout must include `batchId` for batch-scanned invoice lines and must call the backend invoice API for any cart containing batch-scanned lines.
- If backend/session is unavailable or checkout fails, POS must show an error and must not create a misleading local stock mutation. Local/mock checkout behavior may remain only for non-batch demo flows.
- Batch labels encode `BATCH:{batchId}` and display human-readable batch code, product, variant, expiry date, and price.
- Goods receipt label printing must use confirmed backend batch identity. If the current receipt response/adapter does not expose `batchId` / `batchCode`, implementation must extend the response/adapter or fetch confirmed batches. Do not print `variantCode` as a fake batch barcode.
- Production output batch labels must encode `BATCH:{outputBatchId}`. `outputBatchCode` may be displayed for humans, but it is not the canonical barcode payload unless a secondary lookup is explicitly implemented later.
- Production output label printing therefore depends on `outputBatchId`, not only `outputBatchCode`.

### Slice 6B Acceptance Checklist

- `SecurityConfig` has an explicit `/api/pos/scan/**` rule.
- Exact-batch expiry validation uses the configured business clock.
- Batch-scanned POS checkout posts backend invoice lines with `batchId`.
- Backend rejects mismatched product / variant / batch payloads, including batch belonging to a different variant, batch belonging to a different product, or request product/variant inconsistent with batch identity.
- Exact-batch invoice creates a `SalesInvoiceItemBatchAllocation` row for the scanned batch.
- Exact-batch invoice creates normal `invoice` inventory movements through the existing invoice allocation/movement path.
- Goods receipt labels encode `BATCH:{batchId}` from confirmed backend batch identity.
- Production output labels encode `BATCH:{outputBatchId}` from the created output batch.
- Legacy no-`batchId` invoice lines still use FEFO fallback.
- Slice 7 / 8 / 9 remain future/deferred.
- No `raw_materials` table or class is added.

### Slice 6B implementation status (2026-04-28)

**PASS (local):** `./gradlew.bat test` (NhaDanShop) and `npm run build` (nha-dan-pos-c091ee5b).

**Backend (authoritative names)**

- `GET /api/pos/scan/{code}` → `PosScanResponse` DTO (JSON fields per `docs/backend-integration-pack.md` contract; FE type `PosScanDto` in `src/services/pos/posScanApi.ts`).
- `InvoiceItemRequest` includes optional `Long batchId` (canonical exact-batch selection for non-combo single lines).
- Exact-batch deduction: `ProductBatchService.deductExactBatchWithTrace(...)`; invoice wiring in `InvoiceService` uses it when `batchId` is present; `unitCostSnapshot` prefers the traced batch average (exact batch cost).
- Batch listing for receipt-confirmed identity: `GET /api/batches/receipt/{receiptId}`.

**Frontend**

- POS scan + cart: `src/pages/admin/POS.tsx` (batch merge by `batchId`; backend checkout when the cart contains any batch-scanned lines).
- Backend invoice call: `POST /api/invoices` via `adminFetchJson` using Spring field names `customerName`, `customerId`, `note`, `promotionId`, `items[]` with `{ productId, quantity, discountPercent, variantId, comboId, batchId }`.
- Goods receipt confirm → print labels: `src/pages/admin/GoodsReceiptCreate.tsx` posts `POST /api/receipts` when an admin JWT session exists, then loads batches via `GET /api/batches/receipt/{id}`; labels encode `BATCH:{batchId}` (no `variantCode` masquerading as batch).
- Production output label: `src/pages/admin/Production.tsx` prints `BATCH:{outputBatchId}` with human-readable `outputBatchCode`, product/variant, expiry, sell price.
- Shared label UI: `src/components/shared/BarcodePrintDialog.tsx` now renders optional `expiryDate` text (HSD).

**Operational notes**

- POS **batch-scanned** and **non-batch** carts (Slice 6C): authenticated quote (`postSalesQuoteAsPos` → `POST /api/sales/quote`, `source=pos`) then `POST /api/invoices` with `quotePublicId` and `paymentMethod`; per-line `batchId` is preserved for exact-batch allocation when present. After a successful quote, the in-app/58mm invoice snapshot is built from **`quote.lines` + `quote.rewardLines`** and **`quote.pricingBreakdownSnapshot`** via `buildInvoiceLinesFromQuote` / `buildPosInvoiceBreakdownFromQuote` in `src/lib/pos-quote-receipt.ts` (gift/free rows come from backend `rewardLines`, not local `computeInvoice` `freeItems`).
- POS carts **without** batch lines may still use the legacy local invoice path when no admin JWT session is present.

Slice 7 promotion/voucher work, Slice 8 payment sessions, and Slice 9 reporting remain future/deferred.

## Slice 6C: Unified Sales Invoice Commercial Contract

### Status and placement

**PASS (this change-set, `nha-dan-pos-c091ee5b`, 2026-04-28):** `npm run build`; Vitest `checkoutGuards.test.ts`, `salesQuoteApi.test.ts`, `adminVouchersApi.test.ts`, `pos-quote-receipt.test.ts`. Backend Java was not modified; full `./gradlew.bat test` was not re-run for this edit.

**Backend:** `CommercialPricingEngine`; `POST /api/sales/quote` → `SalesQuoteService` (public anonymous allowed only for `source=storefront`; rejects storefront manual discount, client `rewardLine`, per-line `discountPercent > 0`, and negative shipping fee; **accepts `voucherCode`** — amounts from `vouchers` + `VoucherQuoteEvaluator`, snapshot in `VoucherSnapshotDto`; storefront shipping from `ShippingQuoteService` + `shippingAddress`; POS/admin may use explicit `shippingQuoteSnapshot`). **Promotion reward lines:** `BUY_X_GET_Y` and `QUANTITY_GIFT` add backend `rewardLines` (stock-checked at quote); other promo types `FREE_SHIPPING` rejected in quote with clear error; client `rewardLine` still rejected. Tables: `sales_quotes` (`V21`), `pending_order` batch/reward (`V22`), quote reserve + `sales_invoice_items.reward_line` (`V23`), **`vouchers` rule columns (`V24`)**. Quote-backed invoice and pending order unchanged for snapshot authority. Casso / confirm / VAT profit report behavior unchanged. **`shippingActualCost`** remains null — no persisted carrier settlement source in repo; deferred to future shipping settlement/reporting slice.

**Frontend (`nha-dan-pos-c091ee5b`):** `postSalesQuote` / `Checkout.tsx` send `voucherCode` with the cart; totals and submit use backend `quotePublicId` only. `POS.tsx`: batch and **non-batch** real checkout use `postSalesQuoteAsPos` + `POST /api/invoices` when an admin JWT session exists; persisted/printed local invoice rows and breakdown use backend quote output (`pos-quote-receipt.ts`). **local-only invoice** only if `import.meta.env.MODE === "test"` or `VITE_POS_LOCAL_INVOICE_DEMO=true` (explicit demo). Optional POS field “Mã voucher (máy chủ)”. `salesQuoteApi` maps `voucherSnapshot` from quote JSON. **Admin vouchers:** `src/pages/admin/Vouchers.tsx` uses `src/services/admin/adminVouchersApi.ts` (`adminFetchJson`) against `/api/vouchers` CRUD — not `vouchers-store` as source of truth (local store remains for `LocalVoucherAdapter` demo only).

**Slice 6C extensions (closed, tested):**

1. **Backend voucher quote:** `Voucher` + `V24__voucher_rules.sql`; percent / fixed / free_shipping + min window; case-insensitive code; `Slice6cQuotePaymentIntegrationTest` (percent, freeship, inactive, cap after promo, POS+manual).
2. **Backend promotion gifts:** `BUY_X_GET_Y` / `QUANTITY_GIFT` reward lines in quote + pending order + invoice stock COGS; tests in `Slice6cQuotePaymentIntegrationTest`.
3. **POS session guard:** No silent local invoice without admin session (except explicit demo env above).
4. **Carrier actual shipping cost:** No settlement feed → **deferred**; doc only; `shippingActualCost` stays null.
5. **Admin voucher UI (REST parity):** `adminVouchersApi.ts` — list `GET /api/vouchers`, create `POST /api/vouchers`, update `PUT /api/vouchers/{id}`, toggle `PATCH /api/vouchers/{id}/toggle`, delete `DELETE /api/vouchers/{id}`; fields `code`, `ruleSummary`, `minSubtotal`, `percent`, `cap`, `fixedAmount`, `freeShipping`, `active`, `startAt`, `endAt`; client rejects combining `freeShipping` with percent/fixed. Load/save failures surface as visible errors (no silent local persistence for admin CRUD).
6. **POS quote → local receipt mapping:** `pos-quote-receipt.ts` builds `InvoiceLine[]` from `quote.lines` + `quote.rewardLines`, `freeItems` from reward amounts, `itemCount` from `quoteUnitsItemCount`, breakdown from `buildPosInvoiceBreakdownFromQuote` (`pricingBreakdownSnapshot` + `voucherSnapshot.code`).

**Prior Slice 6C hardening (still in force):** storefront line discount reject; storefront shipping server-computed; public pending order requires `quotePublicId`; profit report excludes VAT from net revenue/profit.

**GAP / deferred:** Promotion type **FREE_SHIPPING** not in quote (use voucher `free_shipping` or future work). Deeper statutory VAT and carrier settlement (`shippingActualCost`) slices remain future.

Slice 6C is the unified sales/invoice contract alignment slice after Slice 6B (not Slice 7/8/9). Slice 6B inventory truth (`ProductBatch.remainingQty`, FEFO, exact batch) is unchanged.

### Problem

The system does not yet have one unified commercial invoice contract across:

- storefront checkout online pending order
- storefront `cod` / `cash_on_delivery` checkout
- admin pending order confirmation
- POS direct invoice
- exact-batch invoice deduction
- no-batch FEFO invoice deduction
- reward/free item stock + COGS
- VAT/shipping/discount/report consistency

The current backend `SalesInvoiceRequest` is too simple for commercial parity with pending orders and frontend checkout. It does not yet carry:

- `pricingBreakdownSnapshot`
- `shippingFee`
- `shippingDiscount`
- `vatBase`
- `vatPercent`
- `vatAmount`
- voucher snapshot
- promotion snapshot
- shipping quote snapshot
- reward/free item lines
- line pricing snapshot

Therefore direct invoice/POS cannot be commercially consistent with pending order until Slice 6C closes this contract gap.

Pending order currently stores `pricingBreakdownSnapshot`, but Slice 6C must make the backend pricing source of truth. Real storefront/POS/admin checkout must use a backend quote API; frontend local pricing is display/demo fallback only and is not persisted truth. Order/invoice creation uses the backend pricing engine, not frontend arithmetic.

Storefront `cod` / `cash_on_delivery` must not remain local-only when backend stock/report truth is required. Preferred Slice 6C rule: real storefront checkout creates a backend `PendingOrder` from a backend quote; local invoice behavior is not allowed for real stock/report flows.

Reward/free item is currently mostly a snapshot/UI concept. Slice 6C defines the v1 persisted model as an invoice item with zero revenue, retained original price snapshot, stock deduction when it is a real product/variant, COGS from FEFO or exact batch allocation, and visible invoice response/report detail as a free/reward line.

VAT is currently effectively 0, but Slice 6C must define VAT behavior before future VAT is enabled: FE preview can show VAT, backend validates or recomputes VAT, invoice persists VAT fields/snapshot, reports know whether revenue is gross or net of VAT, and pending order/admin/POS/storefront display the same VAT fields.

If any sales surface displays totals that backend invoice persistence stores differently, then:

- revenue reports can use one amount while the receipt shows another
- profit reports can combine correct COGS with incorrect revenue
- customer receipts can diverge from the saved invoice
- invoice cancel/void can remain stock-correct while leaving ambiguous commercial history

Therefore Slice 6B intentionally blocks or clears these commercial features for batch carts where the UI has not yet been switched to backend quotes, and full parity still requires each surface to use the same persisted snapshots as the backend.

### Source of truth

- Backend quote/invoice pricing must become the commercial source of truth for persisted invoice totals across all real sales flows.
- Frontend storefront, admin, and POS screens may preview totals, but real checkout must use backend quote totals and backend returned invoice totals.
- Frontend-only arithmetic must never become persisted order/invoice truth.
- Backend invoice response is the post-save authority that storefront, admin, POS, customer receipt, and reports use.

### Backend contract plan

Chosen v1 approach: introduce a shared backend sales quote and invoice commercial command/validator used by:

- `POST /api/sales/quote`
- `POST /api/invoices`
- pending order create
- pending order confirm
- POS backend checkout
- storefront `cod` / `cash_on_delivery` checkout
- exact batch invoice lines
- FEFO fallback invoice lines

Real create flows use `quoteId`. Existing simple `POST /api/invoices` requests without `quoteId` continue to work as legacy mode: backend recomputes a simple invoice from current catalog price, existing FEFO/exact-batch allocation, and zero VAT/shipping/voucher/reward defaults unless an explicitly supported old field exists. New real frontend flows must not use legacy mode.

Batch and non-batch invoice lines use the same commercial contract. `batchId` is optional per line and must affect stock allocation only, not commercial calculation. No `batchId` means FEFO fallback. Exact-batch and FEFO lines must share the same commercial math.

Backend sales quote flow:

- `POST /api/sales/quote`
- Frontend sends cart intent:
  - `productId` / `variantId`
  - `quantity`
  - optional `batchId` for exact stock trace only
  - `voucherCode` / promotion selection if any
  - shipping address or shipping option
  - manual discount if allowed by the surface
  - `vatPercent` if applicable
  - source/surface such as `storefront`, `pos`, or `admin`
- Backend returns:
  - `quoteId`
  - `expiresAt`
  - line pricing snapshots
  - reward/free item lines
  - promotion/voucher/shipping snapshots
  - `pricingBreakdownSnapshot`

Shared commercial command/quote fields to add or formalize:

- `manualDiscountMode`: `"amount" | "percent" | null`
- `manualDiscountValue`
- `manualDiscount`
- `promotionDiscount`
- `voucherDiscount`
- `promotionId` when an existing backend promotion is selected
- `promotionSnapshot`, `promotionCode`, `promotionName`, `promotionDiscountAmount` when POS uses a frontend-calculated promotion snapshot
- `voucherSnapshot`
- `shippingQuoteSnapshot`
- `rewardLines[]` with product/variant identity, quantity, original price snapshot, and promotion/reward source where available
- `shippingFee`
- `shippingDiscount`
- `shippingZoneCode`
- `shippingZoneLabel`
- `shippingEtaMin`
- `shippingEtaMax`
- `vatPercent`
- `vatBase`
- `vatAmount`
- `subtotal`
- `finalAmount`
- `pricingBreakdownSnapshot` containing subtotal, line discounts, manual discount, promotion discount, voucher discount, shipping fee, shipping discount, VAT base, VAT percent, VAT amount, and `total`

`shippingPayable` is derived only: `shippingPayable = max(0, shippingFee - shippingDiscount)`. Do not add `shippingPayable` as a persisted canonical backend field in v1. FE display components may compute or normalize it for display. `pricingBreakdownSnapshot.total` is the final payable amount.

Canonical v1 final amount formula:

```text
finalAmount =
  subtotal
  - manualDiscount
  - promotionDiscount
  - voucherDiscount
  + shippingFee
  - shippingDiscount
  + vatAmount
```

`pricingBreakdownSnapshot.total` must equal this `finalAmount`.

Line-level fields to add or formalize where needed:

- product/variant identity
- quantity
- `discountPercent`
- `discountAmount`
- `unitPriceSnapshot`
- `lineSubtotal`
- `lineTotal`
- original price snapshot for reward/free items
- reward/free item marker and source
- `batchId` remains optional exact-stock trace

### Validation and anti-drift rules

- Backend must reject stale/invalid quote usage or clearly recompute only in documented legacy no-quote mode.
- Preferred tolerance is exact integer VND match. If current rounding requires tolerance, allow at most 1 VND.
- Backend must persist the final commercial snapshot it used for invoice response/reporting.
- `SalesInvoice.totalAmount`, `discountAmount`, `finalAmount`, VAT fields, shipping fields, and item snapshots must be mutually consistent.
- Backend quote creation must validate or compute line totals, subtotal, discount bounds, shipping discount bounds, VAT base, VAT amount, final amount, and reward/free item pricing.
- Discounts must not exceed the allowed base.
- Shipping discount must not exceed shipping fee.
- Snapshot values must be integer VND amounts unless a documented field is explicitly non-money, such as `vatPercent`.
- Stale product/variant price behavior is handled at quote time. Real create flows use a non-expired backend quote; legacy no-quote mode recomputes from current catalog for backward compatibility.
- Pending order confirmation must preserve the stored pending order quote snapshot into the invoice snapshot. It must not recompute price, promotion, voucher, shipping, VAT, or reward lines.
- If backend recomputes in legacy mode, the response must return the recomputed persisted values and the frontend must display those values after save.
- If backend rejects mismatch, the frontend must show an actionable error and keep the cart/order unchanged.

VAT v1 locked rule:

- `vatPercent` defaults to `0`.
- `vatBase = subtotal`.
- VAT does not include `shippingFee`.
- VAT is not reduced by `manualDiscount`, `promotionDiscount`, `voucherDiscount`, or `shippingDiscount`.
- `vatAmount = floor(subtotal * vatPercent / 100)`.
- Non-zero VAT must be validated, persisted, returned, and displayed.
- Advanced tax reporting is deferred.

Payment naming and confirmation rules:

- `bank_transfer` means bank transfer via QR/Casso.
- `cod` / `cash_on_delivery` means collect on delivery or manual cash collection.
- Use `cash` only where existing code requires it; online checkout should prefer explicit `bank_transfer` or `cod` naming to avoid ambiguity.
- Storefront online checkout creates `PendingOrder` first for `bank_transfer`, `momo`, `zalopay`, and `cod` / `cash_on_delivery`-like deferred payment flows.
- `PendingOrder` is created from backend quote and stores the backend-generated pricing snapshot.
- `bank_transfer`: Casso webhook v2 creates/updates `PaymentEvent`, matches `paymentReference`/order code plus amount, then auto-confirms the `PendingOrder` transactionally.
- `momo` / `zalopay`: future provider webhook/payment session confirms similarly when implemented; do not claim Casso handles MoMo/ZaloPay.
- `cod` / `cash_on_delivery`: remains pending until manual/admin/fulfillment confirmation records payment collection or delivery success.
- All confirmation paths create backend `Invoice` from the stored `PendingOrder` quote snapshot and do not recompute commercial pricing.

### Revenue, profit, and reporting impact

- Revenue reports must use persisted backend invoice final amounts, not frontend-only totals.
- Profit reports use persisted invoice revenue allocation plus actual allocation COGS.
- COGS continues to use `unitCostSnapshot` from exact batch allocation or FEFO allocation.
- Production is not revenue. Production cost enters profit only when an output batch is sold.
- Reward/free item v1 rule: reward/free item lines are invoice items with `unitPrice=0`, original price snapshot retained for display/audit, and non-zero COGS recorded when stock is deducted.
- Do not model reward/free item handling as an implicit invisible discount in v1; it must be explicit in invoice items or snapshot fields.
- VAT reporting v1 labels invoice revenue as gross customer payable including VAT, exposes `vatAmount`, and exposes net-of-VAT view as `finalAmount - vatAmount` when needed. Advanced tax/payable reporting is deferred.
- Shipping uses the v1 accounting model "shipping as separate invoice-level revenue/cost bucket".
- Do not allocate `shippingFee`, `shippingDiscount`, or actual shipping cost into product/category revenue/profit.
- Product/category reports show item revenue and item COGS only.
- Invoice/report exposes `itemRevenue`, `itemCOGS`, `itemGrossProfit`, `shippingFee`, `shippingDiscount`, `shippingNetRevenue = shippingFee - shippingDiscount`, nullable/deferred `shippingActualCost`, `shippingProfit = shippingNetRevenue - shippingActualCost` when known, and `invoiceProfit = itemGrossProfit + shippingProfit` when shipping actual cost is known.
- If `shippingActualCost` is unknown, `invoiceProfit` may use `itemGrossProfit + shippingNetRevenue`, but must be labeled as "shipping actual cost unknown".
- Deeper carrier settlement / shipping actual cost automation is deferred.

### Batch traceability interaction

- `batchId` exact deduction remains unchanged.
- The unified commercial contract must not change `ProductBatch.remainingQty` truth.
- `ProductVariant.stockQty` remains a synced projection.
- Product-level stock must not drive inventory truth.
- Exact-batch lines and FEFO lines can coexist in one invoice. Each line's stock deduction rule is independent of commercial discount, shipping, VAT, and reward logic.
- Invoice cancel/void restores exact allocations as today and must not recompute or mutate the historical commercial snapshot.
- No `raw_materials` table, class, or migration is introduced.

### Storefront, admin, and POS frontend plan

- Real storefront/POS/admin checkout must call the backend quote API and create order/invoice from `quoteId`.
- Storefront online pending order checkout must create a backend quote and then create `PendingOrder` from that quote.
- Storefront `cod` / `cash_on_delivery` checkout must no longer create only a local invoice for real stock/report flows. It should create a backend `PendingOrder` from the backend quote and remain pending until manual/admin/fulfillment confirmation.
- Admin PendingOrders page must display the full pricing breakdown, including VAT fields.
- Admin pending order confirmation must create invoices from the stored pending order quote snapshot without recomputing commercial pricing.
- POS batch and non-batch carts must use the same backend invoice contract.
- POS commercial guardrails from Slice 6B can be removed only after Slice 6C backend parity exists.
- Frontend preview totals must come from backend quote response. After save, frontend displays backend returned order/invoice totals.
- If backend rejects a snapshot mismatch, the frontend shows the backend error and leaves cart/order state unchanged.
- Legacy local/demo invoice paths may remain only when there is no backend session and the flow is not a real stock/report flow.

### Database and migration plan

- Audit existing `sales_invoices` and `sales_invoice_items` columns first.
- Reuse existing columns when they are semantically sufficient.
- Add only additive nullable columns or a JSON/text snapshot column when existing columns are not enough.
- Prefer explicit numeric columns for reporting-critical values such as subtotal, discount totals, final amount, VAT, shipping fee, and shipping discount. Do not persist `shippingPayable` as a canonical v1 field; derive it from `shippingFee` and `shippingDiscount`.
- Use JSON/text snapshot storage for display-only detail when normalized columns are not required for reports.
- Do not break old invoices.
- Do not overwrite historical invoice totals.

### Compatibility plan

- Existing simple `POST /api/invoices` payload remains accepted.
- `POST /api/invoices` supports two modes:
  - quote mode: request has `quoteId`; backend creates invoice from backend-generated quote
  - legacy mode: request has no `quoteId`; backend recomputes a simple invoice from current catalog for backward compatibility
- Legacy mode defaults shipping, voucher, VAT, and reward to zero unless an explicitly supported old field exists.
- New real frontend flows must use quote mode.
- Old POS/local/demo behavior must not be used for real stock/report flows once Slice 6C is implemented.
- Backward compatibility does not allow frontend-only totals to become persisted truth without backend validation or recompute.

### Slice 6C acceptance checklist

Backend tests:

- Backend quote API exists and is used by real storefront/POS/admin checkout.
- Direct invoice and pending order creation use one shared backend commercial validator/quote model.
- `bank_transfer` pending order is auto-confirmed by Casso webhook v2 only when payment reference/order code and amount match.
- `momo` / `zalopay` confirmation is provider-specific/future and is not handled by Casso.
- `cod` / `cash_on_delivery` remains pending until manual/admin/fulfillment confirmation records payment collection or delivery success.
- PendingOrder confirm preserves the stored quote snapshot and does not recompute pricing, promotion, voucher, shipping, VAT, or reward lines.
- **Contract hardening:** Storefront quotes reject any line `discountPercent > 0`; authenticated POS/admin may use line discounts.
- **Contract hardening:** Storefront quotes recompute shipping via `ShippingQuoteService` from `shippingAddress`; client `shippingQuoteSnapshot.fee` is not trusted for `source=storefront`.
- **Contract hardening:** Anonymous pending order create requires `quotePublicId`; legacy no-quote path remains for authenticated/internal only.
- **Contract hardening:** Backend quote applies storefront `voucherCode` from `vouchers` table; storefront uses `postSalesQuote` totals only (no FE-only voucher snapshot submit).
- **Contract hardening:** Profit report net revenue/profit exclude VAT (VAT surfaced separately).
- `POST /api/invoices` supports quoteId mode and legacy no-quote mode.
- Existing simple invoice callers remain backward compatible.
- VAT tests lock `vatBase = subtotal`, `vatAmount = floor(subtotal * vatPercent / 100)`, and VAT exclusion of shipping/discount reductions.
- `shippingPayable` is derived only and is not a persisted canonical v1 backend field.
- Reward/free item is a stock-backed invoice item with zero revenue, original price snapshot, and COGS when stock is deducted.
- Shipping report separates shipping revenue/cost from product/category profit.
- Exact-batch and FEFO invoice lines both use quote pricing and only differ in stock allocation.
- Batch trace remains stock-only and does not alter commercial math.
- Invoice cancel restores stock but does not mutate the historical commercial snapshot.

Frontend tests/build:

- Storefront online checkout displays backend quote/returned invoice totals, not local persisted totals.
- Storefront `cod` / `cash_on_delivery` checkout uses backend pending order for real stock/report flows.
- Admin PendingOrders page displays full pricing breakdown including VAT.
- POS sends the shared quote/invoice command for batch and non-batch carts.
- POS allows promotion, manual discount, VAT, shipping, and reward/free item behavior for batch carts only after Slice 6C backend parity exists.
- Backend returned totals replace local preview totals after save.
- Mismatch/stale quote error keeps cart/order unchanged.
- `npm run build` passes.

## 1. Business Rule Summary

1. `PendingOrder` is the canonical pre-invoice record for online checkout. Online/deferred methods (`bank_transfer`, `momo`, `zalopay`, `cod` / `cash_on_delivery`) create a pending order first from a backend quote. Use `cash` only where existing code requires it; online checkout should prefer explicit `bank_transfer` or `cod` naming to avoid ambiguity.
2. Checkout and invoice commercial snapshots must preserve VAT explicitly as:
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
   Do not collapse VAT into a single ambiguous `vat` number in order/invoice commercial DTOs.
3. Backend quote/invoice pricing is the commercial source of truth for displayed and persisted totals. `PricingBreakdownSnapshot` must be generated by backend quote/legacy invoice calculation, persisted, and returned, including:
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
4. `pricingBreakdownSnapshot.total` must equal `subtotal - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount`.
5. VAT v1 is `vatBase = subtotal`, `vatAmount = floor(subtotal * vatPercent / 100)`, and VAT does not include shipping or reduce by discounts. Non-zero VAT must be validated, persisted, returned, and displayed; advanced tax reporting is deferred.
6. `paymentReference` is the transfer content reference the customer sees and copies. Backend should formalize `paymentReference = code` for pending orders unless a stricter future payment-session scheme replaces it.
7. Shipping quote snapshots store the pre-discount shipping fee. `shippingPayable` is derived only as `max(0, shippingFee - shippingDiscount)`, not persisted as a canonical v1 backend field.
8. Voucher discount and promotion discount are separate invariants and must never be merged.
9. Pending-order business transitions should be modeled as commands, not a generic business PATCH:
   - mark `waiting_confirm`
   - change payment method
   - confirm
   - cancel
10. Invoice creation from a pending order is the authoritative completion point for the online sales flow and must be transactional with stock effects. It preserves the stored pending-order quote snapshot and does not recompute price, promotion, voucher, shipping, VAT, or reward lines.
11. `PendingOrderStatus` in FE is business-facing:
   - `pending_payment`
   - `waiting_confirm`
   - `confirmed`
   - `paid_auto`
   - `cancelled`
12. `Invoice` is the canonical commercial record after sale confirmation. It must retain origin metadata:
   - `sourceType`
   - `pendingOrderId`
   - snapshots identical in shape to `PendingOrder`
13. `bank_transfer` confirmation is Casso/webhook-backed only when payment reference/order code and amount match. `momo` / `zalopay` require future provider-specific webhook/payment-session confirmation. `cod` / `cash_on_delivery` remains pending until manual/admin/fulfillment confirmation records collection or delivery success.
14. `GoodsReceipt` confirmation is the business point where inventory batches are created. FE already reserves `lotCode`, `batchId`, and allocation/cost fields for BE ownership.
15. `GoodsReceipt.canDelete` means no downstream stock consumption has occurred from any batch created by that receipt.
16. Inventory is batch/lot aware in canonical types even though the current local adapter returns no real batches/movements. BE should not collapse inventory back to single stock numbers.
17. `InventoryMovement` is append-only. Stock projections must be derived, not mutated ad hoc.
18. Promotions are evaluated against cart lines and shipping quote. Best promotion is the eligible promotion with the highest combined customer value: `discountAmount + shippingDiscountAmount`.
19. Voucher validation is contextual to cart subtotal and can yield either item discount or shipping discount cap. FE expects human-readable invalid reasons.
20. Product admin UI still has legacy translation, but operational truth must remain variant-centric:
   - stock belongs to variants and batches, not products
   - barcode belongs to variants
   - expiry belongs to batches
   - profit should resolve from variant-level cost/inventory data, not product-level approximations
21. Legacy product-level stock/read models are transitional UI compatibility only. They must not drive backend inventory design.
22. Production creates real finished stock; it is not combo virtual stock. Combo remains a virtual commercial bundle, Goods Receipt remains supplier inbound stock, and Production is the internal stock transformation flow.
23. Production consumes component batches FEFO and creates one finished output batch in the same transaction.
24. Production raw input inventory truth is `ProductBatch.remainingQty`; `ProductVariant.stockQty` is only a synced projection and product-level stock must not drive production inventory math.
25. Production raw input batch eligibility is: `ProductBatch.status=active`, `remainingQty > 0`, non-expired by `expiryDate >= current date`, product active, and variant active.
26. Production component consumption does not require component `isSellable=true`. Non-sellable raw variants are valid production inputs.
27. Sales requires `product.active && variant.active && variant.isSellable`.
28. Production recipe must carry `outputMustBeSellable`, default `true`. If true, output variant must be active and sellable; if false, the output only needs active product + active variant for semi-finished/internal stock.
29. `outputMustBeSellable` validates recipe intent and does not mutate `ProductVariant.isSellable`.
30. Production v1 is completed-on-create; no draft lifecycle is part of Slice 6. Valid statuses are `completed` and `voided`.
31. Production movements are append-only with source types `production_consume`, `production_output`, `production_void_restore`, and `production_void_output`.
32. Production void is allowed only if the completed order output batch has no downstream consumption.
33. Production void must restore exact raw allocations from the saved allocation trace, zero/void the output batch, and reject partial or guessed voids.
34. Raw/weighted ingredients must be stored in integer base units such as grams; avoid fractional stock quantities for inventory math.
35. Production output expiry is the minimum expiry date among consumed raw allocations.
36. Production output unit cost is actual weighted consumed allocation cost plus `overheadCost`, divided by `outputQty`; recipe estimates alone are not authoritative.
37. Do not create a separate `raw_materials` table in Slice 6. Raw materials are `ProductVariant` + `ProductBatch` records, usually active and `isSellable=false`.
38. A separate raw-material table would duplicate product/variant/batch identity and complicate FEFO, cost, expiry, import flows, stock projection, and sales guards.
39. Revisit an `inventoryRole` classification only if classification/search/reporting needs become real during implementation.

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

- `PaymentMethod = "bank_transfer" | "momo" | "zalopay" | "cod" | "cash_on_delivery" | "cash"`
- Use `bank_transfer` for bank transfer via QR/Casso. Use `cod` / `cash_on_delivery` for collect on delivery or manual cash collection. Use `cash` only for existing-code compatibility; online checkout should prefer explicit `bank_transfer` or `cod` naming.
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

- `ProductionRecipe = { id, code, name, outputProductId, outputVariantId, outputQty, outputMustBeSellable, overheadCost?, active, components }`
- `ProductionRecipe.outputMustBeSellable` defaults to `true`; it validates output eligibility and never mutates `ProductVariant.isSellable`.
- `ProductionRecipeComponent = { productId, variantId, qtyPerOutput, unit, rawBatchPredicate? }`
- `ProductionRecipeComponent.rawBatchPredicate` is fixed for Slice 6: active batch, `remainingQty > 0`, non-expired, active product, active variant, with no component `isSellable` requirement.
- `ProductionOrderStatus = "completed" | "voided"`
- `ProductionOrder = { id, number, recipeId?, recipeSnapshot, outputProductId, outputVariantId, outputQty, outputMustBeSellable, status, outputBatchId, outputBatchCode, outputExpiryDate, outputUnitCost, overheadCost?, components, movements, createdAt, voidedAt?, voidReason? }`
- `ProductionOrderComponent = { productId, variantId, requiredQty, consumedQty, unit, componentSnapshot, allocations }`
- `ProductionOrderBatchAllocation = { batchId, lotCode?, qty, unitCost, expiryDate?, restoredAt? }`

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
| `pricingBreakdownSnapshot.vatBase` | `pricingBreakdownSnapshot.vatBase` | Slice 6C v1 taxable base: `subtotal` |
| `pricingBreakdownSnapshot.vatPercent` | `pricingBreakdownSnapshot.vatPercent` | Explicit applied rate |
| `pricingBreakdownSnapshot.vatAmount` | `pricingBreakdownSnapshot.vatAmount` | `floor(subtotal * vatPercent / 100)` |
| `pricingBreakdownSnapshot.total` | `pricingBreakdownSnapshot.total` | Final payable total: `subtotal - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount` |

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

### Production

| FE field | Proposed BE field | Notes |
|---|---|---|
| `ProductionRecipe.outputMustBeSellable` | `outputMustBeSellable` | Defaults to `true`; validates selected output variant, does not mutate variant sellability |
| `ProductionRecipe.outputVariantId` | `outputVariantId` | When `outputMustBeSellable=true`, requires active variant with `isSellable=true`; when false, active variant is enough |
| `ProductionRecipe.components[].variantId` | `components[].variantId` | Raw component variant may be `isSellable=false`; must still be active |
| `ProductionOrder.outputBatchId` | `outputBatchId` | Finished batch created by the completed-on-create order |
| `Batch.productionOrderId` | `productionOrderId` | Required for finished output batches created by production |
| `ProductionOrder.components[].allocations[]` | saved allocation trace | Immutable source for void restore; no FEFO guessing during void |
| `InventoryMovement.sourceType` | production source types | `production_consume`, `production_output`, `production_void_restore`, `production_void_output` |
| `ProductionOrder.status` | `status` | `completed` or `voided`; no Slice 6 draft state |

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

### Sales Quotes

1. `POST /api/sales/quote`
   - Purpose: backend-owned pricing for real storefront/POS/admin checkout.
   - Body:
     - `source: "storefront" | "pos" | "admin"`
     - `lines[]` with `productId`, `variantId`, `quantity`, optional `batchId`
     - `voucherCode?`
     - `promotionSelection?`
     - `shippingAddress?` or `shippingOption?`
     - `manualDiscount?` only when the source is allowed to apply it
     - `vatPercent?`
   - Response:
     - `quoteId`
     - `expiresAt`
     - line pricing snapshots
     - reward/free item lines
     - `promotionSnapshot?`
     - `voucherSnapshot?`
     - `shippingQuoteSnapshot?`
     - `pricingBreakdownSnapshot`
   - Rules:
     - backend computes pricing; frontend arithmetic is preview/demo only
     - `batchId` affects stock trace/allocation only, not commercial price
     - `shippingPayable` is derived for display only from `shippingFee` and `shippingDiscount`
     - `pricingBreakdownSnapshot.total` is the final payable amount

### Pending Orders

#### Read endpoints

1. `POST /api/pending-orders`
   - Purpose: create online/deferred pending order from backend quote
   - Body:
     - `quoteId`
     - `customerId?`
     - `customerName?`
     - `customerPhone?`
     - `shippingAddress?`
     - `paymentMethod`
     - `note?`
     - `expiresAt?`
   - Response: canonical `PendingOrder`
   - Rules:
     - valid real checkout methods include `bank_transfer`, `momo`, `zalopay`, and `cod` / `cash_on_delivery`
     - create from backend quote and store the backend-generated pricing snapshot
     - do not accept frontend arithmetic as persisted pricing truth

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
     - `paymentMethod: "bank_transfer" | "momo" | "zalopay" | "cod" | "cash_on_delivery"`
   - Response: `PendingOrder`
   - Rules:
     - preserve snapshots and totals
     - regenerate payment session/QR metadata if required
     - reject if order is already terminal (`confirmed`, `cancelled`)
     - use explicit `cod` / `cash_on_delivery` naming for deferred/manual collection; avoid ambiguous `cash` for online checkout
   - Rationale:
     - switching between immediate online payment and deferred/manual collection changes fulfillment semantics and must preserve the stored quote snapshot

7. `POST /api/pending-orders/{id}/confirm`
   - Body:
     - `note?`
     - `confirmedBy?`
   - Response:
     - `{ pendingOrder, invoice }`
   - Rules:
     - transactional
     - create invoice from stored pending-order quote snapshot
     - allocate stock/batches
     - emit inventory movements
     - mark order `confirmed`
     - do not recompute price, promotion, voucher, shipping, VAT, or reward lines

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
   - Must extract `matchedCode`, create/update payment event, match `paymentReference`/order code and amount, then auto-confirm `bank_transfer` pending orders transactionally only when both reference/code and amount match
   - Casso is for `bank_transfer` only; `momo` / `zalopay` confirmation requires future provider-specific webhook/payment-session integration

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
     - `quoteId?`
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
     - `rewardLines?` / stock-backed free items as real zero-revenue invoice items
     - `giftLinesSnapshot?` for display-only legacy compatibility where no stock effect exists
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
   - Modes:
     - quote mode: request includes `quoteId`; backend creates invoice from backend-generated quote
     - legacy mode: request has no `quoteId`; backend recomputes a simple invoice from current catalog for backward compatibility
   - Legacy defaults:
     - shipping, voucher, VAT, and reward/free item values default to zero unless an explicitly supported old field exists
   - Rules:
     - new real frontend flows must use quote mode
     - `batchId` affects stock allocation only, not pricing

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

Slice 6 Production API covers DB + Backend API + React admin UI for recipes, preview, completed-on-create orders, and void. It does not add a draft lifecycle.

1. `GET /api/production-recipes`
   - Query params:
     - `page?`
     - `pageSize?`
     - `query?`
     - `active?`
     - `outputVariantId?`
   - Response: `PagedResult<ProductionRecipe>`
2. `GET /api/production-recipes/{id}`
   - Response: `ProductionRecipe`
3. `POST /api/production-recipes`
   - Body: `CreateProductionRecipeRequest`
   - Response: `ProductionRecipe`
   - Defaults `outputMustBeSellable=true` when omitted.
   - Validates output variant using `outputMustBeSellable`.
   - Validates each component as active product + active variant; component `isSellable=false` is allowed.
4. `PATCH /api/production-recipes/{id}`
   - Body: partial recipe metadata/components update
   - Response: `ProductionRecipe`
   - Metadata/components update only for future orders; historical orders read from their saved snapshot.
5. `POST /api/production-recipes/{id}/archive`
   - Metadata-only archive; historical orders remain readable.
6. `POST /api/production-orders/preview`
   - Body: `ProductionPreviewRequest`
   - Response includes required component qty, eligible raw batch allocations, available qty, max producible qty, estimated weighted cost, overhead, estimated output unit cost, and expected output expiry.
   - Raw batch eligibility: active batch, `remainingQty > 0`, `expiryDate >= current date`, product active, variant active, no component sellability requirement.
   - Preview is advisory only; `POST /api/production-orders` must revalidate and allocate transactionally.
7. `POST /api/production-orders`
   - Body: `CreateProductionOrderRequest`
   - v1 is completed-on-create; no draft lifecycle.
   - Consumes raw batches FEFO and creates one finished output batch in the same transaction.
   - Persists recipe snapshot, component snapshot, output batch identity, and exact allocation trace.
   - Output expiry is the minimum expiry date among consumed raw allocations.
   - Output unit cost is `(actual weighted consumed allocation cost + overheadCost) / outputQty`.
   - Appends `production_consume` and `production_output` movements.
8. `GET /api/production-orders`
   - Query params:
     - `page?`
     - `pageSize?`
     - `query?`
     - `status?`
     - `recipeId?`
     - `outputVariantId?`
     - `dateFrom?`
     - `dateTo?`
   - Response: `PagedResult<ProductionOrder>`
9. `GET /api/production-orders/{id}`
   - Response includes recipe snapshot, output batch, components, allocation trace, movements, and void metadata.
10. `POST /api/production-orders/{id}/void`
    - Body: `{ "reason": "string", "voidedBy": "string?" }`
    - Allowed only when the output batch has no downstream consumption.
    - Restores raw batches exactly from saved allocation trace.
    - Zeroes/voids the output batch with `production_void_restore` / `production_void_output` movements.
    - Rejects partial voids and any path that would guess allocations.

**Slice 6 implementation (this repo, verified):** Spring Security — `GET/POST/PATCH` on `/api/production-recipes/**` and `/api/production-orders/**` require `ADMIN`. Paging uses Spring Data’s default query names: `page` (0-based), `size`, `sort` (Spring `Page` JSON: `content`, `totalElements`, `number`, `size`). **Clients should send `page` / `size` (not Nest-style `pageSize` on the wire).** Recipe list filters: `archived`, `active`, `includeArchived`, `outputVariantId`, `query` (partial code/name). Order list filters combined: `status`, `recipeId`, `outputVariantId`, `query` (order number / recipe code / recipe name), `dateFrom` / `dateTo` (ISO date, `yyyy-MM-dd`).

**Automated verification:** Backend `com.example.nhadanshop.service.ProductionSlice6IntegrationTest` (14 tests); admin UI `GET /admin/production` (`Production.tsx`) + `BackendProductionAdminAdapter`. Run: `.\gradlew.bat test --tests "*Production*"` exit 0; `npm run build` in `nha-dan-pos-c091ee5b` exit 0.

DTO class names (`CreateProductionRecipeRequest`, `PatchProductionRecipeRequest`, `ProductionRecipeResponse`, …) live in Java package `com.example.nhadanshop.dto.production.ProductionRecipeDtos`.

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
  "vatBase": 200000,
  "vatPercent": 0,
  "vatAmount": 0,
  "total": 200000
}
```

Slice 6C v1 rules:

- `vatBase = subtotal`
- `vatAmount = floor(subtotal * vatPercent / 100)`
- `total = subtotal - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount`
- `shippingPayable` is derived for display only and is not a canonical persisted backend field in v1

### SalesQuoteRequest

```json
{
  "source": "storefront|pos|admin",
  "lines": [
    {
      "productId": "string",
      "variantId": "string",
      "quantity": 1,
      "batchId": "number|null"
    }
  ],
  "voucherCode": "string|null",
  "promotionSelection": {},
  "shippingAddress": {},
  "shippingOption": {},
  "manualDiscount": 0,
  "vatPercent": 0
}
```

### SalesQuoteResponse

```json
{
  "quoteId": "uuid",
  "expiresAt": "2026-04-23T14:30:00.000Z",
  "lines": [],
  "rewardLines": [],
  "promotionSnapshot": null,
  "voucherSnapshot": null,
  "shippingQuoteSnapshot": {},
  "pricingBreakdownSnapshot": {}
}
```

### CreatePendingOrderRequest

```json
{
  "quoteId": "uuid",
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
  "paymentMethod": "bank_transfer|momo|zalopay|cod|cash_on_delivery",
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
    "vatBase": 200000,
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
    "vatBase": 200000,
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
  "paymentMethod": "bank_transfer|momo|zalopay|cod|cash_on_delivery"
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
  "quoteId": "uuid|null",
  "number": "string|null",
  "date": "2026-04-23T12:30:00.000Z|null",
  "customerId": "string|null",
  "customerName": "string",
  "customerPhone": "string|null",
  "shippingAddress": {},
  "paymentMethod": "cash|bank_transfer|momo|zalopay|cod|cash_on_delivery",
  "createdBy": "admin|online|string|null",
  "note": "string|null",
  "sourceType": "pos|online_pending|manual",
  "pendingOrderId": "string|null",
  "lines": [],
  "rewardLines": [],
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
    "vatBase": 200000,
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

For the normal finished-good recipe below:

- raw `Bánh tráng nguyên liệu` variant stores stock in grams and has `isSellable=false`
- raw `Muối nguyên liệu` variant stores stock in grams and has `isSellable=false`
- recipe consumes `200g` bánh tráng + `200g` muối
- output is `Bánh tráng muối 400g`
- `outputMustBeSellable=true` because this is a customer-facing finished good
- use `outputMustBeSellable=false` only for semi-finished/internal stock outputs

#### CreateProductionRecipeRequest

```json
{
  "code": "BTM-400G",
  "name": "Bánh tráng muối 400g",
  "outputProductId": "finished-product-id",
  "outputVariantId": "finished-variant-id",
  "outputQty": 1,
  "outputMustBeSellable": true,
  "overheadCost": 0,
  "components": [
    { "productId": "banh-trang-raw", "variantId": "banh-trang-g", "qtyPerOutput": 200, "unit": "g" },
    { "productId": "muoi-raw", "variantId": "muoi-g", "qtyPerOutput": 200, "unit": "g" }
  ]
}
```

Validation rules:

- `outputMustBeSellable` defaults to `true` when omitted.
- If `outputMustBeSellable=true`, output product and variant must be active and output variant must have `isSellable=true`.
- If `outputMustBeSellable=false`, output product and variant must be active; output variant may be `isSellable=false`.
- Component product and variant must be active, but component variant may be `isSellable=false`.
- Components consume from eligible `ProductBatch` rows only: `status=active`, `remainingQty > 0`, `expiryDate >= current date`, active product, active variant.
- The recipe never mutates `ProductVariant.isSellable`.

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
  "outputMustBeSellable": true,
  "estimatedConsumedCost": 12000,
  "overheadCost": 0,
  "estimatedOutputUnitCost": 12000,
  "expectedOutputExpiryDate": "2026-10-01",
  "components": [
    {
      "productId": "banh-trang-raw",
      "variantId": "banh-trang-g",
      "requiredQty": 200,
      "availableQty": 1000,
      "unit": "g",
      "allocations": [
        { "batchId": "bt-raw-batch-1", "lotCode": "BT-RAW-001", "qty": 200, "unitCost": 20, "expiryDate": "2026-10-01" }
      ]
    },
    {
      "productId": "muoi-raw",
      "variantId": "muoi-g",
      "requiredQty": 200,
      "availableQty": 1000,
      "unit": "g",
      "allocations": [
        { "batchId": "muoi-raw-batch-1", "lotCode": "MUOI-RAW-001", "qty": 200, "unitCost": 40, "expiryDate": "2027-01-15" }
      ]
    }
  ]
}
```

Preview must not be treated as a reservation. The create endpoint rechecks eligible batches and persists the final allocation trace.

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
  "recipeId": "recipe-id",
  "recipeSnapshot": {
    "code": "BTM-400G",
    "name": "Bánh tráng muối 400g",
    "outputMustBeSellable": true,
    "components": [
      { "productId": "banh-trang-raw", "variantId": "banh-trang-g", "qtyPerOutput": 200, "unit": "g" },
      { "productId": "muoi-raw", "variantId": "muoi-g", "qtyPerOutput": 200, "unit": "g" }
    ]
  },
  "outputVariantId": "finished-variant-id",
  "outputQty": 1,
  "outputBatchId": "batch-id",
  "outputBatchCode": "SX-20260427-001",
  "outputExpiryDate": "2026-10-01",
  "outputUnitCost": 12000,
  "overheadCost": 0,
  "components": [
    {
      "productId": "banh-trang-raw",
      "variantId": "banh-trang-g",
      "requiredQty": 200,
      "consumedQty": 200,
      "unit": "g",
      "allocations": [
        { "batchId": "bt-raw-batch-1", "lotCode": "BT-RAW-001", "qty": 200, "unitCost": 20, "expiryDate": "2026-10-01" }
      ]
    },
    {
      "productId": "muoi-raw",
      "variantId": "muoi-g",
      "requiredQty": 200,
      "consumedQty": 200,
      "unit": "g",
      "allocations": [
        { "batchId": "muoi-raw-batch-1", "lotCode": "MUOI-RAW-001", "qty": 200, "unitCost": 40, "expiryDate": "2027-01-15" }
      ]
    }
  ],
  "movements": [
    { "sourceType": "production_consume", "variantId": "banh-trang-g", "batchId": "bt-raw-batch-1", "qtyDelta": -200 },
    { "sourceType": "production_consume", "variantId": "muoi-g", "batchId": "muoi-raw-batch-1", "qtyDelta": -200 },
    { "sourceType": "production_output", "variantId": "finished-variant-id", "batchId": "batch-id", "qtyDelta": 1 }
  ],
  "createdAt": "2026-04-27T09:00:00.000Z",
  "voidedAt": null,
  "voidReason": null
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
| none | Create production order | `completed` | Slice 6 is completed-on-create; consume raw batches, create output batch, snapshot recipe/components, and append movements in one transaction |
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
14. `ProductionOrder` is the source of truth for Production because it stores recipe snapshot, output batch, consumed component snapshot, and exact allocation trace.
15. Production order snapshot/allocation is immutable after completion.
16. Production consumes from `ProductBatch`; `ProductBatch.remainingQty` remains inventory truth and `ProductVariant.stockQty` remains a synced projection.
17. Product-level stock must not drive inventory truth, production eligibility, costing, or void restore.
18. Production input eligibility is batch/variant/product based: active batch, positive remaining quantity, non-expired, active product, active variant. Component `isSellable=true` is not required.
19. `outputMustBeSellable` belongs on the recipe because some recipes produce sellable finished goods while others may produce semi-finished/internal stock. It validates intent without mutating the selected output variant.
20. Production output batch cost must come from actual consumed batch allocations plus approved overhead, not from current recipe estimates.
21. Production output expiry must come from the minimum expiry date among consumed raw allocations.
22. Production movements are append-only. Void writes compensating production movements instead of rewriting history.
23. Inventory reporting must be movement-aware or explicitly include production movements; receipt/invoice-only reporting is invalid after production is introduced unless the report is explicitly deferred/not production-ready.

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
   - scope: DB + Backend API + React admin UI
   - recipe CRUD/archive with `outputMustBeSellable`
   - no separate raw-material table; raw materials are active `ProductVariant` + `ProductBatch` records, commonly `isSellable=false`
   - raw batch eligibility uses active batch, positive `remainingQty`, non-expired batch, active product, active variant, and does not require component `isSellable=true`
   - completed-on-create production orders; no draft lifecycle in Slice 6
   - source-of-truth order snapshot: recipe snapshot, output batch, consumed components, exact allocation trace
   - raw component FEFO allocation from `ProductBatch`
   - finished output batch creation with `productionOrderId`
   - output expiry from minimum consumed raw allocation expiry
   - output unit cost from actual weighted consumed allocations plus `overheadCost`, divided by `outputQty`
   - append-only production movement ledger: `production_consume`, `production_output`, `production_void_restore`, `production_void_output`
   - production void guard and exact allocation restore; no partial void and no guessing

8. Slice 6C: Unified Sales Invoice Commercial Contract
   - scope: backend quote API plus one commercial invoice command/validator for pending order create, pending order confirm, storefront online checkout, storefront `cod` / `cash_on_delivery`, POS direct invoice, exact-batch lines, and FEFO fallback lines
   - real checkout flows use backend quote (`quoteId`); `POST /api/invoices` supports quote mode plus backward-compatible legacy no-quote mode
   - shared contract includes line pricing snapshot, subtotal, manual discount, promotion discount, voucher discount, shipping fee/discount, VAT base/percent/amount, final amount, promotion/voucher/shipping snapshots, reward/free item lines, and optional `batchId`
   - `batchId` affects stock allocation only; exact-batch and FEFO lines share the same commercial math
   - backend quote/invoice creation is the persisted commercial source of truth; frontend local pricing is display/demo fallback only
   - pending-order confirmation preserves the stored quote snapshot and does not recompute price, promotion, voucher, shipping, VAT, or reward lines
   - persisted invoice totals follow `subtotal - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount`; VAT v1 uses `vatBase = subtotal`
   - reward/free item v1 rule: zero revenue invoice item with original price snapshot retained and COGS recorded when stock is deducted
   - shipping remains a separate invoice-level revenue/cost bucket, not allocated into product/category profit
   - exact-batch allocation, FEFO fallback, cancel/void allocation restore, `ProductBatch.remainingQty`, and `ProductVariant.stockQty` projection remain unchanged

9. Slice 7: Promotion evaluation + voucher validation
   - backend evaluation/validation with identical snapshots

10. Slice 8: Payment sessions formalization
   - explicit payment session lifecycle if needed beyond `paymentReference`

11. Slice 9: Reporting endpoints
   - revenue, profit, inventory reporting after invoice/inventory truth is live
   - inventory reporting must include all inventory movement source types, especially production, not only receipts and invoices, unless existing reports already derive from batch/movement truth automatically

## 9. Acceptance Checklist

1. Pending-order create/read responses preserve `pricingBreakdownSnapshot.vatBase`, `vatPercent`, and `vatAmount`.
2. Adapter compatibility is used only where current FE screens still carry transitional VAT/commercial fields; backend contract remains on the upgraded snapshot shape.
3. `expiresAt` is persisted and returned on pending-order reads.
4. `paymentReference` is generated and returned as `code`.
5. Pending-order lookup is split cleanly between:
   - `GET /api/pending-orders/{id}`
   - `GET /api/pending-orders/by-code/{code}`
6. `POST /api/pending-orders/{id}/mark-waiting-confirm` transitions status from `pending_payment` to `waiting_confirm`.
7. `POST /api/pending-orders/{id}/change-payment-method` supports explicit non-legacy methods (`bank_transfer`, `momo`, `zalopay`, `cod` / `cash_on_delivery`) and avoids ambiguous `cash` for online checkout.
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

#### Slice 6 acceptance

**PASS (Slice 6):** Core implementation verified: backend `ProductionSlice6IntegrationTest` (14 tests), full `.\gradlew.bat test`, admin route `/admin/production` + `BackendProductionAdminAdapter` + `npm run build`. No `raw_materials` table. Slices 7/8/9 not implemented here. **Item 49:** inventory period report (`InventoryStockService`) includes production ledger via `production_*` movement sums; `InventoryProjectionService` remains batch-truth; revenue/profit (`RevenueService`, `ReportService`) use invoices only—production is not revenue. **GAP (deferred):** optional advanced reporting in Slice 9 (e.g. separate “production volume” analytics / multi-currency); not required for correctness of stock or P&L paths above.

27. Production recipe CRUD/archive exists in backend API and React admin UI.
28. `CreateProductionRecipeRequest` supports `outputMustBeSellable`, defaulting to `true`.
29. `outputMustBeSellable=true` rejects inactive output product, inactive output variant, and output variant `isSellable=false`.
30. `outputMustBeSellable=false` allows semi-finished/internal output when product and variant are active, without mutating `ProductVariant.isSellable`.
31. Raw components can use active non-sellable variants (`isSellable=false`).
32. Production preview reports required qty, eligible allocation plan, max producible qty, estimated cost, overhead, and expected output expiry.
33. Production order creation revalidates preview assumptions transactionally.
34. Production consumes exact raw batch quantities and creates the exact finished output batch with `Batch.productionOrderId`.
35. Raw batch eligibility uses `ProductBatch.status=active`, `remainingQty > 0`, `expiryDate >= current date`, active product, and active variant.
36. `ProductBatch.remainingQty` remains inventory truth and `ProductVariant.stockQty` remains synced projection after production.
37. Product-level stock does not drive production inventory truth.
38. Production order response includes recipe snapshot, output batch, consumed component snapshot, exact allocation trace, movements, and void metadata.
39. Production output batch expiry equals the minimum expiry date among consumed raw allocations.
40. Production output unit cost equals actual weighted consumed allocation cost plus `overheadCost`, divided by `outputQty`.
41. Production movements are append-only with source types `production_consume` and `production_output` on create.
42. Void is allowed only when the completed order output batch has no downstream consumption.
43. Void restores exact raw allocations from the saved trace and writes `production_void_restore` / `production_void_output` movements.
44. Void zeroes/voids the output batch and rejects partial or guessed voids.
45. Production and Combo remain separate: combo is virtual commercial bundle; production creates real stock.
46. Production and Goods Receipt remain separate: receipt is supplier inbound stock; production is internal transformation.
47. Backend automated tests cover create, preview, allocation, cost/expiry, non-sellable raw inputs, `outputMustBeSellable`, projection sync, and void guard/restore.
48. FE build/tests pass for the Production admin UI and any shared parser/type changes.
49. **PASS:** Inventory period report (`InventoryStockService`) reconciles opening/closing with receipts, sales, and signed `production_*` movement sums; uses `LocalDate.now(businessClock)` for “today” so movement timestamps and report windows stay aligned. Inventory projection remains batch-truth. Revenue/profit remain invoice-based (production is not sales revenue; COGS flows from batch allocations on actual sales).

#### Slice 6C acceptance

**PASS (core + commercial hardening + voucher/reward/POS quote, local 2026-04-28):** Quote API, quote-backed flows, backend voucher rules in quote, `BUY_X_GET_Y` / `QUANTITY_GIFT` reward lines, POS non-batch quote+invoice when admin session exists, prior hardening (storefront line discount, server shipping, public `quotePublicId`, VAT profit exclusion). Slice 7/8/9 and **GAP / deferred** (promo `FREE_SHIPPING` in quote, admin voucher UI polish, carrier settlement / `shippingActualCost`) remain future.

50. Backend quote API exists and is used by real storefront/POS/admin checkout.
51. Direct invoice and pending order creation use one shared backend commercial validator/quote model.
52. Storefront online, storefront `cod` / `cash_on_delivery`, admin pending confirm, POS direct invoice, exact-batch invoice, and FEFO invoice all persist consistent invoice totals.
53. Storefront online checkout creates `PendingOrder` first for `bank_transfer`, `momo`, `zalopay`, and `cod` / `cash_on_delivery`-like deferred payment flows.
54. `bank_transfer` pending order is auto-confirmed by Casso webhook v2 only when payment reference/order code and amount match.
55. `momo` / `zalopay` confirmation is provider-specific/future and is not handled by Casso.
56. `cod` / `cash_on_delivery` remains pending until manual/admin/fulfillment confirmation records payment collection or delivery success.
57. PendingOrder confirm preserves the stored quote snapshot and does not recompute pricing, promotion, voucher, shipping, VAT, or reward lines.
58. `POST /api/invoices` supports quoteId mode and legacy no-quote mode.
59. Existing simple `POST /api/invoices` callers remain backward compatible.
60. Legacy no-quote mode defaults shipping, voucher, VAT, and reward/free item values to zero unless an explicitly supported old field exists.
61. Backend rejects stale/invalid quote usage; legacy no-quote recompute follows documented exact VND / maximum 1 VND rounding tolerance.
62. Line totals, subtotal, discount bounds, shipping discount bounds, VAT base, VAT amount, final amount, reward/free item pricing, and pending-order-to-invoice snapshot consistency are validated.
63. VAT tests lock `vatBase = subtotal`, `vatAmount = floor(subtotal * vatPercent / 100)`, and VAT exclusion of shipping/discount reductions.
64. `shippingPayable` is derived only and is not a persisted canonical v1 backend field.
65. Reward/free item line is a stock-backed invoice item with zero revenue, original price snapshot, and COGS when stock is deducted.
66. Exact batch allocation still points to the scanned batch when discounts, VAT, shipping, and reward/free item lines exist.
67. Batch trace remains stock-only and does not alter commercial math; no `batchId` still means FEFO fallback.
68. Exact-batch and FEFO invoice lines both use quote pricing and only differ in stock allocation.
69. `unitCostSnapshot` remains exact batch or FEFO allocation cost, never discounted sell price.
70. VAT fields persist and display consistently across pending order, invoice, admin, POS, storefront, and reports.
71. Revenue reports use persisted backend invoice final commercial amounts.
72. Shipping report separates shipping revenue/cost from product/category profit.
73. Product/category profit reports show item revenue and item COGS only; invoice/report exposes shipping net revenue, optional shipping actual cost, and labeled invoice profit when shipping actual cost is unknown.
74. Profit reports combine persisted item revenue with exact batch/FEFO COGS correctly; **net revenue and profit for the profit report exclude VAT** (VAT shown separately, e.g. `totalVatAmount`).
75. Invoice cancel restores allocation-backed stock and does not mutate the historical commercial snapshot.
76. Storefront online checkout displays backend quote/returned invoice totals, not local persisted totals.
77. Storefront `cod` / `cash_on_delivery` checkout uses backend pending order for real stock/report flows.
78. Admin PendingOrders page displays full pricing breakdown including VAT.
79. POS sends the shared quote/invoice command for batch and non-batch carts.
80. POS allows promotion, manual discount, VAT, shipping, and reward/free item behavior for batch carts only after Slice 6C backend parity exists.
81. Backend returned invoice totals replace local preview totals after save.
82. Backend mismatch/stale quote errors are actionable and keep the cart/order unchanged.
83. Tests cover storefront online, storefront `cod` / `cash_on_delivery`, admin confirm, POS direct invoice, exact-batch, FEFO, reward/free item, VAT, shipping report, backward compatibility, and invalid/stale quote rejection.
84. FE `npm run build` passes after removing the Slice 6B batch-cart commercial guardrails.

#### Slice 7 / 8 / 9 future acceptance

85. Slice 7 promotion evaluation + voucher validation remains future/deferred.
86. Slice 8 payment session formalization remains future/deferred.
87. Slice 9 reporting endpoints remain future/deferred, except for any production-awareness naturally covered by existing batch/movement-truth reports.

## 10. Risks / Open Questions

1. Some FE surfaces may still rely on transitional invoice/commercial fields during migration, so short-term adapter compatibility is expected even though the backend contract is tightened.
2. Because online checkout should prefer explicit `bank_transfer` or `cod` / `cash_on_delivery` naming, any future use of legacy `cash` needs a separate designed compatibility path to avoid hidden payment/fulfillment ambiguity.
3. Payment-event linking currently suggests possible direct order confirmation in existing FE behavior; the real backend must tighten this so link/payment-proof and transactional confirm are distinct steps unless a single orchestrated confirm command is invoked.
4. The FE currently distinguishes `paid_auto` from `confirmed`, but admin list views do not fully surface that distinction. Backend implementation should decide whether `paid_auto` is a durable visible state or just an intermediate payment-proven state before `confirm`.
5. Product admin screens still consume legacy product summary fields, so there is short-term risk that stakeholders read product-level stock/profit as authoritative; the backend spec should keep repeating that these are temporary compatibility projections only.
6. Production depends on Slice 5 exposing `isSellable` across Product/Variant CRUD and Excel import paths; implement Production only after Slice 5 confirms raw/non-sellable variant support.
7. Inventory period reporting reads receipt/invoice totals and now includes production movement types in the period math; deeper analytics polish is deferred to Slice 9.
8. Should receipt import be allowed to update `isSellable` on existing variants, or only set it when creating new variants?
9. Should `variantCode` become mandatory for all receipt imports after migration, or only for multi-variant/raw-material rows?
10. Should `mfgDate` be exposed now because `ProductBatch` already has it?
11. Should `supplierLotNo` be deferred to a dedicated traceability slice?
12. `inventoryRole` remains deferred unless Slice 6 implementation proves classification/search/reporting cannot be handled by existing category/type conventions plus `isSellable`.
13. Do not create a separate `raw_materials` table in Slice 6. Raw materials are `ProductVariant` + `ProductBatch` records with normal batch identity, FEFO, cost, expiry, imports, stock projection, and sales guards. A separate table would duplicate identity and complicate those flows.
14. Slice 6C locks VAT v1 math and display, but deeper statutory VAT/payable reporting remains deferred.
15. Slice 6C locks shipping as a separate invoice-level revenue/cost bucket; carrier settlement and automated `shippingActualCost` capture remain deferred.
16. Slice 6C locks storefront `cod` / `cash_on_delivery` as pending-order-first for real stock/report flows.
17. Slice 6C locks stale frontend price handling: real flows use non-expired backend quotes, while legacy no-quote invoice mode recomputes from current catalog for backward compatibility.
18. Slice 6C must still decide whether manual discount is invoice-level only, line-level too, or both, and how the persisted fields/report allocation represent that choice.
