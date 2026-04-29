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
- Slice 7 local-only commercial allocation target is decision-complete: old local invoice data is not a compatibility constraint, backfill is not required, and local DB reset may be approved separately for verification.
- Slice 7 merchandise discount truth: invoice-level `manualDiscount`, `promotionDiscount`, and `voucherDiscount` are allocated down to eligible paid invoice item lines by each line's `lineNetBeforeInvoiceDiscount = unitPrice * quantity`; never allocate by quantity or profit.
- Slice 7 line truth: `lineGrossAmount = originalUnitPrice * quantity`, `lineOwnDiscountAmount = lineGrossAmount - lineNetBeforeInvoiceDiscount`, `lineNetRevenue = lineNetBeforeInvoiceDiscount - allocatedMerchandiseDiscount`, `lineCOGS = unitCostSnapshot * quantity`, and `lineGrossProfitAfterDiscount = lineNetRevenue - lineCOGS`.
- Slice 7 product/category reports use allocated net item revenue/profit: revenue is `sum(lineNetRevenue)`, COGS is `sum(lineCOGS)`, and profit is `sum(lineNetRevenue - lineCOGS)`.
- Slice 7 VAT truth overrides the earlier simplified Slice 6C VAT rule for new invoices: `vatBase = sum(lineNetRevenue)` for merchandise, `vatAmount = floor(vatBase * vatPercent / 100)`, VAT excludes shipping, and VAT is excluded from revenue/profit.
- Slice 7 FREE_SHIPPING truth: promotion FREE_SHIPPING and voucher `free_shipping` affect only `shippingDiscount`, capped at `shippingFee`; shipping fee/discount/net revenue and future actual shipping cost remain invoice-level buckets and are not allocated into product/category revenue/profit.
- Promotion preview integration truth: backend `PromotionEvaluationService` owns real preview via `POST /api/promotions/evaluate` and `POST /api/promotions/pick-best`; these endpoints are public/stateless and do not create quote/order/invoice/payment/inventory rows. Admin promotion mutations remain ADMIN-only in `SecurityConfig`.
- POS promotion truth: `nha-dan-pos-c091ee5b/src/pages/admin/POS.tsx` loads real promotion rows from backend `promotionsCrud.list(...)` and uses backend `promotions.evaluateAll(...)` for eligibility; it no longer uses local store promotion IDs or `applyPromotionToCart` as real eligibility/source of truth. Checkout preview handles `pickBest` failure by clearing `bestPromo`; submit remains backend quote-backed.

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
- Slice 7 is implemented. Slice 8 is planned for unified backend JWT auth, backend-backed storefront/account, and Customer-owned loyalty earn/redeem; payment sessions remain future/deferred.
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

Slice 7 commercial allocation and promotion/voucher shipping-bucket behavior are implemented; Slice 8 unified backend JWT auth + backend storefront/account + Customer loyalty earn/redeem is planned next; standalone payment sessions and deeper Slice 9 reporting remain future/deferred.

## Slice 6C: Unified Sales Invoice Commercial Contract

### Status and placement

**PASS (Slice 6C close-out, 2026-04-28):** Backend: `.\gradlew.bat test --tests "*Slice6c*"`, `.\gradlew.bat test --tests "*ProfitReportVatExclusion*"`, and full `.\gradlew.bat test` (run locally after this doc edit). Frontend: `nha-dan-pos-c091ee5b` — `npx vitest run` (focused suites below) + `npm run build`.

**Backend:** `CommercialPricingEngine`; `POST /api/sales/quote` → `SalesQuoteService` (public anonymous allowed only for `source=storefront`; rejects storefront manual discount, client `rewardLine`, per-line `discountPercent > 0`, and negative shipping fee; **accepts `voucherCode`** — amounts from `vouchers` + `VoucherQuoteEvaluator`, snapshot in `VoucherSnapshotDto`; storefront shipping from `ShippingQuoteService` + `shippingAddress`; POS/admin may use explicit `shippingQuoteSnapshot`). **Promotion reward lines:** `BUY_X_GET_Y` and `QUANTITY_GIFT` add backend `rewardLines` (stock-checked at quote); `PromotionEvaluationService` preview also validates gift product active, default variant active/sellable, and stock before returning gift lines. `FREE_SHIPPING` promotion quote applies only to the shipping bucket (`PromotionSnapshotDto.shippingDiscountAmount`), with merchandise promotion discount/revenue/profit unchanged; promo/voucher shipping discounts passed to the engine are the actual capped buckets. `PromotionController` exposes `POST /api/promotions/evaluate` and `POST /api/promotions/pick-best`; both are stateless preview endpoints. Client `rewardLine` still rejected. Tables: `sales_quotes` (`V21`), `pending_order` batch/reward (`V22`), quote reserve + `sales_invoice_items.reward_line` (`V23`), **`vouchers` rule columns (`V24`)**. Quote-backed invoice and pending order unchanged for snapshot authority. Casso / confirm / VAT profit report behavior unchanged. **`shippingActualCost`** remains null — no persisted carrier settlement source in repo; deferred to future shipping settlement/reporting slice.

**Frontend (`nha-dan-pos-c091ee5b`):** `postSalesQuote` / `Checkout.tsx` send `voucherCode` with the cart; totals and submit use backend `quotePublicId` only. `Checkout.tsx` catches backend `promotions.pickBest(...)` preview failures and clears `bestPromo` instead of keeping stale local promotion truth. `POS.tsx`: real promotion selection loads backend DB rows through `promotionsCrud.list({ active: true })`, evaluates eligibility with backend `promotions.evaluateAll(...)`, and does not use `useStore().promotions` / `applyPromotionToCart` for real promotion eligibility. Batch and **non-batch** real checkout use `postSalesQuoteAsPos` + `POST /api/invoices` when an admin JWT session exists; persisted/printed local invoice rows and breakdown use backend quote output (`pos-quote-receipt.ts`, `buildBackendPosPrintSnapshot`, `lastPrintableInvoice` / `lastPrintableLines` for **58mm** after backend checkout). **local-only invoice** only if `import.meta.env.MODE === "test"` or `VITE_POS_LOCAL_INVOICE_DEMO=true` (explicit demo). Optional POS field “Mã voucher (máy chủ)”. `salesQuoteApi` maps `voucherSnapshot` and Slice 7 commercial snapshot fields from quote JSON. `vite.config.ts` runs dev on `5173` and proxies `/api` + `/actuator` to backend `8080` for local FE-BE smoke. **Admin vouchers:** `src/pages/admin/Vouchers.tsx` uses `src/services/admin/adminVouchersApi.ts` (`adminFetchJson`) against `/api/vouchers` CRUD — not `vouchers-store` as source of truth (local store remains for `LocalVoucherAdapter` demo only).

**Slice 6C extensions (closed, tested):**

1. **Backend voucher quote:** `Voucher` + `V24__voucher_rules.sql`; percent / fixed / free_shipping + min window; case-insensitive code; `Slice6cQuotePaymentIntegrationTest` (percent, freeship, inactive, cap after promo, POS+manual).
2. **Backend promotion gifts:** `BUY_X_GET_Y` / `QUANTITY_GIFT` reward lines in quote + pending order + invoice stock COGS; tests in `Slice6cQuotePaymentIntegrationTest`.
3. **POS session guard:** No silent local invoice without admin session (except explicit demo env above).
4. **Carrier actual shipping cost:** No settlement feed → **deferred**; doc only; `shippingActualCost` stays null.
5. **Admin voucher UI (REST parity):** `adminVouchersApi.ts` — list `GET /api/vouchers`, create `POST /api/vouchers`, update `PUT /api/vouchers/{id}`, toggle `PATCH /api/vouchers/{id}/toggle`, delete `DELETE /api/vouchers/{id}`; fields `code`, `ruleSummary`, `minSubtotal`, `percent`, `cap`, `fixedAmount`, `freeShipping`, `active`, `startAt`, `endAt`; client rejects combining `freeShipping` with percent/fixed. Load/save failures surface as visible errors (no silent local persistence for admin CRUD).
6. **POS quote → local receipt mapping:** `pos-quote-receipt.ts` builds `InvoiceLine[]` from `quote.lines` + `quote.rewardLines`, `freeItems` from reward amounts, `itemCount` from `quoteUnitsItemCount`, breakdown from `buildPosInvoiceBreakdownFromQuote` (`pricingBreakdownSnapshot` + `voucherSnapshot.code`).

