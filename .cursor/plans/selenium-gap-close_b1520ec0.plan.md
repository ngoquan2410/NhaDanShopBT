---
name: selenium-gap-close
overview: Audit các plan đã attach so với Selenium hiện tại và chuẩn bị một plan bổ sung để đóng các gap happy path + non-happy path cho các chức năng chưa được browser automation cover đầy đủ.
todos:
  - id: matrix-scenario-audit
    content: Expand regression coverage matrix into scenario-level rows for every attached-plan function, including Selenium/API/BE status, skip/blocker reason, and locked-business-logic assertion required.
    status: completed
  - id: fixture-assertion-helpers
    content: Add deterministic Selenium fixture/assertion helpers for E2E-prefixed catalog, batches, receipts, adjustments, invoices, pending orders, promotions/vouchers, production, projections, allocations, and file downloads.
    status: completed
  - id: receipt-batch-truth-selenium
    content: Add goods receipt UI coverage for create/list/detail/batch label BATCH:{batchId}/void/delete-blocked/duplicate paths with batch remaining, variant projection, and movement invariants.
    status: completed
  - id: stock-adjustment-reverse-selenium
    content: Add stock adjustment UI coverage for DRAFT create, confirm positive/negative, sourceBatch exact deduction, reverse, duplicate reverse, missing trace, insufficient exact-batch, and created-batch-consumed rejection.
    status: completed
  - id: expiry-status-sellable-selenium
    content: Add Selenium coverage for HSD correction workflow, expired/blocked/unsellable/OOS sale rejections, FEFO storefront deduction, POS exact-batch scan, and onHand/available/sellableQty separation.
    status: completed
  - id: sales-commercial-selenium
    content: Add POS/storefront/pending/invoice Selenium assertions for voucher, promotion, manual discount, shipping, VAT, reward/free lines, COGS, revenue/profit snapshots, and cancel/confirm batch restoration.
    status: completed
  - id: soft-delete-archive-selenium
    content: Add Selenium coverage for invoice/product/variant/combo/customer/supplier/voucher/promotion archive/delete/cancel guards, selection filtering, historical snapshot visibility, and no silent stock mutation.
    status: completed
  - id: production-selenium
    content: Add Selenium/API-crosschecked production coverage for completed-on-create order, raw batch allocation, output batch qty/expiry/cost, void exact restore, and downstream-consumed output void rejection.
    status: completed
  - id: reports-inventory-selenium
    content: Add inventory/revenue/profit Selenium coverage for closingQty/closingValue, dashboard low/expiry/pending cards, VAT exclusion, cancelled exclusion, combo COGS, and Excel export downloads.
    status: completed
  - id: admin-ops-functional-selenium
    content: Upgrade catalog CRUD, product category dropdown, image upload, action menu, customer/supplier drawers, promotions/vouchers, settings, users/security, and expired-session modal from smoke/API-only to functional UI coverage.
    status: completed
  - id: final-regression-report
    content: Run critical-watchlist, admin-ops, and full Selenium scopes plus build/backend gates; update coverage matrix and final report with commands, exit codes, pass/fail/skip, artifacts, blockers, and residual risks.
    status: completed
isProject: false
---

# Selenium Gap-Close Coverage Plan

## Audit Verdict

Selenium hiện tại **chưa cover hết tất cả function** trong các plan attach. Lần chạy full regression trong [`docs/test-reports/full-selenium-regression-report.md`](docs/test-reports/full-selenium-regression-report.md) pass 19 spec, nhưng [`docs/regression-coverage-matrix.md`](docs/regression-coverage-matrix.md) vẫn có nhiều dòng `partial`, `skipped`, hoặc chỉ có API/BE coverage.

Các plan backend như receipt void, stock adjustment reverse, batch status/sellable predicate, batch expiry correction, commercial pricing, shipping, reporting đã có nhiều MockMvc/service/script coverage. Phần thiếu là **browser automation đúng nghĩa**: Selenium phải thao tác UI, thấy trạng thái người dùng thấy, và cross-check API/state sau thao tác.

