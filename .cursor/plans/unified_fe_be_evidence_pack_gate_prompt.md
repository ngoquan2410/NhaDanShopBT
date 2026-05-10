# Unified Prompt: FE + BE Evidence Pack Gate for NhaDanShopBT Performance Plan

Copy toàn bộ prompt này đưa cho Cursor/AI agent để update plan hiện tại.  
Mục tiêu: biến performance plan thành một plan có **bằng chứng trước/sau** cho cả FE contract, BE business truth, DB invariant và query performance trước khi cho phép implement.

---

```text
Bạn là Senior Full Stack Developer + Senior Database Performance Engineer đang làm trên repo NhaDanShopBT.

NHIỆM VỤ
Hãy UPDATE file plan hiện tại:
be_performance_n+1_fix_de8140c2.plan.md

Chỉ update plan.
KHÔNG sửa source code.
KHÔNG tạo migration.
KHÔNG implement test ngay.
KHÔNG sửa FE ngay.

Mục tiêu là bổ sung một Evidence Pack Gate đầy đủ cho cả FE và BE trước khi implement các performance fix N+1/query-in-loop.

Plan hiện tại đã phát hiện các vấn đề:
- CustomerService: getAll/search/toResponse có 3N+1 query cho customer stats.
- SalesQuoteService: quote và helpers query product/variant/batch/combo trong loop.
- ProductComboService: list/toResponse/updateVirtualStock query combo items và stock từng component.
- PendingOrderService: list/admin/listAll map full toResponse, có nguy cơ lazy N+1 và embed full invoice response trong list.
- StockAdjustmentService: getAll map entity với lazy items/variant/product/sourceBatch.
- InventoryReceiptService: createReceipt lookup product/combo/import unit nhiều pass.
- ExcelImportService / ExcelReceiptImportService: parse/import lookup DB theo từng row.
- PromotionService: list map lazy collections và gift product name lookup từng promotion.
- ProductionOrderService: mapOrder/applyConsumes query allocation/variant/batch trong loop.
- DtoMapper: full mapper đọc lazy association, đặc biệt invoice trong PendingOrderResponse.
- Code generation: một số nơi dùng findAll/count/exists loop.

GIỮ LẠI FINDINGS HIỆN TẠI
Không xóa các finding chi tiết trong plan cũ.
Chỉ bổ sung gate, sequencing, acceptance criteria, test plan, risk, stop condition và report template.

BUSINESS TRUTH BẮT BUỘC GIỮ
Không được đề xuất thay đổi nào làm vỡ các rule sau:

1. Stock truth
- ProductBatch.remainingQty là stock truth thật.
- ProductVariant.stockQty chỉ là projection/compatibility field.
- Product-level stock không phải canonical truth.
- InventoryMovement là append-only ledger, không sửa/xóa để làm đẹp lịch sử.
- Mọi stock mutation phải đi qua controlled mutation path.
- Không direct-write ProductBatch.remainingQty hoặc ProductVariant.stockQty tùy tiện.
- Nếu total stock và batch stock lệch, batch là gốc audit; variant stock là projection cần sync lại.

2. Snapshot truth
- Quote/pending/invoice/profit dùng backend snapshot làm source of truth.
- UI/BE không recompute invoice/pending/profit cũ từ catalog/promotion/loyalty/product price/batch cost hiện tại.
- Historical snapshot phải đọc được kể cả master data đã đổi/xóa/archive.
- Invoice từ quote phải materialize lines từ quote payload, không recompute catalog price.

3. Posted business events
- Business event đã phát sinh thì dùng cancel/void/reverse/archive, không hard delete tùy tiện.
- Không hard delete completed invoice.
- Không hard delete confirmed stock adjustment.
- Không hard delete receipt nếu có downstream consumption.
- Không physical delete referenced customer/supplier/voucher/promotion/combo/product/variant.

4. Pending order truth
- Pending order không trừ stock thật.
- Pending lưu snapshot: shipping address, gift lines, promotion, voucher, shipping quote, pricing breakdown, total amount.
- Pending status: PENDING_PAYMENT, WAITING_CONFIRM, CONFIRMED, PAID_AUTO, CANCELLED.
- Pending confirm là sole authority tạo invoice từ pending.
- Manual payment link không tạo invoice và không mark confirmed.
- Pending confirm phải idempotent, không duplicate invoice/movement.
- Pending list phải server-side pagination/sort/filter.
- Tab counts phải từ backend counts/toàn bộ filter, không đếm page hiện tại.
- Pending detail phải hiển thị loyalty/promo/voucher/gift/shipping từ snapshot.

5. Sales / exact batch / invoice truth
- Final invoice creation phải revalidate dưới lock.
- Nếu invoice line có batchId, backend phải trừ đúng batch đó, không auto-FEFO.
- Nếu không có batchId, FEFO là fallback.
- Exact-batch sale phải ghi SalesInvoiceItemBatchAllocation.
- Cancel invoice restore đúng batch từ allocation trace.
- COGS exact-batch dùng đúng batch.costPrice.
- Invoice cancel giữ invoice row, set CANCELLED, restore stock theo allocation trace, append invoice_cancel movement, reverse earned loyalty nếu có.
- Reports filter COMPLETED.

6. Stock adjustment truth
- DRAFT được delete.
- CONFIRMED không được delete.
- Confirm diff = actualQty - systemQty.
- Negative adjustment có sourceBatch thì trừ đúng batch.
- Negative adjustment không sourceBatch thì dùng current-adjustable physical batches, không dùng sales sellable predicate.
- Reversal dùng allocation trace, không chạy lại FEFO hiện tại.
- Không dùng tổng variant stock để reverse; phải đủ trên từng original batch.
- Reversal không mutate confirmed record cũ; tạo reversal linkage/record rõ.
- Sau confirm/reverse: ProductVariant.stockQty == SUM(ProductBatch.remainingQty).

7. Receipt truth
- Goods receipt backend hiện là confirmed-on-create.
- POST /api/receipts tạo receipt, batch, stock mutation, goods_receipt movement trong một transaction.
- Receipt delete hard-delete chỉ khi mọi batch còn nguyên remainingQty == importQty.
- Nếu có downstream consumption thì delete bị block.
- Receipt void giữ receipt row và batch row.
- Receipt void zero exact remaining qty của receipt-owned batches.
- Receipt void append goods_receipt_void movement.
- Duplicate void phải idempotent hoặc reject, không double movement.
- Fully consumed receipt void là metadata-only.
- Voided receipt không được delete.

8. Quote / pricing / promotion / voucher / loyalty / shipping truth
- POST /api/sales/quote là source chính cho checkout/POS pricing.
- Storefront quote không được gửi manual discount.
- Storefront quote không được gửi line discount.
- Client không được gửi rewardLine; reward/gift line chỉ do backend tạo.
- Quote snapshot gồm billable lines, reward lines, pricing breakdown, promotion snapshot, voucher snapshot, shipping snapshot, loyalty snapshot.
- Quote-backed pending/invoice phải dùng snapshot này.
- Quote consumed không được dùng lại.
- Promotion/voucher/loyalty/shipping là các bucket riêng, không gộp sai.
- Free shipping chỉ ảnh hưởng shippingDiscount.
- promotionDiscount=0 với FREE_SHIPPING.
- Free ship không giảm merchandise revenue/profit.
- Gift không phải discount tiền; gift line giá 0.
- Gift vẫn trừ stock, có COGS nếu batch cost > 0, không earn loyalty.
- Loyalty display lấy snapshot, không lấy balance hiện tại để render order/invoice cũ.

9. Batch / sellable truth
- Sales sellable predicate:
  remainingQty > 0,
  batch status=active,
  không hết hạn,
  product active,
  variant active,
  variant isSellable=true.
- Production input predicate khác sales, không yêu cầu isSellable=true.
- Stock adjustment current-adjustable predicate khác sales:
  có thể trừ active/blocked physical stock,
  không filter expiry,
  không cần product/variant sellable,
  không trừ voided/depleted/archived.
- InventoryProjection.onHand là physical/system stock.
- InventoryProjection.available giữ nghĩa onHand - reserved, không đổi thành sellable.
- sellableQty là field additive, không đổi nghĩa onHand/available.
- Combo virtual sellable stock phải tính từ batch sellable của component default variants, không dùng raw variant.stockQty.
- Combo sellableQty là null nếu đó là current contract.

10. Pagination / count / list truth
- Pending orders, unmatched payments, voucher, promotion list cần server-side pagination/sort/search/filter.
- totalElements là tổng toàn bộ theo filter, không phải page length.
- Search/filter/sort gửi query về BE, không filter client sau khi chỉ load một page.
- List default ẩn archived nếu không ở audit/includeArchived mode.

11. Error contract
- Business conflict trả 409.
- Validation bad request trả 400.
- Duplicate signup phone: 409 PHONE_ALREADY_REGISTERED.
- Không leak SQL constraint/JDBC stack trace ra storefront/admin UI.
- UI/API error message phải là message nghiệp vụ sạch.

============================================================
UPDATE 1: THÊM SECTION “UNIFIED FE + BE EVIDENCE PACK GATE”
============================================================

Hãy thêm section mới sau Executive Summary:

## Unified FE + BE Evidence Pack Gate

Performance fix chỉ được coi là an toàn khi chứng minh được đủ 3 điều:

1. Nhanh hơn:
- Có query-count baseline trước/sau.
- Dataset size rõ ràng.
- Query count không tăng tuyến tính theo N.
- Nếu có index/config change thì có EXPLAIN hoặc migration/lock-risk note.

2. Không vỡ BE business truth:
- Có current behavior baseline.
- Có golden response snapshot cho money/stock/history endpoints.
- Có DB state assertion.
- Có invariant SQL/test.
- Existing business regression tests pass.

3. Không vỡ FE/API contract:
- Có FE usage audit.
- Có JSON response contract snapshot.
- Không remove/rename/type-change field nếu không có FE adapter migration cùng slice.
- UI layout không đổi trong performance slice, trừ khi report nêu rõ và được approve.

Không được implement nếu thiếu một trong ba nhóm evidence trên.

============================================================
UPDATE 2: THÊM “BACKEND EVIDENCE PACK GATE”
============================================================

Thêm section:

## Backend Evidence Pack Gate

Không chỉ FE cần chứng minh. Mọi BE performance fix đều phải có bằng chứng trước/sau, đặc biệt với money/stock/history.

Backend Evidence Pack bắt buộc gồm:

### 1. Current BE Behavior Baseline
Với từng area được sửa, phải ghi:
- Service/controller/repository liên quan.
- Endpoint/API liên quan.
- Current response DTO/JSON hoặc service result.
- DB rows hiện tại được tạo/sửa/đọc.
- Query count hiện tại.
- Dataset seed dùng để đo.

### 2. Business Truth Mapping
Với từng optimization, phải map:
- Business truth nào bị ảnh hưởng.
- Guardrail cần giữ.
- Cách optimization tránh đổi semantics.
- Test nào chứng minh không đổi.

### 3. DB State Evidence
Với money/stock/history flow, assert DB state trước/sau:
- ProductBatch.remainingQty.
- ProductVariant.stockQty.
- ProductBatch.status.
- InventoryMovement rows.
- SalesInvoiceItemBatchAllocation rows.
- SalesQuote payload snapshot.
- PendingOrder snapshot fields.
- SalesInvoice item snapshots.
- Pricing breakdown snapshot.
- Loyalty reservation/transaction rows nếu có.
- Payment event status nếu có.
- InventoryReceipt status/void metadata.
- StockAdjustment allocation trace/reversal linkage.
- ProductComboItem/component links nếu có.

### 4. Backend Invariant Evidence
Phải có test hoặc SQL/assertion cho:
- ProductVariant.stockQty == SUM(ProductBatch.remainingQty).
- No voided batch with remainingQty > 0 can enter FEFO/sellable/projection/valuation.
- Pending chưa confirm không trừ stock.
- Pending confirm idempotent, không duplicate invoice/movement.
- Manual payment link không tạo invoice và không mark confirmed.
- Invoice cancel restore đúng batch allocation.
- InventoryMovement append-only.
- Receipt void/delete matrix không đổi.
- Stock adjustment reversal dùng allocation trace, không chạy lại FEFO hiện tại.
- Reports exclude CANCELLED invoices.
- Pending tab counts là backend full-filter counts.
- Quote/pending/invoice snapshots không recompute từ master data hiện tại.

### 5. Golden Response Snapshots
Bắt buộc cho các endpoint/flow nếu touched:
- POST /api/sales/quote.
- GET pending order detail.
- GET pending admin list nếu contract giữ nguyên.
- Invoice detail nếu touched.
- Combo list nếu touched.
- Customer list/search stats nếu touched.
- Promotion list/evaluate nếu touched.
- Stock adjustment list/detail nếu touched.
- Receipt list/detail/void/delete nếu touched.

### 6. Query-count Evidence
Với từng performance fix:
- Query count trước.
- Query count sau.
- Dataset size.
- Endpoint/service tested.
- Threshold.
- Kết luận: query count có còn tăng tuyến tính theo N không.
- Nếu chỉ bật hibernate.default_batch_fetch_size mà root N+1 vẫn còn thì không coi là complete.

### 7. Backend Go/No-Go Rule
Không được implement nếu:
- Chưa có baseline behavior.
- Chưa có DB invariant test.
- Chưa có query-count baseline.
- Chưa có golden snapshot cho money/quote/stock flow.
- Optimization có thể đổi money/stock/history semantics.
- Không chứng minh được mutation path giữ nguyên.
- Không chứng minh được historical snapshot giữ nguyên.

============================================================
UPDATE 3: THÊM “FE/API CONTRACT EVIDENCE PACK GATE”
============================================================

Thêm section:

## FE/API Contract Evidence Pack Gate

Trước khi tối ưu endpoint có thể đổi response shape, đặc biệt PendingOrder list/admin, phải có FE evidence.

### 1. FE Static Usage Audit
Trước Phase 2 PendingOrder, bắt buộc grep toàn FE cho:
- pendingOrder.invoice
- order.invoice
- invoice?.items
- invoice.items
- PendingOrderResponse
- PendingOrder
- invoiceSummary
- invoiceId
- invoiceNo
- pricingBreakdown
- promotionSnapshot
- voucherSnapshot
- loyaltySnapshot
- shippingQuoteSnapshot
- giftLines

### 2. FE Usage Classification
Phân loại từng usage:
- List/table usage.
- Detail drawer/page usage.
- Print/export usage.
- Confirm/payment/reconciliation usage.
- Adapter/type-only usage.
- UI rendering usage.

### 3. FE Contract Output Required
Report bắt buộc:
- FE files affected.
- Fields actually used.
- Whether usage is list-only or detail-only.
- Whether FE requires full nested object or just summary field.
- Whether BE can safely avoid full invoice in list.
- Whether adapter-only change is needed.
- Whether UI layout changes are needed.

### 4. FE Stop Condition
Stop nếu:
- FE usage unknown.
- Existing response shape is not captured.
- PendingOrder list currently requires full pendingOrder.invoice.items/allocation and there is no FE adapter migration.
- A response field is removed/renamed/type-changed without contract test.
- Performance fix requires UI redesign.

### 5. FE Default Rule
- BE performance fixes must preserve existing response fields and meanings.
- Field addition is OK if backward-compatible.
- Field removal/rename/type change requires FE adapter migration in same slice.
- UI layout/screen behavior must not change in this performance slice unless explicitly approved.
- If FE change is needed, prefer service adapter/type normalization only.

============================================================
UPDATE 4: UPDATE PHASE SEQUENCING
============================================================

Cập nhật phase hiện tại thành:

## Phase 0A - Backend Evidence Baseline
- Capture current BE behavior for all touched areas.
- Capture DB state before/after for money/stock/history flows.
- Add or identify existing regression tests proving business truth.
- Capture golden response snapshots for high-risk endpoints.
- Run invariant SQL/tests.
- No business logic change.

## Phase 0B - FE/API Contract Evidence
- Run FE static usage audit.
- Capture current JSON response shape for affected endpoints.
- Classify list/detail/print/payment usage.
- Decide compatibility strategy.
- No BE/FE implementation change.

## Phase 0C - Query-count Baseline
- Add perf test profile/query-count helper.
- Baseline:
  GET /api/customers
  GET /api/pending-orders/admin or current pending list endpoint
  POST /api/sales/quote
  GET /api/combos
  GET /api/stock-adjustments
  GET /api/receipts
  GET /api/promotions
- Output baseline table with dataset size.

## Phase 1 - Low-risk N+1 Fixes
Allowed only after Phase 0A/0C baseline for affected area.
Allowed first:
- Customer batch stats.
- ProductCombo bulk preload if response shape unchanged.
- StockAdjustment list fetch/2-step if response shape unchanged.
- Promotion list preload if response shape unchanged.
- No DTO field removal/rename.

## Phase 2A - PendingOrder FE Contract Audit
Blocked until Phase 0B evidence exists.
- Audit FE usage of pending order invoice/snapshot fields.
- Decide whether list endpoint can avoid full invoice.
- Attach FE usage report.

## Phase 2B - PendingOrder BE Optimization
Blocked until Phase 2A passes.
Rules:
- Detail endpoint must continue returning full snapshot/detail.
- List optimization must preserve API contract or use backward-compatible strategy.
- If FE only needs invoiceId/invoiceNo/status/total in list:
  BE may avoid loading full invoice.items.
- If FE needs full invoice in list:
  Do not change existing endpoint directly.
  Use one of:
  Option A: new summary endpoint, e.g. /api/pending-orders/admin/summary.
  Option B: query param includeInvoiceDetails=false/true.
- Existing detail endpoint still shows promo/voucher/loyalty/gift/shipping snapshots.
- Pending tab counts remain backend full-filter counts.

## Phase 3A - SalesQuote Golden Parity Baseline
Blocked before QuoteContext refactor.
Capture golden baseline for:
- POS quote with manual discount.
- Storefront quote rejecting manual/line discount.
- Percent promotion.
- Fixed promotion.
- Free shipping promotion.
- Voucher percent.
- Voucher fixed.
- Voucher free shipping.
- Loyalty redeem.
- Gift promotion.
- Combo line.
- Exact batch quote.
- Shipping address quote.
- Quote persisted snapshot.

## Phase 3B - SalesQuote QuoteContext Optimization
Blocked until Phase 3A passes.
Rules:
- Only refactor data access first.
- No pricing semantics change unless explicitly justified by business truth.
- SalesQuoteResponse must match golden snapshots field-by-field.
- DB SalesQuote payload snapshot must match.
- Any changed field must be classified:
  A. Accepted correction of prior bug against business truth.
  B. Unexplained regression => stop and report.

## Phase 4 - Receipt + Excel Bulk Preload
Allowed after backend evidence for receipt/import flows.
- Pre-scan request/sheet.
- Bulk load product/variant/import unit/combo data.
- Validate via HashMap/HashSet.
- Do not bypass controlled stock mutation.
- Preserve confirmed-on-create.
- Preserve receipt void/delete matrix.

## Phase 5 - DB Index + Hibernate Config
Blocked until:
- Query baseline exists.
- EXPLAIN/lock-risk reviewed.
- Root N+1 fixes are planned or done.
Rules:
- hibernate.default_batch_fetch_size can help but cannot be the only fix.
- Index migration must include lock-risk note.
- Config changes must be test-profile first unless approved.

## Phase 6 - Code Generation Cleanup
Allowed after behavior baseline.
- Replace findAll/count/exists loop with max suffix/sequence/counter/unique retry.
- Preserve no code reuse for historical product/variant/customer/supplier codes.
- Add concurrency/unique retry plan if needed.

============================================================
UPDATE 5: ADD IMPLEMENTATION ALLOWED / BLOCKED MATRIX
============================================================

Thêm section:

## Implementation Allowed / Blocked Matrix

Allowed to implement first after evidence baseline:
- Phase 0A Backend Evidence Baseline.
- Phase 0B FE/API Contract Evidence.
- Phase 0C Query-count Baseline.
- Customer batch stats.
- ProductCombo bulk preload if response unchanged.
- StockAdjustment list fetch/2-step if response unchanged.
- Promotion list preload if response unchanged.

Blocked until extra gate:
- PendingOrder Phase 2B blocked until FE contract audit is done.
- SalesQuote Phase 3B blocked until golden parity tests exist.
- Any stock mutation optimization blocked until DB invariant tests exist.
- Any invoice/cancel/receipt/adjustment logic change blocked until allocation/movement evidence exists.
- Hibernate batch_fetch_size blocked until root-cause fixes/tests.
- Index migration blocked until EXPLAIN/lock-risk review.
- Any DTO/response shape change blocked until API contract snapshot and FE usage audit exist.

============================================================
UPDATE 6: ADD “NO PAGEABLE JOIN FETCH COLLECTION” RULE
============================================================

Thêm vào Detailed Technical Design và Acceptance Criteria:

## No Pageable JOIN FETCH Collection Rule

With pageable endpoints that involve OneToMany/collection associations:
- Do not use JOIN FETCH collection directly on a Page query if it can cause duplicate rows or in-memory pagination.
- Prefer:
  1. Page IDs first.
  2. Fetch graph using WHERE id IN (:ids).
  3. Sort back using orderIndex HashMap.
- Apply to:
  PendingOrder list/admin.
  StockAdjustment list.
  Promotion list if fetching collections.
  Any future invoice-like list.
- If @EntityGraph is used on pageable collection, verify:
  - No Hibernate in-memory pagination warning.
  - No duplicate page rows.
  - totalElements remains correct.
  - Query count/page content test passes.

============================================================
UPDATE 7: UPDATE ACCEPTANCE CRITERIA
============================================================

Bổ sung vào Acceptance Criteria:

## Global Evidence AC
- Every implemented phase has an Evidence Pack.
- Backend baseline captured before code change.
- FE/API contract baseline captured before response-shape change.
- Query-count baseline captured before performance claim.
- Before/after results appear in final report.
- No phase is marked done without evidence.

## FE/API Compatibility AC
- Existing endpoint fields are not removed/renamed/type-changed without FE adapter migration.
- UI layout does not change in this performance slice unless explicitly approved.
- Any FE change should be adapter/type normalization only by default.
- Existing detail endpoints keep full snapshot fields.
- JSON contract tests pass.

## Backend Business Truth AC
- ProductBatch.remainingQty remains stock truth.
- ProductVariant.stockQty remains projection and equals SUM(batch.remainingQty) after mutation flows.
- InventoryMovement remains append-only.
- Quote/pending/invoice snapshots are not recomputed from current master data.
- Pending confirm remains idempotent and sole invoice authority.
- Manual payment link does not create invoice.
- Invoice cancel restores exact allocation trace.
- Receipt void/delete matrix unchanged.
- Stock adjustment reversal uses allocation trace.
- Promotion/voucher/loyalty/shipping bucket separation preserved.
- Gift remains reward line, not money discount.
- Free shipping remains shipping bucket only.
- Reports exclude CANCELLED invoices.
- totalElements/counts are backend full-filter counts.

## Query-count AC
- Query count before/after is reported with dataset size.
- Query count does not grow linearly with number of rows for fixed page size.
- Tests cover at least:
  customers_100Rows_queryCount_constant
  pendingOrders_adminPage_50Rows_queryCount_constant
  salesQuote_20Lines_queryCount_notLinear
  combos_100Rows_queryCount_constant
  stockAdjustments_50Rows_queryCount_constant
  promotions_50Rows_queryCount_constant if touched
  receipts_page_queryCount_constant if touched
- default_batch_fetch_size alone is not enough to mark root N+1 fixed.

## PendingOrder AC
- Phase 2B cannot start until FE contract audit passes.
- List optimization does not remove detail snapshot data.
- Existing detail endpoint still returns promo/voucher/loyalty/gift/shipping snapshot.
- Existing list endpoint is not breaking unless FE adapter migration is included.
- Tab counts remain backend full-filter counts.

## SalesQuote AC
- Phase 3B cannot start until golden baseline exists.
- QuoteContext refactor does not change pricing semantics.
- SalesQuoteResponse matches golden snapshots field-by-field.
- DB SalesQuote persisted payload snapshot matches.
- Promotion/voucher/loyalty/shipping buckets stay separate.
- Gift line remains backend-created reward line with price 0.
- Free shipping sets shippingDiscount and does not reduce merchandise revenue/profit.
- Any intentional behavior change must cite business truth and have test proof.

============================================================
UPDATE 8: UPDATE TEST PLAN
============================================================

Bổ sung vào Test Plan:

## A. Backend Evidence Tests

### CustomerService
Seed:
- Customer A with invoices linked by customer_id.
- Customer B with invoice phone snapshot if current identity logic supports phone matching.
- COMPLETED invoice.
- CANCELLED invoice.
Assert:
- totalSpend/orderCount/lastCompletedAt same before/after.
- CANCELLED excluded.
- Query count no longer 3N+1.

### PendingOrderService
Assert:
- list totalElements correct.
- tab counts are full-filter counts.
- detail returns promotion/voucher/loyalty/gift/shipping snapshots.
- pending before confirm does not deduct stock.
- confirm creates exactly one invoice.
- repeated confirm does not duplicate invoice/movement.
- manual payment link does not create invoice or mark confirmed.

### SalesQuoteService
Golden scenarios:
- POS manual discount.
- Storefront rejects manual/line discount.
- Percent promotion.
- Fixed promotion.
- Free shipping promotion.
- Voucher percent.
- Voucher fixed.
- Voucher free shipping.
- Loyalty redeem.
- Gift promotion.
- Combo line.
- Exact batch quote.
- Shipping address quote.
Assert fields:
- subtotal.
- manualDiscount.
- promotionDiscount.
- voucherDiscount.
- loyaltyDiscount.
- shippingFee.
- shippingDiscount.
- VAT.
- total.
- billable lines.
- reward lines.
- effectivePromotionId/name/type.
- voucher snapshot.
- loyalty snapshot.
- shipping snapshot.
- persisted SalesQuote payload snapshot.

### ProductComboService
Seed component batches:
- active unexpired.
- expired.
- inactive product.
- inactive variant.
- non-sellable variant.
- blocked/voided/depleted batch.
Assert:
- combo virtual sellable follows sales sellable predicate.
- no raw variant.stockQty used as sellable truth.
- response shape unchanged.

### StockAdjustmentService
Assert:
- DRAFT delete allowed.
- CONFIRMED delete rejected.
- confirm diff = actualQty - systemQty.
- negative sourceBatch deducts exact batch.
- unsourced negative uses current-adjustable physical batches, not sales sellable predicate.
- reversal uses allocation trace.
- no FEFO re-run on reverse.
- ProductVariant.stockQty == SUM(ProductBatch.remainingQty).

### InventoryReceiptService
Assert:
- POST /api/receipts is confirmed-on-create.
- receipt + batch + stock mutation + goods_receipt movement in one transaction.
- delete allowed only if batch unconsumed.
- downstream consumption blocks delete.
- void keeps receipt and batch rows.
- void zeros exact remaining qty.
- void appends goods_receipt_void.
- fully consumed void is metadata-only.
- duplicate void does not double movement.

### Invoice / Exact Batch
If touched:
- exact batch sale deducts specified batch.
- no batchId uses FEFO fallback.
- cancel restores exact allocation trace.
- COGS uses batch.costPrice.
- completed invoice is not hard-deleted.

## B. FE/API Contract Tests
- Snapshot JSON response before/after for:
  GET /api/customers
  GET /api/combos
  GET /api/stock-adjustments
  GET /api/promotions
  POST /api/sales/quote
  GET /api/pending-orders/{id}
  GET /api/pending-orders/admin or current pending list endpoint
- If new summary endpoint/v2 is introduced, test both old and new endpoint.
- Existing detail endpoint must keep snapshot fields.
- No remove/rename/type-change without FE adapter migration.

## C. Query-count Tests
- customers_100Rows_queryCount_constant
- pendingOrders_adminPage_50Rows_queryCount_constant
- salesQuote_20Lines_queryCount_notLinear
- combos_100Rows_queryCount_constant
- stockAdjustments_50Rows_queryCount_constant
- promotions_50Rows_queryCount_constant if touched
- receipts_page_queryCount_constant if touched

## D. Invariant SQL/Test
Run after money/stock tests:
- ProductVariant.stockQty == SUM(ProductBatch.remainingQty).
- No voided batch with remainingQty > 0 enters sellable/projection/valuation.
- InventoryMovement rows append, not modified/deleted.
- SalesInvoiceItemBatchAllocation rows exist for exact-batch sales.
- StockAdjustment allocation/reversal linkage exists.
- Pending confirm does not duplicate invoice/movement.

============================================================
UPDATE 9: UPDATE RISK REGISTER
============================================================

Bổ sung risk:

### FE contract break at PendingOrder invoice field
- Level: High.
- Regression: admin pending list/detail/payment flow breaks.
- Detection: FE grep + JSON contract tests.
- Mitigation: summary endpoint or includeInvoiceDetails flag.
- Stop: FE list requires full invoice and no adapter migration.

### SalesQuote parity drift
- Level: High.
- Regression: wrong pricing/promotion/voucher/loyalty/shipping/gift totals.
- Detection: golden quote payload tests.
- Mitigation: refactor data access only first; compare payload field-by-field.
- Stop: unexplained pricing/snapshot diff.

### Backend stock invariant break
- Level: Critical.
- Regression: stock truth corrupted.
- Detection: invariant SQL + exact batch/receipt/adjustment tests.
- Mitigation: do not bypass StockMutationService/controlled mutation path.
- Stop: ProductVariant.stockQty != SUM(ProductBatch.remainingQty).

### Snapshot recomputation regression
- Level: Critical.
- Regression: old invoices/pending/profit change after catalog/promotion changes.
- Detection: snapshot tests before/after changing master data.
- Mitigation: preserve persisted snapshot usage.
- Stop: old order/invoice total changes due to current master data.

### Pageable collection fetch causing wrong pagination
- Level: Medium/High.
- Regression: duplicate rows, missing rows, wrong totalElements.
- Detection: SQL logs, query-count test, page content test, Hibernate warnings.
- Mitigation: 2-step ID pagination.
- Stop: Hibernate in-memory pagination warning or duplicate page rows.

### Config-only optimization masking N+1
- Level: Medium.
- Regression: root N+1 remains.
- Detection: query-count still grows with N.
- Mitigation: root repository/service fix first.
- Stop: default_batch_fetch_size is the only performance change.

============================================================
UPDATE 10: UPDATE STOP CONDITIONS
============================================================

Bổ sung stop conditions:

Stop and report immediately if:
- PendingOrder optimization requires removing/changing invoice field on existing endpoint without FE migration.
- FE usage is unknown for changed response fields.
- Existing response shape is not captured before change.
- SalesQuote golden payload changes without confirmed business-truth correction.
- Any stock mutation path is changed without invariant tests.
- Any optimization bypasses StockMutationService/controlled mutation path.
- Any historical quote/pending/invoice/profit is recomputed from current master data.
- Pageable fetch collection causes duplicate page rows or in-memory pagination.
- Query optimization changes money/stock/history semantics.
- Response shape changes but no contract test exists.
- Performance fix requires UI redesign.
- Index migration lock risk is unclear.
- Test evidence is missing but phase is marked done.

============================================================
UPDATE 11: UPDATE FINAL REPORT TEMPLATE
============================================================

Bổ sung vào final report:

## Unified Evidence Pack Result
| Area | BE baseline captured? | FE contract captured? | Query baseline captured? | Go/No-Go |
|---|---|---|---|---|

## Backend Evidence Before/After
| Area | Baseline captured? | DB assertions pass? | Golden response pass? | Query before | Query after | Business invariant pass? |
|---|---|---|---|---:|---:|---|

## Backend Business Invariants
| Invariant | Test/SQL | Result |
|---|---|---|
| ProductVariant.stockQty == SUM(ProductBatch.remainingQty) |  |  |
| InventoryMovement append-only |  |  |
| Pending confirm idempotent |  |  |
| Invoice cancel restores exact batch |  |  |
| Receipt void/delete matrix unchanged |  |  |
| Stock adjustment reversal uses allocation trace |  |  |
| Snapshot not recomputed from current master data |  |  |

## FE Impact Matrix
| Area | Endpoint changed? | JSON field changed? | FE files touched? | Adapter-only? | UI changed? | Risk |
|---|---|---|---|---|---|---|

## API Contract Verification
- Existing endpoints checked:
- Fields removed/renamed:
- Fields added:
- Backward compatible? yes/no:
- FE migration needed? yes/no:
- FE files changed:

## PendingOrder Contract Audit
- FE usages found:
- List usages:
- Detail usages:
- Print/export usages:
- Payment/confirm usages:
- Recommended BE strategy:
- FE adapter changes required:
- UI changes required:

## Quote Golden Parity
| Scenario | Before snapshot captured? | After matches? | Difference accepted? | Notes |
|---|---|---|---|---|

## Query Count Before/After
| Endpoint/Test | Dataset size | Before queries | After queries | Threshold | Pass/Fail |
|---|---:|---:|---:|---:|---|

## DB Migration/Index Verification
- Flyway status:
- EXPLAIN summary:
- Indexes used:
- Lock-time risk checked:
- Rollback/defer note:

## Changed Semantics
- Any intentional behavior change? yes/no
- If yes, business truth rule that justifies it:
- Tests proving new behavior:
- Migration/communication needed:

## Final Verdict
- PASS/FAIL:
- Safe to implement? yes/no:
- Safe to merge? yes/no:
- Safe to release? yes/no:
- Required follow-up:

============================================================
OUTPUT REQUIREMENT
============================================================

- Update plan content only.
- Keep Vietnamese language.
- Keep current findings; do not delete useful existing details.
- Add the new gates/sections in the correct locations.
- Mark Phase 2 PendingOrder as blocked until FE contract audit passes.
- Mark Phase 3 SalesQuote as blocked until golden parity baseline exists.
- Mark stock/mutation-sensitive optimizations as blocked until Backend Evidence Pack exists.
- Make implementation sequencing clearer:
  safe first, risky later.
- Do not implement source code.
- Do not create migrations.
- Do not edit FE.
- Final output should be either:
  1. The updated full plan text, or
  2. A patch summary showing exactly what sections were added/changed.
```