**Slice 6C final audit (16 findings) — all PASS in repo**

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Casso auto-confirm: `bank_transfer` only, amount match, `confirmOrder` transactional, `autoConfirmed` on link | `PaymentEventService.maybeMarkOrderPaidAuto` (L218–220 `bank_transfer`); `linkToOrder` → `PaymentEventLinkResponse`; `Slice6cQuotePaymentIntegrationTest`: `casso_bank_transfer_matching_amount_*`, `casso_momo_does_not_auto_confirm`, `casso_zalopay_does_not_auto_confirm`, `casso_cod_does_not_auto_confirm` |
| 2 | Pending order reserves quote; confirm uses snapshot; TTL not re-checked when reserved; direct invoice blocked if reserved | `PendingOrderService.createOrderFromBackendQuote` + `InvoiceService.finalizeQuoteLinkedToPendingOrder` (skip expiry when `consumedPendingOrder` matches); `confirm_after_quote_expiry_succeeds_when_reserved_by_pending_order`; `createInvoiceFromQuoteRequest` rejects `consumedPendingOrder != null` |
| 3 | `POST /api/sales/quote` permitAll; anonymous only `source=storefront` | `SecurityConfig` `POST /api/sales/quote` permitAll; `SalesQuoteService.quote` L49–51 |
| 4 | Client `rewardLine` rejected; backend rewards only; invoice reward revenue 0, original price, stock/COGS | `SalesQuoteService` L75–76; `InvoiceService.appendCapturedQuoteLine` L360–364; `quote_pending_order_invoice_deducts_reward_stock` (+ reward line `unitPrice` 0 assert) |
| 5 | Voucher from DB + evaluator; snapshot post-pricing; storefront shipping backend; client ship snap ignored for storefront | `VoucherQuoteEvaluator` + `VoucherSnapshotDto` from `breakdown.*` (L208–212); storefront branch `ShippingQuoteService.quote` L127–144; spoof test `storefront_shipping_fee_backend_not_spoofed_by_client_snapshot` |
| 6 | Quote-mode invoice source + paymentMethod | `InvoiceService.mapQuoteSourceToInvoice` (`storefront`→`ONLINE_PENDING`, `admin`→`MANUAL`, `pos`→`POS`); `createInvoiceFromPendingOrder` sets `paymentMethod` from order; test `quote_mode_invoice_maps_source_and_payment_method` |
| 7 | Shipping bucket in `SalesInvoiceResponse` | `DtoMapper.toResponse` L82–146: `itemRevenue`, `itemCogs`, `itemGrossProfit`, `shipFee`, `shipDiscSnap`, `shipNet`, `shippingActualCost` null, `shippingProfit` null, `invoiceProfitBasis` |
| 8 | Item DTOs: reward, batch, original price, discounts | `SalesInvoiceItemResponse` (incl. `rewardLine`, `allocations`, `originalUnitPrice`, `lineDiscountPercent`); `PendingOrderItemResponse` (`rewardLine`, `batchId`, `originalUnitPrice`) |
| 9 | Admin voucher UI backend-backed | `Vouchers.tsx` + `adminVouchersApi.ts` (no `vouchers-store` in admin page) |
| 10 | POS local invoice from quote lines/snapshot | `POS.tsx` + `buildBackendPosPrintSnapshot` / `invoiceActions.create(snap.invoiceForStore)` |
| 11 | POS58 from `lastPrintableInvoice` / `lastPrintableLines` after backend checkout | `POS.tsx` `useBackendPos58Print`; cleared in `handleNewInvoice` |
| 12 | Storefront line discount rejected | `SalesQuoteService` L104–107; test `storefront_quote_rejects_line_discount_percent` |
| 13 | Storefront shipping spoof rejected | `SalesQuoteService` storefront branch ignores client fee for computation; test `storefront_shipping_fee_backend_not_spoofed_by_client_snapshot` |
| 14 | Anonymous pending order requires `quotePublicId` | `PendingOrderService.createOrder` L66–68; test `anonymous_pending_order_without_quote_rejected` |
| 15 | Storefront checkout: backend quote + voucher + `quotePublicId` | `Checkout.tsx`: `postSalesQuote` with `voucherCode`; `canSubmit` requires `beQuote`; submit `quotePublicId: beQuote.quoteId`; `checkoutGuards.ts` |
| 16 | Profit report excludes VAT from revenue/profit | `ReportService` / `ProfitReportVatExclusionIntegrationTest` |

**Prior Slice 6C hardening (still in force):** storefront line discount reject; storefront shipping server-computed; public pending order requires `quotePublicId`; profit report excludes VAT from net revenue/profit.

**GAP / deferred:** Deeper statutory VAT and carrier settlement (`shippingActualCost`) slices remain future. Promotion type **FREE_SHIPPING** quote/evaluation support is implemented as Slice 7 shipping-bucket behavior, not a Slice 6C gap.

**Promotion FE-BE integration verification (2026-04-29 local):** PASS for code/tests/build: backend `PromotionController` evaluate/pick-best wiring, `PromotionEvaluationService` gift validation, `SalesQuoteService` capped promo/voucher shipping buckets, POS backend promotion source/evaluation, Checkout `pickBest` catch, PostgreSQL-compatible `V21__sales_quotes_pending_order_quote.sql`, and Vite `/api` proxy. Tests run: `.\gradlew.bat test --tests "*Slice7*" --no-daemon`, `.\gradlew.bat test --tests "*Slice6c*" --no-daemon`, full `.\gradlew.bat test --no-daemon`, `npm run build`, and focused Vitest including `src/pages/admin/posPromotionIntegration.test.ts`. Real HTTP smoke: default PostgreSQL-backed Spring Boot on `http://localhost:8080` returned 200 for `/actuator/health`, `GET /api/promotions/active`, `POST /api/promotions/evaluate`, `POST /api/promotions/pick-best`, and `POST /api/sales/quote` with seeded local FREE_SHIPPING data. Vite proxy smoke on `http://localhost:5173` returned 200 for `GET /api/promotions/active`, `POST /api/promotions/evaluate`, `POST /api/promotions/pick-best`, and `POST /api/sales/quote`. GAP: full browser automation/admin-auth flow was not run because the project has no Playwright/browser harness; proxy-level real FE-BE HTTP routing is verified.

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

Real online/deferred create flows use `quoteId`. Slice 7 local-only implementation may keep direct cash/POS invoice creation without `quoteId`, but that path must compute the same Slice 7 commercial allocation from current catalog and request lines. Old local invoice compatibility/backfill is not a Slice 7 constraint.

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

- Backend must reject stale/invalid quote usage or clearly recompute only in documented direct cash/POS no-quote mode.
- Preferred tolerance is exact integer VND match. If current rounding requires tolerance, allow at most 1 VND.
- Backend must persist the final commercial snapshot it used for invoice response/reporting.
- `SalesInvoice.totalAmount`, `discountAmount`, `finalAmount`, VAT fields, shipping fields, and item snapshots must be mutually consistent.
- Backend quote creation must validate or compute line totals, subtotal, discount bounds, shipping discount bounds, VAT base, VAT amount, final amount, and reward/free item pricing.
- Discounts must not exceed the allowed base.
- Shipping discount must not exceed shipping fee.
- Snapshot values must be integer VND amounts unless a documented field is explicitly non-money, such as `vatPercent`.
- Stale product/variant price behavior is handled at quote time. Real online/deferred flows use a non-expired backend quote; direct cash/POS no-quote mode recomputes from current catalog using Slice 7 allocation rules.
- Pending order confirmation must preserve the stored pending order quote snapshot into the invoice snapshot. It must not recompute price, promotion, voucher, shipping, VAT, or reward lines.
- If backend recomputes in direct cash/POS mode, the response must return the recomputed persisted values and the frontend must display those values after save.
- If backend rejects mismatch, the frontend must show an actionable error and keep the cart/order unchanged.

Slice 6C historical VAT rule, superseded for new Slice 7 invoices:

- `vatPercent` defaults to `0`.
- Slice 6C used the full merchandise subtotal as taxable base.
- VAT does not include `shippingFee`.
- Slice 6C did not reduce VAT for manual, promotion, voucher, or shipping discounts.
- Slice 6C computed VAT amount from the full merchandise subtotal.
- Non-zero VAT must be validated, persisted, returned, and displayed.
- Slice 7 overrides this for new invoices: VAT base is merchandise net after allocated merchandise discounts. Advanced statutory tax reporting is still deferred.

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
- Slice 6C VAT reporting exposed `vatAmount`; Slice 7 revenue/profit reports exclude VAT and use merchandise net after allocated discounts. Advanced tax/payable reporting is deferred.
- Shipping uses the v1 accounting model "shipping as separate invoice-level revenue/cost bucket".
- Do not allocate `shippingFee`, `shippingDiscount`, or actual shipping cost into product/category revenue/profit.
- Slice 7 product/category reports use allocated net item revenue, allocated discount, item COGS, and profit after allocation.
- Invoice/report exposes item gross revenue, allocated merchandise discount, item net revenue, `itemCOGS`, `shippingFee`, `shippingDiscount`, `shippingNetRevenue = shippingFee - shippingDiscount`, nullable/deferred `shippingActualCost`, and an explicit profit basis label when shipping actual cost is unknown.
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
- `POST /api/invoices` supports two Slice 7 modes:
  - quote mode: request has `quoteId`; backend creates invoice from backend-generated quote
  - direct cash/POS mode: request has no `quoteId`; backend computes full Slice 7 allocation from current catalog and request lines
- Old local invoice compatibility/backfill is not required; local DB reset may be approved separately for verification.
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
- **Contract hardening:** Anonymous pending order create requires `quotePublicId`; no-quote invoice creation is limited to authenticated direct cash/POS/admin flows.
- **Contract hardening:** Backend quote applies storefront `voucherCode` from `vouchers` table; storefront uses `postSalesQuote` totals only (no FE-only voucher snapshot submit).
- **Contract hardening:** Profit report net revenue/profit exclude VAT (VAT surfaced separately).
- `POST /api/invoices` supports quoteId mode and direct cash/POS no-quote mode using the same Slice 7 allocation engine.
- Existing local invoice data compatibility is not required for Slice 7; newly created invoices must use the new commercial snapshot.
- Slice 6C tests lock the historical simplified VAT formula; Slice 7 adds new tests for merchandise-net VAT base after allocated discounts while preserving shipping exclusion.
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
3. Backend quote/invoice pricing is the commercial source of truth for displayed and persisted totals. `PricingBreakdownSnapshot` must be generated by backend quote/invoice calculation, persisted, and returned, including:
   - `subtotal`
   - `manualDiscount`
   - `promotionDiscount`
   - `voucherDiscount`
   - `shippingFee`
   - `shippingDiscount`
   - `itemNetRevenue`
   - `shippingNetRevenue`
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
   - `total`