## Scope

### In Scope

- Selenium E2E trong [`nha-dan-pos-c091ee5b/automation/selenium`](nha-dan-pos-c091ee5b/automation/selenium), chạy với backend thật qua `BASE_URL` / `API_BASE_URL`.
- Scenario-level traceability cho các plan:
  - [`full-selenium-regression_51407f0a.plan.md`](.cursor/plans/full-selenium-regression_51407f0a.plan.md)
  - [`stock_adjustment_reversal_1a1e86d1.plan.md`](.cursor/plans/stock_adjustment_reversal_1a1e86d1.plan.md)
  - [`docs/backend-integration-pack.md`](docs/backend-integration-pack.md)
  - [`receipt_void_phase_5866d91b.plan.md`](.cursor/plans/receipt_void_phase_5866d91b.plan.md)
  - [`soft_delete_audit_8377f006.plan.md`](.cursor/plans/soft_delete_audit_8377f006.plan.md)
  - [`batch_status_audit_2ab04464.plan.md`](.cursor/plans/batch_status_audit_2ab04464.plan.md)
  - [`batch_expiry_correction_593080f0.plan.md`](.cursor/plans/batch_expiry_correction_593080f0.plan.md)
- Functional UI coverage for admin inventory, POS/invoice, soft-delete/archive, reports, catalog, directory, commercial settings, auth/session expiry.
- Deterministic fixtures created via public/admin APIs or existing test helpers, with isolated prefixes and cleanup where possible.
- Updating [`docs/regression-coverage-matrix.md`](docs/regression-coverage-matrix.md) and [`docs/test-reports/full-selenium-regression-report.md`](docs/test-reports/full-selenium-regression-report.md).

### Out Of Scope

- Pixel-perfect visual regression.
- Real production third-party calls to GHN, Goong, Casso, VietQR, R2. These must use sandbox/stub or be skipped with explicit reason.
- Changing business rules to make tests pass. If automation exposes unclear policy, mark blocker and stop that scenario.
- Direct DB mutation from Selenium tests, except existing local-only verification scripts if already documented. Prefer backend APIs.
- Treating page-load smoke as full function coverage.
- Using local/mock adapters as proof for backend-integrated functions.

## Coverage Rules

- `covered` means Selenium drives the UI path relevant to that function and asserts visible outcome plus API/state invariant when the function mutates data.
- `partial` means Selenium only loads the page, checks a shell, depends on optional env/data, or covers only happy path without required negative cases.
- `skipped` must include a concrete reason, for example `third-party sandbox unavailable`, `no FE affordance exists`, or `API-only invariant`.
- `blocker` means product rule, bug, or missing UI affordance prevents valid automation.
- API/BE tests can support Selenium, but do not replace Selenium for user-facing admin/storefront functions.
- Every critical mutation must have both a UI assertion and a backend assertion via `ctx.api`.

## Locked Business Logic

Các logic dưới đây là **ràng buộc bất biến** cho automation. Selenium/API assertions phải chứng minh hệ thống giữ đúng các logic này; không được đổi rule để test pass.

### Hạn Sử Dụng / Batch Expiry

- `expiryDate` là thuộc tính nhận diện lô nhập, không được sửa lịch sử khi batch đã có outbound allocation hoặc từng bán rồi hủy.
- Batch hết hạn không được bán qua POS/storefront/FEFO, dù vẫn còn tồn vật lý.
- `expired` là date predicate, không phải status persisted.
- Correction đúng nghiệp vụ: điều chỉnh trừ phần còn lại của batch sai HSD bằng `sourceBatchId`, sau đó nhập lại batch mới với HSD đúng.
- Done gate: test phải chứng minh batch đã bán/cancelled không sửa HSD trực tiếp được; batch hết hạn bị chặn bán; correction không rewrite invoice allocation cũ.

### Số Lượng Nhập Và Tồn Batch