4. Slice 7 invoice-level merchandise discounts must be allocated to invoice item lines. Merchandise discounts are `manualDiscount`, `promotionDiscount`, and `voucherDiscount`; allocation base is each eligible paid line's `lineNetBeforeInvoiceDiscount = unitPrice * quantity`, where `unitPrice` is already after line-level discount.
5. Allocation is never by quantity or profit. Reward/free item lines are excluded from merchandise allocation and receive zero allocated discount.
6. Promotion/voucher scope controls line eligibility: `ALL` allocates across all eligible paid item lines, `PRODUCT` only matching product lines, and `CATEGORY` only matching category lines.
7. Allocation stores separate buckets: `allocatedManualDiscount`, `allocatedPromotionDiscount`, `allocatedVoucherDiscount`, and `allocatedMerchandiseDiscount`. Promotion and voucher discounts must not be merged into one opaque amount.
8. Allocation rounding is deterministic VND rounding: floor each line's proportional amount to integer VND, then distribute remaining VND one by one to largest fractional remainders; ties break by stable invoice line order, then line id when available. Sum of line allocations must exactly equal the invoice-level discount bucket.
9. Slice 7 line commercial truth is: `lineGrossAmount = originalUnitPrice * quantity`, `lineOwnDiscountAmount = lineGrossAmount - lineNetBeforeInvoiceDiscount`, `lineNetRevenue = lineNetBeforeInvoiceDiscount - allocatedMerchandiseDiscount`, `lineCOGS = unitCostSnapshot * quantity`, and `lineGrossProfitAfterDiscount = lineNetRevenue - lineCOGS`.
10. Slice 7 VAT truth for new invoices is `vatBase = sum(lineNetRevenue)` for merchandise, `vatAmount = floor(vatBase * vatPercent / 100)`, VAT excludes shipping, and VAT is exposed separately and excluded from revenue/profit. This overrides the earlier Slice 6C simplified VAT rule; deeper statutory tax reporting remains future.
11. Slice 7 payable total must equal `itemNetRevenue + shippingNetRevenue + vatAmount`, equivalently `subtotal after line discounts - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount`.
12. FREE_SHIPPING promotion and voucher `free_shipping` affect only `shippingDiscount`; `shippingDiscount` is capped at `shippingFee`, `shippingNetRevenue = shippingFee - shippingDiscount`, and shipping fee/discount/net revenue are never allocated to product/category revenue/profit.
13. Reward/free gift lines are real stock-moving invoice items: `unitPrice = 0`, line revenue = 0, original price retained, stock deducted, `unitCostSnapshot` recorded, COGS included in invoice/product/category/aggregate profit, and no allocated merchandise discount.
14. Product/category reports must use allocated net item revenue/profit: revenue is `sum(lineNetRevenue)`, COGS is `sum(lineCOGS)`, and profit is `sum(lineNetRevenue - lineCOGS)`.
15. Local-only Slice 7 compatibility: old local invoice data is not production-critical, legacy backfill is not required, and local DB reset is acceptable only after explicit user approval.
16. `paymentReference` is the transfer content reference the customer sees and copies. Backend should formalize `paymentReference = code` for pending orders unless a stricter future payment-session scheme replaces it.
17. Shipping quote snapshots store the pre-discount shipping fee. `shippingPayable` is derived only as `max(0, shippingFee - shippingDiscount)`, not persisted as a canonical v1 backend field.
18. Pending-order business transitions should be modeled as commands, not a generic business PATCH:
   - mark `waiting_confirm`
   - change payment method
   - confirm
   - cancel
19. Invoice creation from a pending order is the authoritative completion point for the online sales flow and must be transactional with stock effects. It preserves the stored pending-order quote/commercial allocation snapshot and does not recompute price, promotion, voucher, shipping, VAT, or reward lines.
20. `PendingOrderStatus` in FE is business-facing:
   - `pending_payment`
   - `waiting_confirm`
   - `confirmed`
   - `paid_auto`
   - `cancelled`
21. `Invoice` is the canonical commercial record after sale confirmation. It must retain origin metadata:
   - `sourceType`
   - `pendingOrderId`
   - snapshots identical in shape to `PendingOrder`
22. `bank_transfer` confirmation is Casso/webhook-backed only when payment reference/order code and amount match. `momo` / `zalopay` require future provider-specific webhook/payment-session confirmation. `cod` / `cash_on_delivery` remains pending until manual/admin/fulfillment confirmation records collection or delivery success.
23. `GoodsReceipt` confirmation is the business point where inventory batches are created. FE already reserves `lotCode`, `batchId`, and allocation/cost fields for BE ownership.
24. `GoodsReceipt.canDelete` means no downstream stock consumption has occurred from any batch created by that receipt.
25. Inventory is batch/lot aware in canonical types even though the current local adapter returns no real batches/movements. BE should not collapse inventory back to single stock numbers.
26. `InventoryMovement` is append-only. Stock projections must be derived, not mutated ad hoc.
27. Promotions are evaluated against cart lines and shipping quote. Best promotion is the eligible promotion with the highest combined customer value: merchandise discount plus shipping discount, with merchandise discount preferred on ties.
28. Voucher validation is contextual to cart paid merchandise lines and shipping quote; it can yield either merchandise discount or shipping discount cap. FE expects human-readable invalid reasons.
29. Product admin UI still has legacy translation, but operational truth must remain variant-centric:
   - stock belongs to variants and batches, not products
   - barcode belongs to variants
   - expiry belongs to batches
   - profit should resolve from variant-level cost/inventory data, not product-level approximations
30. Legacy product-level stock/read models are transitional UI compatibility only. They must not drive backend inventory design.
31. Production creates real finished stock; it is not combo virtual stock. Combo remains a virtual commercial bundle, Goods Receipt remains supplier inbound stock, and Production is the internal stock transformation flow.
32. Production consumes component batches FEFO and creates one finished output batch in the same transaction.
33. Production raw input inventory truth is `ProductBatch.remainingQty`; `ProductVariant.stockQty` is only a synced projection and product-level stock must not drive production inventory math.
34. Production raw input batch eligibility is: `ProductBatch.status=active`, `remainingQty > 0`, non-expired by `expiryDate >= current date`, product active, and variant active.
35. Production component consumption does not require component `isSellable=true`. Non-sellable raw variants are valid production inputs.
36. Sales requires `product.active && variant.active && variant.isSellable`.
37. Production recipe must carry `outputMustBeSellable`, default `true`. If true, output variant must be active and sellable; if false, the output only needs active product + active variant for semi-finished/internal stock.
38. `outputMustBeSellable` validates recipe intent and does not mutate `ProductVariant.isSellable`.
39. Production v1 is completed-on-create; no draft lifecycle is part of Slice 6. Valid statuses are `completed` and `voided`.
40. Production movements are append-only with source types `production_consume`, `production_output`, `production_void_restore`, and `production_void_output`.
41. Production void is allowed only if the completed order output batch has no downstream consumption.
42. Production void must restore exact raw allocations from the saved allocation trace, zero/void the output batch, and reject partial or guessed voids.
43. Raw/weighted ingredients must be stored in integer base units such as grams; avoid fractional stock quantities for inventory math.
44. Production output expiry is the minimum expiry date among consumed raw allocations.
45. Production output unit cost is actual weighted consumed allocation cost plus `overheadCost`, divided by `outputQty`; recipe estimates alone are not authoritative.
46. Do not create a separate `raw_materials` table in Slice 6. Raw materials are `ProductVariant` + `ProductBatch` records, usually active and `isSellable=false`.
47. A separate raw-material table would duplicate product/variant/batch identity and complicate FEFO, cost, expiry, import flows, stock projection, and sales guards.
48. Revisit an `inventoryRole` classification only if classification/search/reporting needs become real during implementation.

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
  subtotal: Money; // sum(lineNetBeforeInvoiceDiscount) for paid merchandise lines
  manualDiscount: Money;
  promotionDiscount: Money;
  voucherDiscount: Money;
  shippingFee: Money;
  shippingDiscount: Money;
  itemNetRevenue: Money;
  shippingNetRevenue: Money;
  vatBase: Money; // sum(lineNetRevenue), excludes shipping
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

- `CartLine = { id, productId, variantId, productCode?, variantCode?, productName, variantName?, categoryId?, categoryName?, qty, unitPrice, lineSubtotal }`; quote/invoice adapters treat this as preview input only
- `GiftLine = { productId, variantId?, productName, variantName?, qty, unitPrice, lineTotal, promotionId, promotionName }`

### Promotions and vouchers

- `PromotionType = "percent_discount" | "fixed_discount" | "buy_x_get_y" | "gift" | "free_shipping"`
- `PromotionSnapshot = { promotionId, name, type, ruleSummary, discountAmount, shippingDiscountAmount, affectedLines, giftLines }`
- `VoucherSnapshot = { code, ruleSummary, discountAmount, shippingDiscountAmount? }`

### Pending orders

- `PaymentMethod = "bank_transfer" | "momo" | "zalopay" | "cod" | "cash_on_delivery" | "cash"`
- Use `bank_transfer` for bank transfer via QR/Casso. Use `cod` / `cash_on_delivery` for collect on delivery or manual cash collection. Use `cash` only for existing-code compatibility; online checkout should prefer explicit `bank_transfer` or `cod` naming.
- `PendingOrderStatus = "pending_payment" | "waiting_confirm" | "confirmed" | "paid_auto" | "cancelled"`
- `PendingOrderLine = { id, productId, variantId, productName, variantName?, qty, unitPrice, lineSubtotal, lineGrossAmount?, lineOwnDiscountAmount?, lineNetBeforeInvoiceDiscount?, allocatedManualDiscount?, allocatedPromotionDiscount?, allocatedVoucherDiscount?, allocatedMerchandiseDiscount?, lineNetRevenue?, lineVatBase?, lineVatAmount?, rewardLine?, originalUnitPrice? }`
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
- `InvoiceLine = { id, productId, variantId, productName, variantName?, qty, unitPrice, lineSubtotal, lineGrossAmount, lineOwnDiscountAmount, lineNetBeforeInvoiceDiscount, allocatedManualDiscount, allocatedPromotionDiscount, allocatedVoucherDiscount, allocatedMerchandiseDiscount, lineNetRevenue, lineVatBase, lineVatAmount, lineCOGS, lineGrossProfitAfterDiscount, reward?, rewardSourcePromotionId?, rewardSourceName?, originalUnitPrice?, allocations? }`
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
| `pricingBreakdownSnapshot.subtotal` | `pricingBreakdownSnapshot.subtotal` | Sum of paid lines' `lineNetBeforeInvoiceDiscount` after line-level discounts |
| `pricingBreakdownSnapshot.manualDiscount` | `pricingBreakdownSnapshot.manualDiscount` | Separate merchandise discount bucket; allocated to eligible paid lines as `allocatedManualDiscount` |
| `pricingBreakdownSnapshot.promotionDiscount` | `pricingBreakdownSnapshot.promotionDiscount` | Separate merchandise discount bucket; allocated by promotion scope as `allocatedPromotionDiscount` |
| `pricingBreakdownSnapshot.voucherDiscount` | `pricingBreakdownSnapshot.voucherDiscount` | Separate merchandise discount bucket; allocated as `allocatedVoucherDiscount` |
| `pricingBreakdownSnapshot.shippingFee` | `pricingBreakdownSnapshot.shippingFee` | Base shipping before shipping discounts |
| `pricingBreakdownSnapshot.shippingDiscount` | `pricingBreakdownSnapshot.shippingDiscount` | FREE_SHIPPING promotion + voucher shipping relief only; capped at `shippingFee` |
| `pricingBreakdownSnapshot.itemNetRevenue` | `pricingBreakdownSnapshot.itemNetRevenue` | Sum of paid item `lineNetRevenue`; excludes shipping and VAT |
| `pricingBreakdownSnapshot.shippingNetRevenue` | `pricingBreakdownSnapshot.shippingNetRevenue` | `shippingFee - shippingDiscount` |
| `pricingBreakdownSnapshot.vatBase` | `pricingBreakdownSnapshot.vatBase` | Slice 7 taxable base: `sum(lineNetRevenue)` for merchandise; excludes shipping |
| `pricingBreakdownSnapshot.vatPercent` | `pricingBreakdownSnapshot.vatPercent` | Explicit applied rate |
| `pricingBreakdownSnapshot.vatAmount` | `pricingBreakdownSnapshot.vatAmount` | `floor(vatBase * vatPercent / 100)` |
| `pricingBreakdownSnapshot.total` | `pricingBreakdownSnapshot.total` | Final payable total: `itemNetRevenue + shippingNetRevenue + vatAmount` |