- `ProductBatch.remainingQty` là stock truth.
- `ProductVariant.stockQty` chỉ là projection tương thích và phải luôn bằng tổng `remainingQty` của các batch current/system theo rule hiện hành.
- Product-level stock không được dùng làm tồn truth.
- Receipt create là confirmed-on-create: tạo receipt, batch, stock mutation, movement trong một transaction.
- Receipt void chỉ zero phần `remainingQty` hiện tại của đúng receipt-owned batches; phần đã consume không bị đoán lại.
- Done gate: sau receipt/void/sale/cancel/adjustment/production, test phải assert batch remaining, variant stock projection, và inventory projection không lệch.

### Giá Nhập, VAT, Ship, Chiết Khấu Và Cost Allocation

- Giá vốn/COGS của invoice line phải lấy từ batch allocation thực tế, không tính lại bằng giá hiện tại của product/variant.
- Với invoice discount/promotion/voucher, merchandise discount được phân bổ xuống eligible paid item lines theo `lineNetBeforeInvoiceDiscount = unitPrice * quantity`, không phân bổ theo số lượng hoặc profit.
- VAT merchandise dùng `vatBase = sum(lineNetRevenue)`, `vatAmount = floor(vatBase * vatPercent / 100)`, VAT không tính vào revenue/profit.
- Shipping fee/discount/net revenue là invoice-level bucket; free-shipping promotion/voucher chỉ ảnh hưởng shipping bucket và cap tại shipping fee.
- `shippingActualCost` chưa có settlement source thì không được tự giả lập vào profit.
- Done gate: test POS/storefront/Pending/Invoice phải so sánh UI totals với backend quote/invoice snapshot: gross, own discount, allocated discount, voucher, promotion, shipping fee/discount/net, VAT, total, COGS, gross profit.

### POS Batch Scan

- Canonical batch barcode payload là `BATCH:{batchId}`.
- POS scan batch phải tạo cart line có `batchId`; cùng batch merge theo `batchId`, khác batch cùng variant phải là line riêng.
- Invoice line có `batchId` phải trừ đúng batch đó, không FEFO.
- Backend phải revalidate batch/product/variant identity, active/sellable state, status `active`, not expired, đủ `remainingQty`.
- Done gate: test phải scan exact batch, tạo invoice, assert allocation row trỏ đúng batch và chỉ batch đó giảm tồn; mismatch/OOS/expired/blocked phải fail.

### Storefront / Non-Batch FEFO

- Storefront và invoice lines không có `batchId` dùng FEFO sellable predicate: batch `active`, còn hạn, product active, variant active, `isSellable=true`, đủ remaining.
- FEFO không được dùng cho reverse/void/cancel lịch sử.
- Done gate: test storefront checkout phải chứng minh lô hết hạn/blocked/unsellable không bị bán; sale hợp lệ trừ batch FEFO đúng thứ tự.

### Hủy Hóa Đơn / Hủy Pending

- Invoice cancel phải hoàn đúng batch theo `SalesInvoiceItemBatchAllocation`, không dùng current FEFO.
- Exact-batch sale cancel restore đúng exact batch; no-batch FEFO sale cancel restore theo allocation trace đã lưu.
- Pending order confirm là authority duy nhất tạo invoice từ pending.
- Pending confirm duplicate phải trả cùng invoice hoặc idempotent result, không tạo invoice/movement thứ hai.
- Pending cancel không được tạo invoice và không được mutate stock ngoài rule đã duyệt.
- Done gate: test phải assert batch remaining trước/sau cancel, invoice status, movement/allocation không duplicate, revenue/profit loại cancelled invoice.

### POS Invoice Commercial Truth

- POS tạo hóa đơn thật phải đi qua backend quote/invoice khi có admin JWT; local/demo invoice chỉ được dùng khi explicit test/demo env.
- Voucher, promotion, manual discount, shipping fee/discount, VAT, reward/free item phải lấy từ backend quote/invoice snapshot.
- Reward/free item có revenue 0 nhưng vẫn có stock/COGS nếu là product/variant thật.
- Done gate: test POS invoice phải assert printed/in-app receipt totals khớp backend invoice response và report basis.

### Kiểm Kho / Điều Chỉnh Tồn

- StockAdjustment DRAFT không mutate stock.
- Confirm tính `diff = actualQty - systemQty` từ snapshot.
- Negative có `sourceBatchId` phải trừ đúng batch đó.
- Negative không có `sourceBatchId` dùng current-adjustable predicate: remaining > 0, status active/blocked, không filter expiry, không yêu cầu sellable.
- Explicit source batch negative cho phép active/blocked kể cả expired; reject voided/depleted/archived.
- Reverse dùng allocation trace exact inverse; không re-run FEFO, không mượn batch khác, không dùng tổng variant stock làm bằng chứng.
- Positive adjustment tạo batch mới; reverse positive chỉ được khi full created batch quantity còn nguyên, không partial reverse.
- Done gate: test phải assert exact batch delta, trace, reverse metadata, projection invariant, duplicate reverse reject, insufficient exact-batch reject.

### Soft Delete / Archive / Void

- Nghiệp vụ đã phát sinh không hard-delete nếu ảnh hưởng lịch sử; dùng cancel, void, reverse, archive.
- Completed invoice không hard-delete; dùng cancel/void policy đã duyệt.
- Product/variant/combo/customer/supplier/voucher/promotion archived không được dùng cho giao dịch mới nhưng lịch sử/snapshot vẫn đọc được.
- Stocked product/variant/combo không được archive/delete nếu policy yêu cầu xử lý tồn trước; không được archive bằng cách âm thầm mutate batch.
- Vouchers/promotions archived/inactive không được apply cho order mới; invoice cũ vẫn giữ snapshot.
- Done gate: test phải cover block message, selection filtering, historical detail visibility, and no stock mutation on archive.

### Sản Xuất / Production

- Production order completed-on-create; không có draft lifecycle trong scope hiện tại.
- Production consumes exact raw material batch allocations and creates real finished product batch.
- Raw input eligibility: active batch, remaining > 0, not expired, product active, variant active; raw variant không cần `isSellable=true`.
- Output batch expiry default là min expiry của consumed component batches.
- Output batch cost = `(actual weighted consumed allocation cost + overheadCost) / outputQty`.
- Production void là all-or-nothing: chỉ được nếu output batch chưa bị downstream consume; restore exact raw allocations; zero/void output batch; không partial void, không guessing.
- Production không phải combo; combo là virtual commercial bundle.
- Done gate: test phải assert raw batch deltas, output batch qty/expiry/cost, projection, void restore exact raw batches, downstream-consumed output void reject, and combo stock unaffected except through shared components.

### Doanh Thu / Lợi Nhuận

- Revenue/profit reports chỉ tính invoice hợp lệ theo status/report rule, loại cancelled/voided.
- Product/category revenue/profit dùng allocated net item revenue/profit: revenue = sum `lineNetRevenue`, COGS = sum `lineCOGS`, profit = revenue - COGS.
- VAT excluded from revenue/profit.
- Shipping bucket không phân bổ vào product/category revenue/profit nếu chưa có approved settlement/reporting rule.
- Combo COGS phải tính từ component allocation.
- Done gate: seeded paid/cancelled/discount/combo/VAT/shipping scenarios phải cho UI report totals khớp backend report values.

### Tồn Kho / Inventory Reporting

- Inventory stock report là current/system physical stock based on batch/movement truth, không phải sale-sellable capacity trừ khi field explicitly là `sellableQty`.
- `onHand` là physical/current; `available` giữ semantics hiện tại; `sellableQty` additive cho sale capacity.
- Vô hiệu hóa/voided/expired/blocked phải không làm sai valuation hoặc dashboard counts.
- `closingValue` phải dựa trên remaining batch cost và không hiển thị vô nghĩa khi có seed cost.
- Done gate: test phải assert inventory report rows, closing quantity/value, expiry/low-stock/dashboard cards, and projection fields không bị conflated.