### Invoice Line Commercial Mapping

| FE field | Proposed BE field | Notes |
|---|---|---|
| `lines[].lineGrossAmount` | `sales_invoice_items.line_gross_amount` | `originalUnitPrice * quantity` |
| `lines[].lineOwnDiscountAmount` | `sales_invoice_items.line_own_discount_amount` | Line-level own discount before invoice-level discounts |
| `lines[].lineNetBeforeInvoiceDiscount` | `sales_invoice_items.line_net_before_invoice_discount` | `unitPrice * quantity`; allocation base |
| `lines[].allocatedManualDiscount` | `sales_invoice_items.allocated_manual_discount` | Manual discount allocation bucket |
| `lines[].allocatedPromotionDiscount` | `sales_invoice_items.allocated_promotion_discount` | Promotion allocation bucket; scope-aware |
| `lines[].allocatedVoucherDiscount` | `sales_invoice_items.allocated_voucher_discount` | Voucher allocation bucket |
| `lines[].allocatedMerchandiseDiscount` | `sales_invoice_items.allocated_merchandise_discount` | Sum of allocated manual/promotion/voucher buckets |
| `lines[].lineNetRevenue` | `sales_invoice_items.line_net_revenue` | Net merchandise revenue for reports |
| `lines[].lineVatBase` | `sales_invoice_items.line_vat_base` | Equals line net revenue for paid merchandise; zero for reward/free lines |
| `lines[].lineVatAmount` | `sales_invoice_items.line_vat_amount` | Deterministic line VAT allocation; sums to invoice VAT |
| `lines[].lineCOGS` | Derived from `unit_cost_snapshot * quantity` | Includes reward/free line COGS |
| `lines[].lineGrossProfitAfterDiscount` | Derived or response field | `lineNetRevenue - lineCOGS` |
| `lines[].commercialAllocationVersion` | `sales_invoice_items.commercial_allocation_version` | Version marker for Slice 7 allocation truth |

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
     - quote computes Slice 7 line allocation fields for paid lines and zero allocation for reward/free lines
     - quote applies merchandise discounts by eligible line net amount and scope; it does not allocate by quantity or profit
     - quote computes VAT from merchandise net after allocated discounts and excludes shipping
     - FREE_SHIPPING promotion/voucher affects only `shippingDiscount`, capped at `shippingFee`
     - `shippingPayable` is derived for display only from `shippingFee` and `shippingDiscount`
     - `pricingBreakdownSnapshot.total` is the final payable amount: `itemNetRevenue + shippingNetRevenue + vatAmount`

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
     - store line-level commercial allocation fields from backend quote output
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
     - preserve line-level allocation fields and reward/free item COGS semantics
     - do not recompute price, promotion, voucher, shipping, VAT, allocation, or reward lines

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
   - Must extract `matchedCode`, create/update payment event, match `paymentReference`/order code and amount, then mark/confirm `bank_transfer` pending orders only through the accepted confirm flow when both reference/code and amount match
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
    - direct cash/POS mode: request has no `quoteId`; backend still computes Slice 7 allocation from current catalog and request lines
  - Local-only compatibility:
    - old local invoice data is not a production constraint; no legacy backfill is required for Slice 7
    - local DB reset may be approved separately if it simplifies verification
   - Rules:
    - new real online/deferred flows must use quote mode and pending-order confirm
    - direct cash/POS invoices must use the same commercial allocation engine as quote mode
    - persist line-level allocation fields on invoice items
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

### Reports

Slice 7 report contracts use persisted line allocation fields and invoice pricing snapshots. Reports must not recompute discounts from current promotion/voucher rules.

1. Product/category revenue and profit reports
   - Required response fields:
     - `grossItemRevenue`
     - `allocatedDiscount`
     - `netItemRevenue`
     - `itemCOGS`
     - `itemProfit`
   - Formula:
     - product/category revenue = `sum(lineNetRevenue)`
     - product/category COGS = `sum(lineCOGS)`
     - product/category profit = `sum(lineNetRevenue - lineCOGS)`
   - Shipping fee, shipping discount, free shipping, and shipping actual cost are excluded from product/category revenue/profit.
2. Invoice/aggregate profit report
   - Required response fields:
     - `itemGrossRevenue`
     - `merchandiseDiscount`
     - `itemNetRevenue`
     - `shippingFee`
     - `shippingDiscount`
     - `shippingNetRevenue`
     - `vatAmount`
     - `itemCOGS`
     - `knownShippingActualCost?`
     - `invoiceProfit`
     - `invoiceProfitBasis`
   - Formula:
     - `itemNetRevenue = sum(lineNetRevenue)`
     - `shippingNetRevenue = shippingFee - shippingDiscount`
     - `invoiceProfit = itemNetRevenue + shippingNetRevenue - itemCOGS - knownShippingActualCost`
   - When `knownShippingActualCost` is unavailable, report still returns item/shipping net buckets and labels `invoiceProfitBasis` clearly as shipping actual cost unknown.

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

DTO class names (`CreateProductionRecipeRequest`, `PatchProductionRecipeRequest`, `ProductionRecipeResponse`, ”¦) live in Java package `com.example.nhadanshop.dto.production.ProductionRecipeDtos`.

### Promotions

**PASS (promotion quote/evaluation stabilization, 2026-04-29):** Backend tests passed: `.\gradlew.bat test --tests "*Slice7*" --no-daemon`, `.\gradlew.bat test --tests "*Slice6c*" --no-daemon`, `.\gradlew.bat test --tests "*Slice6b*" --tests "*Production*" --no-daemon`, and full `.\gradlew.bat test --no-daemon`. Frontend passed: `npm run build` and focused Vitest suites (`salesQuoteApi`, `pos-quote-receipt`, `checkoutGuards`, `adminVouchersApi`, `promotionEvaluationApi`, `adminPromotionsApi`).

1. `POST /api/promotions/evaluate`
   - Body: `PromotionEvaluationRequest` (`promotionId?`, `lines[]`, `subtotal?`, `shippingFee?`)
   - Service: `PromotionEvaluationService.evaluate`; controller: `PromotionController.evaluate`
   - Response: `PromotionEvaluationResponse[]` with `promotionId`, `name`, `type`, `ruleSummary`, `eligible`, `reasonIfIneligible`, `discountAmount`, `shippingDiscountAmount`, `voucherDiscountAmount=0`, `affectedLines`, `giftLines`
   - Stateless preview only; must not create/update quote/order/invoice/payment/stock rows.
2. `POST /api/promotions/pick-best`
   - Body: `PromotionEvaluationRequest`
   - Service: `PromotionEvaluationService.pickBest`; controller: `PromotionController.pickBest`
   - Response: best `PromotionEvaluationResponse | null`; tie-break: highest payable reduction, merchandise discount beats shipping-only, earlier `endDate`, lower promotion id.
3. `GET /api/promotions`
   - Query params:
     - `page`
      - `size`
      - `sort`
4. `GET /api/promotions/{id}`
5. `PUT /api/promotions/{id}`
6. `POST /api/promotions`
7. `PATCH /api/promotions/{id}/toggle`
8. `DELETE /api/promotions/{id}`
   - Admin mutation security: `POST`, `PUT`, `PATCH /toggle`, and `DELETE` require `ADMIN`; route family remains `/api/promotions`.

### Vouchers

1. `POST /api/vouchers/validate`
   - Body:
     - `code`
     - `cartContext`
   - Response:
     - `{ valid, snapshot?, reasonIfInvalid? }`
2. Admin voucher CRUD uses the same route family with admin mutation security:
   - `GET /api/vouchers`
   - `GET /api/vouchers/{id}`
   - `POST /api/vouchers`
   - `PUT /api/vouchers/{id}`
   - `PATCH /api/vouchers/{id}/toggle`
   - `DELETE /api/vouchers/{id}`

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
  "manualDiscount": 10000,
  "promotionDiscount": 10000,
  "voucherDiscount": 5000,
  "shippingFee": 30000,
  "shippingDiscount": 15000,
  "itemNetRevenue": 175000,
  "shippingNetRevenue": 15000,
  "vatBase": 175000,
  "vatPercent": 8,
  "vatAmount": 14000,
  "total": 204000
}
```

Slice 7 rules for new invoices:

- `subtotal = sum(lineNetBeforeInvoiceDiscount)` for paid merchandise lines
- `itemNetRevenue = subtotal - manualDiscount - promotionDiscount - voucherDiscount`
- `shippingNetRevenue = shippingFee - shippingDiscount`
- `vatBase = itemNetRevenue`
- `vatAmount = floor(vatBase * vatPercent / 100)`
- `total = itemNetRevenue + shippingNetRevenue + vatAmount`
- `shippingPayable` is derived for display only and is not a canonical persisted backend field in v1
- `shippingDiscount` is FREE_SHIPPING relief only and is capped at `shippingFee`
- old local data compatibility/backfill is not required for Slice 7

### InvoiceLine Commercial DTO Fields

```json
{
  "lineGrossAmount": 240000,
  "lineOwnDiscountAmount": 40000,
  "lineNetBeforeInvoiceDiscount": 200000,
  "allocatedManualDiscount": 10000,
  "allocatedPromotionDiscount": 10000,
  "allocatedVoucherDiscount": 5000,
  "allocatedMerchandiseDiscount": 25000,
  "lineNetRevenue": 175000,
  "lineVatBase": 175000,
  "lineVatAmount": 14000,
  "lineCOGS": 120000,
  "lineGrossProfitAfterDiscount": 55000,
  "commercialAllocationVersion": 1
}
```

Reward/free item lines use the same response shape with zero revenue and zero allocated discounts, but still include `originalUnitPrice`, `unitCostSnapshot`, `lineCOGS`, and stock/batch allocation data.

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
    "manualDiscount": 10000,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "itemNetRevenue": 175000,
    "shippingNetRevenue": 15000,
    "vatBase": 175000,
    "vatPercent": 8,
    "vatAmount": 14000,
    "total": 204000
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
    "manualDiscount": 10000,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "itemNetRevenue": 175000,
    "shippingNetRevenue": 15000,
    "vatBase": 175000,
    "vatPercent": 8,
    "vatAmount": 14000,
    "total": 204000
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
    "manualDiscount": 10000,
    "promotionDiscount": 10000,
    "voucherDiscount": 5000,
    "shippingFee": 30000,
    "shippingDiscount": 15000,
    "itemNetRevenue": 175000,
    "shippingNetRevenue": 15000,
    "vatBase": 175000,
    "vatPercent": 8,
    "vatAmount": 14000,
    "total": 204000
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
   - line-level allocation fields
   - `vatBase`
   - `vatPercent`
   - `vatAmount`
2. `pricingBreakdownSnapshot` plus persisted invoice line allocation fields are the canonical commercial record for pending orders and invoices.
3. Transitional FE fields may still exist in some screens; adapter compatibility may bridge them temporarily, but backend persistence and response contracts should stay on the upgraded snapshot shape.
4. The following are immutable historical snapshots once an order or invoice is created:
   - `promotionSnapshot`
   - `voucherSnapshot`
   - `shippingQuoteSnapshot`
   - `pricingBreakdownSnapshot`
   - `giftLinesSnapshot`
5. These snapshot fields must never be recomputed for old orders or invoices based on current promotions, current vouchers, current shipping rules, current tax rules, or current catalog state.
6. Slice 7 line revenue/profit fields are persisted truth for reports: `lineNetRevenue`, `lineCOGS`, and `lineGrossProfitAfterDiscount`.
7. Product/category revenue/profit reports must use allocated net item revenue/profit, not current promotion/voucher rules and not frontend math.
8. FREE_SHIPPING is shipping-bucket truth only; it never changes product/category line revenue.
9. `paymentReference` is the source of truth for customer transfer content and should be generated deterministically from the business order code unless a future payment-session design supersedes it.
10. Payment event ingestion is the source of truth for bank-transfer proof; customer self-confirm only marks intent/claim.
11. Business transitions on pending orders should use explicit command endpoints, not a broad business PATCH.
12. Invoice creation is the source of truth for finalized sale completion and stock deduction for online orders.
13. `GoodsReceipt` confirmation is the source of truth for inbound stock creation.
14. `canDelete` on goods receipts must be derived by downstream stock consumption, not manually toggled.
15. Inventory truth is variant/batch/movement-centric, not product-summary-centric.
16. Any product-level stock/profit summaries returned to current admin pages are compatibility projections only.
17. `ProductionOrder` is the source of truth for Production because it stores recipe snapshot, output batch, consumed component snapshot, and exact allocation trace.
18. Production order snapshot/allocation is immutable after completion.
19. Production consumes from `ProductBatch`; `ProductBatch.remainingQty` remains inventory truth and `ProductVariant.stockQty` remains a synced projection.
20. Product-level stock must not drive inventory truth, production eligibility, costing, or void restore.
21. Production input eligibility is batch/variant/product based: active batch, positive remaining quantity, non-expired, active product, active variant. Component `isSellable=true` is not required.
22. `outputMustBeSellable` belongs on the recipe because some recipes produce sellable finished goods while others may produce semi-finished/internal stock. It validates intent without mutating the selected output variant.
23. Production output batch cost must come from actual consumed batch allocations plus approved overhead, not from current recipe estimates.
24. Production output expiry must come from the minimum expiry date among consumed raw allocations.
25. Production movements are append-only. Void writes compensating production movements instead of rewriting history.
26. Inventory reporting must be movement-aware or explicitly include production movements; receipt/invoice-only reporting is invalid after production is introduced unless the report is explicitly deferred/not production-ready.

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
   - real checkout flows use backend quote (`quoteId`); Slice 7 replaces old no-quote commercial handling with clean direct cash/POS allocation for newly created local invoices
   - shared contract includes line pricing snapshot, subtotal, manual discount, promotion discount, voucher discount, shipping fee/discount, VAT base/percent/amount, final amount, promotion/voucher/shipping snapshots, reward/free item lines, and optional `batchId`
   - `batchId` affects stock allocation only; exact-batch and FEFO lines share the same commercial math
   - backend quote/invoice creation is the persisted commercial source of truth; frontend local pricing is display/demo fallback only
   - pending-order confirmation preserves the stored quote snapshot and does not recompute price, promotion, voucher, shipping, VAT, or reward lines
   - persisted invoice totals followed `subtotal - manualDiscount - promotionDiscount - voucherDiscount + shippingFee - shippingDiscount + vatAmount`; Slice 7 replaces the historical simplified VAT base with merchandise net after allocated discounts for new invoices
   - reward/free item v1 rule: zero revenue invoice item with original price snapshot retained and COGS recorded when stock is deducted
   - shipping remains a separate invoice-level revenue/cost bucket, not allocated into product/category profit
   - exact-batch allocation, FEFO fallback, cancel/void allocation restore, `ProductBatch.remainingQty`, and `ProductVariant.stockQty` projection remain unchanged

9. Slice 7: KiotViet-like commercial allocation, VAT, FREE_SHIPPING, promotion/voucher evaluation, reporting
   - status: next/planned; not PASS until implementation and automated tests pass
   - goal: make newly created quotes, pending orders, invoices, receipts/prints, and reports use backend-owned commercial snapshots; frontend preview is display-only and must not become persisted pricing truth
   - backend preview endpoints remain display/precheck only: `POST /api/promotions/evaluate`, `POST /api/promotions/pick-best`, and `POST /api/vouchers/validate`; they must not create/update quote/order/invoice/payment/inventory records
   - admin promotion CRUD route family remains `/api/promotions`; mutation endpoints (`POST`, `PUT`, `PATCH /{id}/toggle`, `DELETE`) require `ADMIN`
   - supported promotions: `PERCENT_DISCOUNT`, `FIXED_DISCOUNT`, `BUY_X_GET_Y`, `QUANTITY_GIFT`, and `FREE_SHIPPING`; scopes: `ALL`, `PRODUCT`, `CATEGORY`; eligibility: active, date-window valid, min order met, scoped lines present, reward product/variant active + sellable + projected stock available
   - deterministic `pick-best`: highest total payable reduction, then merchandise discount over shipping-only, then earliest `endDate`, then lower promotion id
   - target line model for paid merchandise lines:
     - `itemGrossRevenue = sum(lineGrossAmount)` where `lineGrossAmount = originalUnitPrice * qty`
     - `lineOwnDiscountAmount = lineGrossAmount - lineNetBeforeInvoiceDiscount`
     - `lineNetBeforeInvoiceDiscount = unitPrice * qty` after line-level discount
     - `allocatedManualDiscount`, `allocatedPromotionDiscount`, and `allocatedVoucherDiscount` are allocated down to eligible paid lines
     - `allocatedMerchandiseDiscount = allocatedManualDiscount + allocatedPromotionDiscount + allocatedVoucherDiscount`
     - `lineNetRevenue = lineNetBeforeInvoiceDiscount - allocatedMerchandiseDiscount`, never negative
     - `lineVatBase = lineNetRevenue`; `lineVatAmount` is deterministic and sums to invoice `vatAmount`
   - introduce a reusable `CommercialDiscountAllocationService`:
     - allocate manual, promotion, and voucher merchandise discounts proportionally by eligible paid line amount
     - exclude reward/free item lines and shipping from merchandise allocation
     - promotion allocation respects `ALL` / `PRODUCT` / `CATEGORY` scope; voucher allocation applies to eligible paid merchandise lines
     - use deterministic VND rounding; remainder assignment by largest fractional remainder, then stable line order/id
     - sum of allocated discounts must exactly equal the capped invoice discount buckets
     - cap safely and return/throw clear validation when a discount exceeds eligible base
   - new pricing formula for Slice 7 invoices:
     - `merchandiseDiscount = manualDiscount + promotionDiscount + voucherDiscount`
     - `itemNetRevenue = sum(lineNetRevenue) = sum(lineNetBeforeInvoiceDiscount) - merchandiseDiscount`
     - `shippingDiscount = min(shippingFee, freeShippingPromotionDiscount + freeShippingVoucherDiscount)`
     - `shippingNetRevenue = shippingFee - shippingDiscount`
     - `vatBase = itemNetRevenue`
     - `vatAmount = floor(vatBase * vatPercent / 100)`
     - `payableTotal = itemNetRevenue + shippingNetRevenue + vatAmount`
   - VAT policy:
     - Slice 7 intentionally changes new-invoice VAT from the Slice 6C simplified subtotal base to `vatBase = itemNetRevenue after merchandise discounts`
     - VAT excludes shipping unless a future dedicated tax slice changes it
     - VAT remains exposed separately and excluded from revenue/profit
     - VAT v1 is internal/default display reporting, not statutory tax-invoice implementation
   - shipping bucket:
     - `shippingFee` is gross shipping charged
     - `shippingDiscount` is FREE_SHIPPING promotion/voucher relief only and is capped at `shippingFee`
     - `shippingNetRevenue = shippingFee - shippingDiscount`
     - shipping/free-shipping remains invoice-level; it must not reduce product/category revenue
     - `shippingActualCost` / carrier settlement remains deferred unless a real persisted source already exists
   - reward/free gift lines:
     - `unitPrice = 0`, line revenue = 0, allocated discount = 0
     - `originalUnitPrice` retained
     - stock deducted through existing exact-batch/FEFO paths
     - `unitCostSnapshot` recorded
     - COGS contributes to invoice, product/category, and aggregate profit
   - database plan for `sales_invoice_items`:
     - add nullable line commercial columns: `line_gross_amount`, `line_own_discount_amount`, `line_net_before_invoice_discount`, `allocated_manual_discount`, `allocated_promotion_discount`, `allocated_voucher_discount`, `allocated_merchandise_discount`, `line_net_revenue`, `line_vat_base`, `line_vat_amount`, `commercial_allocation_version`
     - avoid duplicate invoice-level aggregate columns unless a concrete query/report need appears; prefer line fields plus existing pricing snapshot
     - local DB reset may simplify verification but is optional and requires explicit approval
   - invoice creation rules:
     - direct POS/cash invoice path and quote/pending-order confirm path must use the same commercial allocation engine
     - pending-order confirm preserves captured quote/commercial snapshot when available
     - payment proof, manual payment link, VietQR display, and Casso must not bypass confirm flow
     - `paid_auto` remains payment-proven, not invoice-created
     - persist line-level allocation fields on `SalesInvoiceItem` without changing stock allocation/cancel restore behavior
   - reporting rules:
     - product/category reports use `grossItemRevenue`, `allocatedDiscount`, `netItemRevenue`, `itemCOGS`, and `itemProfit = netItemRevenue - itemCOGS`
     - invoice/aggregate reports expose item gross revenue, merchandise discount, item net revenue, shipping fee, shipping discount, shipping net revenue, VAT, item COGS, known shipping actual cost if supported, and profit basis label
     - invoice profit with known shipping actual cost = `itemNetRevenue + shippingNetRevenue - itemCOGS - knownShippingActualCost`
     - when shipping actual cost is unknown, expose item profit plus shipping net revenue separately and label profit basis clearly; do not invent fake cost
   - frontend plan:
     - extend DTO/types/services to consume backend quote/invoice/report fields
     - invoice detail shows gross, allocated discount, net, VAT, and shipping bucket from backend snapshots/fields
      - product/category reports label: `Doanh thu gộp`, `Giảm giá phân bổ`, `Doanh thu thuần`, `Giá vốn`, `Lợi nhuận sau phân bổ`
     - POS/storefront receipt uses backend quote/invoice values; local `computeInvoice` / promotion evaluation remains preview/demo only
     - keep UI churn minimal; no screen redesign
   - safety boundaries:
     - `PendingOrder` remains the canonical pre-invoice record for online checkout
     - confirm is the authoritative online invoice creation step
     - `ProductBatch.remainingQty` remains stock truth; exact-batch, FEFO, cancel restore, receipt void, batch status/sellable predicate, combo archive, and production stock movement semantics must not be weakened
     - no Supabase/cloud pending-order mutation fallback and no deployment/GitHub work; Slice 8 auth/storefront/loyalty remains a separate planned slice, and Slice 9 remains future/deferred

10. Slice 8: Unified JWT Auth + Storefront Backend Truth + User-Customer Loyalty Earn/Redeem
   - status: **PLANNED / NEXT**; documentation plan only, not PASS until implementation, tests, and FE-BE smoke pass
   - summary:
     - app has one real auth flow: `/login` backed by backend JWT for both admin and user
     - remove `/admin/login` from active real flow, remove Supabase auth guard from app flow, and remove hidden `window.prompt` JWT login
     - storefront Home / Products / ProductDetail / Cart / Checkout / Account use backend truth, not mock/local truth
     - `User` is auth/security/role identity; `Customer` is business/CRM/order/total-spend/debt/loyalty identity
     - link `users.customer_id -> customers.id`; points belong to `Customer`, not `User`
     - loyalty includes both earn and redeem: earn when a real invoice is created/confirmed; redeem in online checkout through `loyaltyDiscount`; pending orders that use points must reserve points
   - scope:
     - backend JWT auth end-to-end on FE: unified `/login`, `/signup`, TOTP, refresh, logout
     - role routing for admin/user/guest
     - backend account API for regular users
     - `users.customer_id` nullable unique FK to `customers.id`
     - storefront catalog/cart/checkout/account backend integration
     - cart legacy/mock guard and backend-ID validation
     - Customer loyalty ledger, point balance, reserved points, lifetime earned/redeemed
     - earn points from confirmed invoices
     - redeem points in online checkout as a merchandise `loyaltyDiscount`
     - pending-order point lifecycle: `RESERVE -> REDEEM -> RELEASE`
     - customer/account/admin reports show points and loyalty effects
   - deferred / not in Slice 8:
     - point expiry by date/batch
     - membership tier automation
     - multi-customer per user / household / enterprise account
     - customer merge workflow
     - POS/admin manual point redemption unless explicitly added later
     - legal/statutory VAT invoice redesign
     - standalone payment-session formalization beyond existing pending-order/payment-reference behavior
     - changes to stock FEFO/batch truth, Casso matching, or production behavior
   - business logic — User vs Customer:
     - `User` owns username/password/TOTP/JWT/refresh token and roles (`ROLE_ADMIN`, `ROLE_USER`)
     - `User` does not own points, debt, or total spend directly
     - `Customer` owns business contact profile, order relation, total spend, debt, points, reserved points, and point history
     - `Customer` can exist without a `User` for POS, guest, imported, or admin-created customers
     - storefront signup creates a linked customer; existing users without a customer are lazy-created/linked on `/api/account/me`
     - admin users normally do not require linked customers
     - guest checkout remains allowed but cannot redeem points and must not claim an existing customer account only by entering a phone number
   - business logic — auth:
     - one frontend session key: `nhadan.auth.session.v1`
     - session stores `accessToken`, `refreshToken`, `expiresAt`, `username`, `fullName`, `roles`, and optional `customerId`
     - refresh proactively before access token expiry, e.g. 60 seconds; retry once on 401; refresh failure clears session and redirects to `/login?next=...`
     - `ROLE_ADMIN` can access `/admin/**`; `ROLE_USER` can access `/account`; guest `/account` redirects to `/login?next=/account`; non-admin `/admin/**` redirects to `/account` or 403
     - logout calls `/api/auth/logout` with refresh token, clears local session, and redirects home or `/login`
   - business logic — storefront backend truth:
     - product/category truth comes from `GET /api/products` and `GET /api/categories`
     - storefront real flow must not import `@/lib/mock-data`
     - cart is UI cache only, never commercial truth
     - cart lines store numeric backend `productId`, numeric backend `variantId`, display snapshots, `catalogSource: "backend"`, and `schemaVersion`
     - checkout validates backend cart lines, calls `/api/promotions/pick-best`, calls `/api/sales/quote`, then calls `/api/pending-orders` with `quotePublicId`
   - business logic — loyalty earn:
     - points belong to `Customer`
     - earn only after a real invoice exists: direct/POS invoice save, pending-order confirm into invoice, or Casso auto-confirm through pending confirm
     - no points for quote-only, unpaid pending order, VAT, shipping fee, shipping discount, reward/free line revenue, or COGS
     - earn base is sum of billable item `lineNetRevenue` after all merchandise discounts, including `loyaltyDiscount` if used
     - default earn policy: `pointsEarned = floor(itemNetRevenue / 1000)`, i.e. 1 point per 1,000đ item net revenue
     - earning points is liability/account tracking only and does not immediately reduce revenue/profit
     - each invoice can earn once; Casso webhook/confirm retry must not double earn
   - business logic — loyalty redeem:
     - online logged-in checkout can redeem points; guest checkout cannot redeem
     - a user can redeem only their linked customer points
     - default redeem policy: `1 point = 1đ`
     - `loyaltyDiscount` is a merchandise discount bucket allocated to billable item lines
     - `loyaltyDiscount` reduces item revenue/profit like other merchandise discounts
     - `loyaltyDiscount` does not reduce shipping and does not reduce VAT
     - reward/free lines receive zero loyalty allocation
     - redemption is capped by requested points, available points, item net revenue after manual/promo/voucher, and optional backend max-percent config
     - `availablePoints = pointBalance - pointReserved`
   - business logic — pending-order reservation:
     - pending create from a quote with redeemed points creates a `RESERVED` reservation, increases `customer.pointReserved`, and binds reservation to customer, quote, and pending order
     - confirm converts reservation to `REDEEMED`, decreases `pointReserved`, decreases `pointBalance`, increases `lifetimePointsRedeemed`, and creates a `REDEEM` point transaction
     - cancel/expire converts reservation to `RELEASED` or `EXPIRED`, decreases `pointReserved`, and does not decrease `pointBalance`
     - reservation/redeem/release must be atomic to prevent point overspend across concurrent pending orders
   - backend implementation plan:
     - add PostgreSQL migration for `users.customer_id BIGINT NULL UNIQUE REFERENCES customers(id)`
     - add `customers.point_balance BIGINT NOT NULL DEFAULT 0`, `point_reserved BIGINT NOT NULL DEFAULT 0`, `lifetime_points_earned BIGINT NOT NULL DEFAULT 0`, `lifetime_points_redeemed BIGINT NOT NULL DEFAULT 0`
     - add `customer_point_transactions` with customer/invoice/pending/reservation references, `type`, `points_delta`, `balance_after`, `reserved_after`, `money_base`, `discount_amount`, `reason`, `source`, `created_by_user_id`, unique `idempotency_key`, and `created_at`
     - add `customer_point_reservations` with customer, quote, pending order, points, discount amount, status, expiry, timestamps, and active-reservation guard
     - add loyalty settings (`enabled`, earn amount/points, redeem value per point, minimum redeem, max redeem percent)
     - update `User` entity with optional `Customer`; update `Customer` point fields; add `CustomerPointTransaction`, `CustomerPointReservation`, and `LoyaltySettings`
     - add DTOs: `AccountMeResponse`, `AccountProfileUpdateRequest`, `AccountOrderResponse`, `CustomerPointTransactionResponse`, `CustomerPointsSummaryResponse`, `LoyaltySettingsResponse`, `LoyaltyRedemptionSnapshotDto`
     - extend pricing/commercial DTOs with `loyaltyDiscount`, `loyaltyRedeemedPoints`, `loyaltySnapshot`, and line `allocatedLoyaltyDiscount`
     - add `AccountService` for `getMe`, `updateProfile`, `listMyOrders`, and `ensureLinkedCustomer`
     - add `CustomerLoyaltyService` for earn, reverse, reserve, redeem, release, summary, and history
     - extend `CommercialPricingEngine` to include `loyaltyDiscount` as a distinct merchandise discount bucket while preserving manual/promo/voucher/loyalty separation
     - extend `SalesQuoteService` to accept authenticated loyalty redemption requests, reject guest redemption, cap discount, and persist loyalty snapshot in quote payload
     - extend `PendingOrderService` to create/release reservations, bind logged-in users to their own linked customer, and reject foreign customer IDs for normal users
     - extend `InvoiceService` so direct/quote/pending-confirm invoices earn points; pending confirm converts reservation to redeem; Casso remains covered through pending confirm; supported cancel/void paths reverse earned points
   - backend controllers/security:
     - `/api/account/**` authenticated: `GET /api/account/me`, `PUT /api/account/profile`, `GET /api/account/orders`, `GET /api/account/points`, `GET /api/account/points/history`
     - `/api/loyalty/settings` GET authenticated or public as needed for checkout display; PUT admin-only if settings UI is implemented
     - `/api/customers/**` admin-only
     - `/api/auth/**` remains backend JWT truth
     - public storefront reads remain product/category GET, promotion evaluate/pick-best, sales quote, and pending-order create
   - frontend implementation plan:
     - replace Supabase `AdminAuthProvider` with unified backend auth provider
     - `/login` calls `/api/auth/login`; `/signup` calls `/api/auth/signup`; TOTP calls `/api/auth/verify-totp`
     - remove `/admin/login` from real app route config
     - admin/account guards use unified role/session checks
     - `adminFetchJson` uses unified token, refreshes once, has no `window.prompt`, and has no separate `nhadan.adminAuth.session`
     - topbar logout uses unified logout
     - Home / Products / ProductDetail / ProductCard load products/categories from backend services and must not use `mock-data` in real flow
     - product UI handles loading/error/empty and only active + sellable variants can be added
     - cart removes seed data, clears old schemas/non-numeric IDs/non-backend sources, revalidates lines before checkout, and treats totals as display-only
     - checkout hides points for guests, loads account point summary for logged-in users, sends loyalty request to quote, displays `loyaltyDiscount` separately from shipping/VAT, and creates pending order only with backend `quotePublicId`
     - account page uses `/api/account/me`, `/api/account/profile`, `/api/account/orders`, `/api/account/points`, and `/api/account/points/history`; remove normal-user customer switcher and local `current-customer.ts` truth
   - guardlist:
     - no `/admin/login` active route
     - no Supabase auth in real app flow
     - no `window.prompt` login
     - no separate admin JWT session or `nhadan.adminAuth.session` active source
     - no storefront `mock-data` real-flow import and no seeded cart
     - no quote/order from FE pricing snapshot
     - no backend commercial calls with local IDs like `1`, `v1`, `v4`
     - no normal user access to `/api/customers`
     - no guest point redemption and no user redeeming another customer’s points
     - no points on quote-only or unpaid pending order
     - no points on VAT/shipping/reward lines
     - no loyalty discount on shipping/VAT
     - no double earn, double redeem, or point overspend across pending orders
     - no production class named `Slice8*`
     - no changes to FEFO/batch stock truth, Casso matching, or production logic
   - acceptance criteria:
     - admin logs in at `/login` and lands on `/admin`; user logs in at `/login` and lands on `/account`; guest `/account` redirects to `/login?next=/account`; user is blocked from `/admin`; refresh and logout work; `/admin/login` is not reachable
     - `/`, `/products`, and `/products/:id` load backend catalog; add-to-cart stores backend numeric IDs; legacy cart is cleared/blocked; checkout sends valid backend IDs and no new cart emits “Không tìm thấy sản phẩm ID: 1”
     - checkout calls `/api/promotions/pick-best` 200, `/api/sales/quote` 200, `/api/pending-orders` 201, and pending order uses `quotePublicId`
     - signup creates linked customer; existing user lazy-links customer; user sees only own profile/orders/points; admin still manages all customers
     - direct invoice, pending confirm, and Casso auto-confirm earn once; quote-only earns zero; reward lines earn zero; discounts reduce earn base; VAT/shipping are excluded
     - guest cannot redeem; user can redeem own points; quote computes `loyaltyDiscount`; line allocation includes `allocatedLoyaltyDiscount`; product/category/report net revenue/profit includes loyalty allocation; shipping/VAT unchanged by loyalty; pending create reserves, confirm redeems, cancel/expire releases, and concurrent pending orders cannot overspend
     - customer/admin/account show point balance/reserved/lifetime/history; invoice response exposes loyalty discount/redeemed points; profit/revenue reports remain discount-aware
   - test plan:
     - backend tests: auth login/refresh/logout/me; signup linked customer; account profile/orders/points isolation; `/api/customers` admin-only; pending order binds own customer; foreign customer ID rejected; quote rejects guest redemption; quote caps redemption; quote allocates loyalty to billable lines only; pending reserve/redeem/release; Casso retry no double earn/redeem; reports include loyalty allocation
     - frontend tests: unified auth provider/session/refresh/logout; route guards; no prompt auth; product/category public adapters; cart legacy clear; checkout payload numeric IDs + loyalty request; account points/history rendering
     - FE-BE smoke: backend PostgreSQL default profile on `8080`; Vite on `5173`; admin login/logout; user login/account; browse product -> cart -> checkout with points -> pending order; confirm/admin or Casso path; verify reservation/redeem/earn

11. Future/deferred payment sessions formalization
   - explicit payment-session lifecycle if needed beyond `paymentReference`
   - remains deferred behind Slice 8 auth/storefront/loyalty and must not be mixed into the Slice 8 implementation unless separately approved

12. Slice 9: Reporting endpoints
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

**PASS (Slice 6):** Core implementation verified: backend `ProductionSlice6IntegrationTest` (14 tests), full `.\gradlew.bat test`, admin route `/admin/production` + `BackendProductionAdminAdapter` + `npm run build`. No `raw_materials` table. Slice 7 is implemented separately; Slice 8 auth/storefront/loyalty is planned next; Slice 9 remains future/deferred. **Item 49:** inventory period report (`InventoryStockService`) includes production ledger via `production_*` movement sums; `InventoryProjectionService` remains batch-truth; revenue/profit (`RevenueService`, `ReportService`) use invoices only—production is not revenue. **GAP (deferred):** optional advanced reporting in Slice 9 (e.g. separate “production volume” analytics / multi-currency); not required for correctness of stock or P&L paths above.

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

**PASS (core + commercial hardening + voucher/reward/POS quote, local 2026-04-28):** Quote API, quote-backed flows, backend voucher rules in quote, backend-backed Admin Voucher CRUD UI, `BUY_X_GET_Y` / `QUANTITY_GIFT` reward lines, POS non-batch quote+invoice when admin session exists, prior hardening (storefront line discount, server shipping, public `quotePublicId`, VAT profit exclusion). **Slice 7 backend allocation + reporting PASS (2026-04-29)** — see Slice 7 acceptance §85 below. Slice 8 unified backend JWT auth + storefront backend truth + Customer loyalty earn/redeem is PLANNED / NEXT; Slice 9 and carrier settlement / `shippingActualCost` remain future/deferred.

50. Backend quote API exists and is used by real storefront/POS/admin checkout.
51. Direct invoice and pending order creation use one shared backend commercial validator/quote model.
52. Storefront online, storefront `cod` / `cash_on_delivery`, admin pending confirm, POS direct invoice, exact-batch invoice, and FEFO invoice all persist consistent invoice totals.
53. Storefront online checkout creates `PendingOrder` first for `bank_transfer`, `momo`, `zalopay`, and `cod` / `cash_on_delivery`-like deferred payment flows.
54. `bank_transfer` pending order is auto-confirmed by Casso webhook v2 only when payment reference/order code and amount match.
55. `momo` / `zalopay` confirmation is provider-specific/future and is not handled by Casso.
56. `cod` / `cash_on_delivery` remains pending until manual/admin/fulfillment confirmation records payment collection or delivery success.
57. PendingOrder confirm preserves the stored quote snapshot and does not recompute pricing, promotion, voucher, shipping, VAT, or reward lines.
58. `POST /api/invoices` supports quoteId mode and direct cash/POS no-quote mode.
59. Newly created direct cash/POS invoices use the same Slice 7 allocation engine; old local invoice data compatibility/backfill is not required.
60. Direct cash/POS no-quote mode computes shipping, voucher, VAT, reward/free item, and allocation values only from supported backend inputs and catalog truth.
61. Backend rejects stale/invalid quote usage; direct cash/POS no-quote recompute follows deterministic VND rounding and exact bucket-sum allocation.
62. Line totals, subtotal, discount bounds, shipping discount bounds, VAT base, VAT amount, final amount, reward/free item pricing, and pending-order-to-invoice snapshot consistency are validated.
63. Slice 6C VAT tests lock the historical simplified subtotal-base behavior; Slice 7 adds new tests for merchandise-net VAT base after allocated discounts while keeping shipping excluded.
64. `shippingPayable` is derived only and is not a persisted canonical v1 backend field.
65. Reward/free item line is a stock-backed invoice item with zero revenue, original price snapshot, and COGS when stock is deducted.
66. Exact batch allocation still points to the scanned batch when discounts, VAT, shipping, and reward/free item lines exist.
67. Batch trace remains stock-only and does not alter commercial math; no `batchId` still means FEFO fallback.
68. Exact-batch and FEFO invoice lines both use quote pricing and only differ in stock allocation.
69. `unitCostSnapshot` remains exact batch or FEFO allocation cost, never discounted sell price.
70. VAT fields persist and display consistently across pending order, invoice, admin, POS, storefront, and reports.
71. Revenue reports use persisted commercial line fields where applicable: product/category/top rollups and `sumProfitBetween`/`sumLineNetRevenueBetween` use `COALESCE(lineNetRevenue, quantity×unitPrice)` for legacy rows without allocation. Daily net revenue (`dailyRevenue`) remains invoice-level `(totalAmount−discountAmount)` per existing S1a-style cash basis.
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

#### Slice 7 / 8 / 9 acceptance

85. **PASS / DONE (backend 2026-04-29):** KiotViet-like commercial allocation is implemented in `CommercialPricingEngine.computeMerchandiseQuoteAllocation` + `CommercialDiscountAllocationService`. Quotes persist per-line `CommercialLineSnapshotDto`; invoice/pending items persist V25 commercial columns. Profit report `totalRevenue` = `sumLineNetRevenueBetween` (merchandise net, ex VAT); `totalProfit` = `sumProfitBetween` = Σ(`lineNetRevenue − qty×unitCostSnapshot`). `revenueByProduct` / `revenueByCategory` / `topProducts` aggregate `COALESCE(lineNetRevenue, qty×unitPrice)` for revenue, `qty×unitCostSnapshot` for COGS, and line profit as net minus COGS; `RevenueByProductDto` adds `merchandiseNetRevenue`, `merchandiseAllocatedDiscountTotal`, `merchandiseCost`, `merchandiseNetProfit`.

**Report query reference (`SalesInvoiceRepository`):** `sumProfitBetween`, `sumLineNetRevenueBetween`, `revenueByProduct`, `revenueByCategory`, `topProducts` use persisted `lineNetRevenue` with legacy fallback. `dailyRevenue` unchanged (invoice totals, not line allocation).

**Invoice API:** `DtoMapper.toResponse(SalesInvoice)` uses summed `lineNetRevenue` when any line has `commercialAllocationVersion`; skips invoice-level merchandise discount smear in that mode (`invoiceProfitBasis=commercial_line_allocation`). Direct cash/POS no-quote `POST /api/invoices` now materializes the same Slice 7 allocation snapshot from backend catalog/request truth before persisting invoice items; `batchId` remains stock allocation only, and exact-batch/FEFO lines share the same commercial calculation.

**Automated tests:** `Slice7CommercialEngineUnitTest` (85a manual base weights, 85b PRODUCT/CATEGORY promotion allocation, 85c VND sum, 85d buckets, 85g FREE_SHIPPING cap, 85h VAT base, 85i payable total); `Slice7CommercialReportingIntegrationTest` (85e persisted rollups); `Slice7CommercialFlowIntegrationTest.acceptance_85f_reward_free_item_persists_zero_revenue_commercial_invariants_and_cogs_stock`; `Slice7CommercialFlowIntegrationTest.acceptance_85j_quote_to_pending_to_invoice_preserves_commercial_snapshots_without_recompute`; `Slice7CommercialFlowIntegrationTest.direct_cash_pos_no_quote_invoice_materializes_slice7_allocation_for_exact_batch_and_fefo_lines`. These flow tests also assert `invoice.finalAmount == pricingBreakdownSnapshot.total()`. Verified green with `.\gradlew.bat test --tests "*Slice7*" --no-daemon`, `.\gradlew.bat test --tests "*Slice6c*" --no-daemon`, `.\gradlew.bat test --tests "*Slice6b*" --tests "*Production*" --no-daemon`, and full `.\gradlew.bat test --no-daemon`.

**No remaining Slice 7 blockers:** 85f reward/free item invariants are dedicated and passing; 85j quote → pending order → invoice snapshot parity is dedicated and passing; direct cash/POS no-quote invoices persist commercial allocation fields and pricing breakdown snapshots. **85k/85l** remain covered by regression/full-suite behavior.

Local-only / no backfill: unchanged; old rows without `lineNetRevenue` continue to use gross line extension in `COALESCE`.

85a. Covered by `Slice7CommercialEngineUnitTest.acceptance_85a_*`.
85b. Covered by `acceptance_85b_product_scope_*` and `acceptance_85b_category_scope_*`.
85c. Covered by `acceptance_85c_*`.
85d. Covered by `acceptance_85d_*`.
85e. Covered by `Slice7CommercialReportingIntegrationTest`.
85f. Covered by `Slice7CommercialFlowIntegrationTest.acceptance_85f_reward_free_item_persists_zero_revenue_commercial_invariants_and_cogs_stock`.
85g. Covered by `acceptance_85g_*`.
85h. Covered by `acceptance_85h_*`.
85i. Covered by `acceptance_85i_*`.
85j. Covered by `Slice7CommercialFlowIntegrationTest.acceptance_85j_quote_to_pending_to_invoice_preserves_commercial_snapshots_without_recompute`.
85k/85l. **PASS by regression** — full `./gradlew test`.
86. **PLANNED / NEXT (Slice 8):** Unified backend JWT auth is the only real app auth flow: `/login` serves admin and user; `/signup`, TOTP, refresh, logout, and `/api/auth/**` remain backend JWT truth.
87. `/admin/login` is not reachable in active route config; Supabase auth guard is not used for real admin/user flow; `window.prompt` JWT login and separate `nhadan.adminAuth.session` are removed.
88. Frontend stores auth only under `nhadan.auth.session.v1` with access token, refresh token, expiry, username, full name, roles, and optional customer id.
89. Admin with `ROLE_ADMIN` reaches `/admin`; regular user reaches `/account`; guest `/account` redirects to `/login?next=/account`; regular user is blocked from `/admin`.
90. Access-token refresh runs proactively and retries once on 401; revoked/expired refresh clears session and redirects to login; logout revokes refresh and clears local session.
91. `User` is auth/security/role identity; `Customer` is business/CRM/order/total-spend/debt/loyalty identity; points belong to `Customer`, not `User`.
92. `users.customer_id -> customers.id` exists as nullable unique FK; signup creates linked customer; existing storefront user without customer lazy-links on `/api/account/me`.
93. `/api/account/me`, `/api/account/profile`, `/api/account/orders`, `/api/account/points`, and `/api/account/points/history` are authenticated and scoped to the logged-in user’s linked customer.
94. `/api/customers/**` remains admin-only; normal users cannot list/update arbitrary customers or redeem another customer’s points.
95. Storefront `/`, `/products`, and `/products/:id` load backend product/category truth from `/api/products` and `/api/categories`; real storefront flow has no `@/lib/mock-data` import.
96. Product card add-to-cart stores numeric backend `productId` and numeric backend `variantId`; only active + sellable variants can be added.
97. Cart has no seed data; old schemas, non-numeric IDs, and `catalogSource !== "backend"` lines are cleared or blocked with clear UI feedback.
98. Cart checkout revalidates products/variants against backend catalog; invalid or over-stock cart lines block checkout or are capped before quote calls.
99. Checkout never creates a real order from FE pricing snapshots; it calls `/api/promotions/pick-best`, `/api/sales/quote`, then `/api/pending-orders` with `quotePublicId`.
100. New checkout flow does not emit backend commercial errors caused by local IDs such as “Không tìm thấy sản phẩm ID: 1”.
101. Loyalty earn: direct/POS invoice, pending-order confirm, and Casso auto-confirm earn points exactly once from confirmed invoice billable item net revenue.
102. Loyalty earn excludes quote-only, unpaid pending order, VAT, shipping fee, shipping discount, reward/free lines, and COGS; discounts including `loyaltyDiscount` reduce the earn base.
103. Default earn policy is configurable and starts as 1 point per 1,000đ item net revenue; earning points is liability/account tracking and does not immediately reduce revenue/profit.
104. Loyalty redeem: guest cannot redeem; logged-in user can redeem only own linked customer points; default redeem policy starts as 1 point = 1đ.
105. `loyaltyDiscount` is a merchandise discount bucket allocated to billable item lines as `allocatedLoyaltyDiscount`; it reduces item revenue/profit like other merchandise discounts.
106. `loyaltyDiscount` does not reduce shipping and does not reduce VAT; reward/free lines receive zero loyalty allocation.
107. Redemption caps requested points by available points, item net revenue after manual/promo/voucher, and optional max-percent config; `availablePoints = pointBalance - pointReserved`.
108. Pending order point lifecycle is atomic: pending create with points creates `RESERVED`, confirm converts to `REDEEMED`, cancel/expire converts to `RELEASED` or `EXPIRED` without decreasing point balance.
109. Concurrent pending orders cannot overspend points; Casso retry cannot double earn or double redeem.
110. Reports/account/admin/customer views expose point balance, reserved points, lifetime earned/redeemed, point history, invoice loyalty discount, and loyalty-redeemed points; profit/revenue reports remain discount-aware.
111. Slice 8 FE-BE smoke covers PostgreSQL backend on `8080`, Vite on `5173`, admin login/logout, user login/account, backend catalog cart checkout with points, pending order creation, confirmation path, and reservation/redeem/earn verification.
112. Future standalone payment-session formalization remains deferred unless separately approved.
113. Slice 9 reporting endpoints remain future/deferred, except for any production-awareness naturally covered by existing batch/movement-truth reports.

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
14. Slice 7 overrides the earlier simplified VAT math for new invoices: VAT base is merchandise net after allocated merchandise discounts, VAT excludes shipping, and VAT remains excluded from revenue/profit.
15. Shipping remains a separate invoice-level revenue/cost bucket; carrier settlement and automated `shippingActualCost` capture remain deferred until a real carrier settlement source exists.
16. Slice 7 VAT remains a simplified internal/KiotViet-like commercial model for default display/reporting. It is not a statutory tax-invoice implementation. If legal VAT invoices are required later, add a dedicated tax slice for item-level taxable base, tax-inclusive/exclusive pricing, discount treatment, invoice templates, and shipping VAT rules.
17. Slice 6C locks storefront `cod` / `cash_on_delivery` as pending-order-first for real stock/report flows.
18. Slice 7 locks stale frontend price handling: online/deferred real flows use non-expired backend quotes, while direct cash/POS no-quote invoice mode recomputes from current catalog using the same allocation engine.
19. Manual discount decision is locked for Slice 7: invoice-level manual discount is allocated to eligible paid merchandise lines by line net amount; line-level discounts remain captured separately as `lineOwnDiscountAmount`.
20. Current storefront mock/local IDs can break backend commercial APIs with errors such as “Không tìm thấy sản phẩm ID: 1”; Slice 8 must clear/block legacy cart IDs and use backend numeric product/variant IDs only.
21. `User` and `Customer` must not be conflated: `User` is login/security/role identity, while `Customer` owns CRM/order/total-spend/debt/loyalty state.
22. Points belong to `Customer`, not `User`; normal users must only access and redeem points from their linked customer via `users.customer_id`.
23. Point overspend is a concurrency risk across multiple pending orders; Slice 8 reservation must atomically maintain `pointReserved` and enforce `availablePoints = pointBalance - pointReserved`.
24. `loyaltyDiscount` must remain a merchandise discount allocated to billable item lines; it must not reduce shipping or VAT and must not allocate to reward/free lines.
25. Redemption and pending-order reservation are in scope for planned Slice 8, including `RESERVE -> REDEEM -> RELEASE`; they are not deferred to the standalone payment-session slice.
26. Auth migration risk: `/admin/login`, Supabase guard behavior, prompt-based JWT login, and separate admin session storage may have hidden dependencies in current frontend screens; Slice 8 must remove active real-flow usage without breaking admin/user role routing.