## Guardlist

- Do not mark a scenario `covered` just because the route opened or an API returned 200.
- Do not rely only on toast text for stock, invoice, receipt, adjustment, or archive invariants.
- Do not seed shared mutable data without a unique `E2E-` prefix and a cleanup/idempotency strategy.
- Do not let scenarios depend on execution order unless the setup dependency is explicit.
- Do not use production secrets or production third-party endpoints.
- Do not add sleeps where a deterministic wait for URL, DOM, network-visible state, or API state is possible.
- Do not hide failures with broad retries. Retry only UI wait/network timing, never business assertions.
- Do not leave created inventory in a misleading state if teardown is available through cancel, void, reverse, or archive.
- Do not validate stock using only `ProductVariant.stockQty` when the plan requires batch truth.
- Do not use current FEFO to approximate historical reversal/void behavior; exact-batch and trace-based flows must assert exact batch IDs.
- Do not change frontend/backend business behavior inside this Selenium gap-close unless a blocker bug is explicitly split into its own implementation plan.
- Do not simplify financial assertions to only grand total; line-level revenue, COGS, VAT, shipping, voucher, promotion, and discount buckets must be checked where the function touches those calculations.
- Do not treat `stockQty`, `onHand`, `available`, and `sellableQty` as interchangeable fields.
- Do not test production as if it were combo, receipt, or stock adjustment; production has its own allocation and void rules.

## Current Coverage Map

- Receipt void: Selenium file [`watchlist-receipts-adjustments.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/watchlist-receipts-adjustments.spec.mjs) is API-heavy: creates/voids via API, then opens goods-receipts page. UI create/detail/void/delete-negative are not fully covered.
- Stock adjustment: [`admin-ops-inventory.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-inventory.spec.mjs) loads pages and create shell only. Confirm/reverse/sourceBatch/negative cases are BE/API covered, not Selenium UI covered.
- Batch status/sellable: BE/script coverage is strong in [`batch_status_audit_2ab04464.plan.md`](.cursor/plans/batch_status_audit_2ab04464.plan.md), but Selenium only partially covers POS/dashboard/inventory surfaces.
- Soft delete/archive: [`soft_delete_audit_8377f006.plan.md`](.cursor/plans/soft_delete_audit_8377f006.plan.md) spans many entities. Current Selenium does not cover archive/delete guard matrix deeply.
- Catalog/commercial/directory/settings: current specs are mostly smoke/API list checks: [`admin-ops-catalog.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-catalog.spec.mjs), [`admin-ops-commercial.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-commercial.spec.mjs), [`admin-ops-directory.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-directory.spec.mjs), [`admin-ops-settings.spec.mjs`](nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-settings.spec.mjs).

## Target Spec Layout

- `admin-inventory-receipt-ui.spec.mjs`: goods receipt UI create/list/detail/label/void/delete-block.
- `admin-inventory-stock-adjustment-ui.spec.mjs`: adjustment UI create/confirm/reverse/sourceBatch/rejection.
- `admin-inventory-batch-expiry-status.spec.mjs`: batch expiry correction operator workflow, blocked/expired/sellable UI behavior.
- `admin-soft-delete-archive-ui.spec.mjs`: product/variant/combo/customer/supplier/voucher/promotion archive/delete guards.
- `admin-catalog-crud-ui.spec.mjs`: categories, product create category dropdown, product/variant edit, image upload, action menu.
- `admin-directory-commercial-ui.spec.mjs`: customers, suppliers, promotions, vouchers functional CRUD/archive.
- `admin-reports-export-ui.spec.mjs`: inventory/revenue/profit values and Excel downloads.
- `admin-settings-security-ui.spec.mjs`: store/shipping settings, users/security access, expired-session modal.
- Existing POS/invoice specs remain but gain missing negative cases where feasible.

## Scenario Matrix

### P0 Inventory Truth

#### Goods Receipt Create

- Happy path: open `/admin/goods-receipts/create`, select or create supplier, choose existing product/variant through autocomplete, set quantity/cost/expiry override, submit.
- Assertions: list contains receipt, detail drawer shows supplier/items/status, API receipt exists, batch created with expected `remainingQty`, projection increases by exact quantity.
- Acceptance: Selenium covers UI form, not API-only create; matrix row moves from `partial` to `covered`.

#### Goods Receipt Labels

- Happy path: after receipt create, open print labels.
- Assertions: label encodes canonical `BATCH:{batchId}`, human batch code/product/variant/expiry visible.
- Non-happy: if receipt response cannot expose batch IDs, scenario is `blocker`, not `covered`.
- Acceptance: no fake variant-code barcode accepted.

#### Goods Receipt Void

- Happy path: create unconsumed receipt, click void from UI, enter reason if UI supports it, confirm.
- Assertions: receipt status `voided`, `canDelete=false`, `deleteBlockReason=voided`, projection returns near baseline, `goods_receipt_void` effect is not duplicated on idempotent replay.
- Non-happy: duplicate void with new/no idempotency key rejects; voided delete rejects visibly; partially consumed delete rejects; fully consumed void is metadata-only with no stock change.
- Acceptance: UI and API state both checked.

#### Stock Adjustment Confirm

- Happy path source batch: create DRAFT negative adjustment with `sourceBatchId`, confirm from UI.
- Assertions: target batch decreases exactly, other batches unchanged, variant stock equals sum of batches.
- Happy path positive: create positive adjustment, confirm, assert created adjustment batch and projection increase.
- Non-happy: stale system quantity, invalid source batch, insufficient target batch, explicit source batch rejected for voided/depleted/archived statuses where fixture/API permits.
- Acceptance: no test uses total variant stock as proof of exact-batch correctness.

#### Stock Adjustment Reverse

- Happy path: reverse a confirmed adjustment from UI.
- Assertions: original remains confirmed with reversal metadata, reversal adjustment readable, projection returns to pre-adjustment value.
- Non-happy: duplicate reverse rejected; target that is itself a reversal rejected; positive created batch partially consumed then reverse rejected; missing trace legacy negative rejected if fixture can be created safely.
- Acceptance: exact allocation trace or deterministic fallback behavior verified; no FEFO guessing.

#### Batch Expiry Correction

- Happy path: wrong-expiry batch with remaining stock is drained through targeted stock adjustment, then re-imported through receipt with corrected expiry.
- Assertions: historical invoice allocation remains unchanged; old batch remaining decreases only by targeted amount; new batch has corrected expiry; POS/FEFO sells corrected sellable batch.
- Non-happy: direct expiry edit blocked for batch with outbound allocation or cancelled invoice allocation if FE has an edit affordance; otherwise mark API-only with reason.
- Acceptance: operator workflow in [`batch_expiry_correction_593080f0.plan.md`](.cursor/plans/batch_expiry_correction_593080f0.plan.md) is represented in Selenium or explicitly scoped API-only for missing UI.

#### Batch Status / Sellable Predicate

- Happy path: POS sells active, non-expired, sellable batch.
- Non-happy: blocked batch, expired batch, inactive product/variant, unsellable variant, and OOS show cashier-facing failure and do not create invoice.
- Inventory UI: inventory report/projection shows current physical stock semantics while POS sellability follows active/non-expired predicate.
- Acceptance: `onHand`, `available`, `sellableQty`, and batch truth are not conflated.

### P0 Sales / Invoice / Pending

#### POS Invoice

- Happy path: scan/select variant, quantity 2, backend quote, invoice create, receipt snapshot, batch allocation/projection decrease.
- Non-happy: qty 0 validation, OOS rejection, inactive/unsellable variant rejection, non-admin cannot create invoice, duplicate idempotent invoice create does not double-deduct.
- Exact-batch: scan `BATCH:{batchId}`, preserve separate cart lines per batch, invoice item carries `batchId`.
- Acceptance: visible UI result plus API invoice allocation check.

#### Invoice Lifecycle

- Happy path: open invoice list/detail, filter/search, cancel completed invoice through UI.
- Non-happy: duplicate cancel rejected, delete completed rejected or hidden, cancelled invoice excluded from revenue/profit totals, unauthorized role denied.
- Acceptance: invoice row/history remains readable after cancel.

#### Pending To Invoice

- Happy path: storefront/guest quote creates pending order, admin confirms in UI, invoice appears.
- Non-happy: duplicate confirm returns same invoice/no duplicate movement, cancel pending updates count/list, stale/invalid pending confirm shows error.
- Acceptance: topbar/sidebar/page pending counts match API before and after confirm/cancel.

### P1 Soft Delete / Archive

#### Product / Variant / Combo

- Happy path: zero-stock referenced product/variant/combo archives/deactivates and disappears from new sale selection.
- Non-happy: stocked product/variant/combo archive/delete blocked with visible 409 message including code, physical stock, sellable stock, batch count.
- Historical visibility: old invoice/receipt/detail still shows product/variant/combo snapshot.
- Acceptance: no archive path mutates batch quantities.

#### Customer / Supplier

- Happy path: create, edit, deactivate/archive, list refreshes, default selection hides archived records.
- Historical visibility: invoice retains customer snapshot; receipt retains supplier snapshot.
- Non-happy: validation errors, duplicate/invalid phone or required fields, referenced record is archived not hard-deleted.
- Acceptance: new POS/receipt cannot select archived master records by default.

#### Voucher / Promotion

- Happy path: create active voucher/promotion, evaluate/apply through POS or storefront quote, archive/deactivate.
- Non-happy: archived/inactive voucher/promotion does not apply to new quote; invalid rules rejected; free-shipping cannot combine with percent/fixed if UI enforces it.
- Historical visibility: old invoice/pending snapshot remains readable.
- Acceptance: backend quote remains source of truth, not local store.

### P1 Catalog / Reports / Admin Ops

#### Catalog CRUD

- Category create then product create: category dropdown must load real backend category and selection must persist.
- Product/variant edit: save changes and verify via list/detail/API.
- Product image upload: use `/api/images/upload` and returned short URL; if R2/config unavailable, skip with reason and test manual URL fallback if supported.
- Product action menu: open row action menu at table edge and assert it is visible/not clipped.
- Acceptance: blocker-product-category-dropdown remains closed by Selenium regression.

#### Reports / Export

- Inventory report: seeded batch cost produces non-zero `closingValue`; UI displays expected value.
- Revenue/profit reports: seeded paid/cancelled/discount/combo data matches backend summary and excludes cancelled/voided.
- Excel export: inventory/revenue/profit buttons download `.xlsx` with authenticated backend response; auth/validation error surfaces visibly.
- Acceptance: smoke page load is not enough; value and download behavior must be asserted.

#### Settings / Users / Security / Session

- Store settings: edit/save/reload persists.
- Shipping settings: edit zones/defaults, quote uses saved settings, fallback works when carrier unconfigured.
- Users/security: admin can view, non-admin gets 403/redirect/modal as designed.
- Expired session: forced expired token triggers modal with login action preserving `next` for admin and storefront.
- GHN/Goong: page loads and stub/fallback path covered; real third-party skipped with reason.
- Acceptance: no production key dependency.

### P2 Storefront / Account

- Storefront browse/product/cart/checkout/pending-payment runs against backend quote with deterministic stocked SKU.
- Auth signup/login/logout/forgot/reset cover validation and success paths.
- Account/profile/orders/loyalty uses non-admin customer env or deterministic created test user; if env missing, full scope reports explicit skip.
- Non-admin `/admin` access redirects to `/account` or approved path.
- Acceptance: `full` run should not silently pass by skipping core storefront flows without a recorded reason.

## Implementation Phases

### Phase 1: Traceability And Fixtures

- Expand [`docs/regression-coverage-matrix.md`](docs/regression-coverage-matrix.md) into scenario-level rows for all functions above.
- Add shared fixture helpers for category/product/variant/batch/receipt/adjustment/pending/invoice/customer/supplier/voucher/promotion with `E2E-` prefix.
- Add assertion helpers for projection, batch remaining, invoice allocation, receipt status, adjustment reversal metadata, and downloaded file checks.
- Acceptance: current gaps are visible before adding tests; no row falsely says `covered`.

### Phase 2: P0 Inventory And Sales

- Implement receipt UI, adjustment UI, batch expiry/status, POS invoice, invoice lifecycle, pending-to-invoice scenarios.
- Acceptance: `AUTOMATION_SCOPE=critical-watchlist` passes with no unplanned skips; all P0 matrix rows covered or explicitly blocker.

### Phase 3: P1 Archive / Admin Ops

- Implement product/variant/combo/customer/supplier/voucher/promotion archive/delete scenarios.
- Implement catalog CRUD, report exports, settings/security/session scenarios.
- Acceptance: `AUTOMATION_SCOPE=admin-ops` passes with only approved third-party/config skips.

### Phase 4: Full Regression Hardening

- Run full suite repeatedly enough to catch ordering/flakiness.
- Update report with commands, environment, pass/fail/skip, artifacts, known residual risk.
- Acceptance: `AUTOMATION_SCOPE=full npm run test:automation -- --run` exits 0 locally; CI smoke remains green.

## Definition Of Done

- [`docs/regression-coverage-matrix.md`](docs/regression-coverage-matrix.md) lists every function from attached plans with scenario-level Selenium status.
- Every P0 function is either Selenium `covered` or has a documented `blocker` approved for follow-up.
- Every Selenium mutation scenario has API/state cross-check, not only UI text.
- Every locked business logic section above has at least one automated assertion path, or an explicit `API-only` / `blocker` row with reason.
- Inventory done means exact batch truth is asserted: receipt, sale, cancel, void, adjustment, reverse, and production cannot rely only on aggregate stock.
- Financial done means backend quote/invoice/report snapshots are reconciled with UI for VAT, shipping, voucher, promotion, discount, COGS, revenue, and profit.
- Archive/delete done means new selection is blocked/hidden while historical snapshots remain readable and stock quantities are not silently mutated.
- Production done means completed-on-create, raw allocation, output batch, cost/expiry, and void restore/reject paths are tested without reusing combo assumptions.
- Full regression report includes exact command lines, exit codes, pass/fail/skip counts, skipped reasons, environment, and artifact paths.
- No unapproved third-party production dependency is required.
- No business rule was changed as part of test implementation unless separately planned and approved.
- New tests are deterministic on a clean local DB with documented credentials/env.
- Existing `smoke`, `admin-ops`, `critical-watchlist`, and `full` scopes still work.

## Verification Commands

- Frontend:
  - `cd nha-dan-pos-c091ee5b`
  - `npm run build`
  - `npm test` or the repo's current Vitest command
- Backend:
  - `cd NhaDanShop`
  - `./gradlew.bat compileJava test --no-daemon`
- Selenium:
  - `RUN_AUTOMATION=1 AUTOMATION_SCOPE=critical-watchlist npm run test:automation -- --run`
  - `RUN_AUTOMATION=1 AUTOMATION_SCOPE=admin-ops npm run test:automation -- --run`
  - `RUN_AUTOMATION=1 AUTOMATION_SCOPE=full npm run test:automation -- --run`

## Stop Conditions

- A required UI control does not exist for a planned browser scenario.
- A scenario requires production third-party credentials.
- A fixture cannot be created through supported local/admin APIs without corrupting inventory truth.
- A test failure reveals ambiguous product policy rather than implementation bug.
- Backend/API state contradicts visible UI and the source of truth is unclear.