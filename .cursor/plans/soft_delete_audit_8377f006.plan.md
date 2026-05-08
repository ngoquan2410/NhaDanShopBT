---
name: Soft Delete Audit
overview: Audit and fix unsafe soft-delete/archive/void behavior, then close related admin operational gaps in stock reports, revenue/profit Excel export, catalog image upload, directory CRUD, receipt product suggestions, and session-expiry UX. This plan remains local-only design work until explicitly approved for implementation.
todos:
  - id: phase-1-invoice-policy
    content: Harden SalesInvoice delete/cancel policy without schema changes.
    status: completed
  - id: phase-2-variant-archive
    content: Design/add ProductVariant archive semantics and preserve references.
    status: completed
  - id: phase-3-customer-supplier-archive
    content: Add Customer/Supplier archive semantics and preserve historical records.
    status: completed
  - id: phase-4-voucher-promotion-archive
    content: Add Voucher/Promotion archive semantics and preserve snapshots.
    status: completed
  - id: phase-5-combo-archive
    content: Add Combo archive semantics and preserve invoice combo snapshots.
    status: completed
  - id: phase-6-adjustment-reverse
    content: Add explicit stock adjustment reversal policy.
    status: completed
  - id: phase-7-receipt-void
    content: Add receipt void status and reverse movement flow.
    status: completed
  - id: phase-8-batch-status
    content: Introduce batch status only with unified sellable-stock predicates.
    status: completed
  - id: phase-9-stock-archive-guards
    content: Add shared stocked-entity delete/archive guards for Product, ProductVariant, and Combo.
    status: completed
  - id: phase-10-reporting-ui-gaps
    content: Fix inventory valuation display and backend Excel export integration for inventory/revenue/profit reports.
    status: completed
  - id: phase-11-catalog-admin-ux
    content: Fix product table action menu overflow and product/variant image upload API flow.
    status: completed
  - id: phase-12-directory-crud
    content: Verify and fix supplier/customer create, update, deactivate, delete/archive CRUD integration.
    status: completed
  - id: phase-13-receipt-autocomplete
    content: Add receipt-line product/variant autocomplete by product name, product code, and variant code.
    status: completed
  - id: phase-14-auth-expiry-modal
    content: Replace raw expired-session toast/redirect flows with admin and storefront login modal UX.
    status: completed
isProject: false
---

# Global Soft Delete / Void Policy Audit

## Files Inspected
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/SalesInvoiceController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/SalesInvoiceController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/entity/SalesInvoice.java`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/SalesInvoice.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryReceiptController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryReceiptController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductBatch.java`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductBatch.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductBatchService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductBatchService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/entity/Product.java`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/Product.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductVariant.java`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductVariant.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/PaymentEventController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/PaymentEventController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/PaymentEventService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/PaymentEventService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/repository/PaymentEventRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/PaymentEventRepository.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/StockAdjustmentController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/StockAdjustmentController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)
- [`NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql`](NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql), [`V5__invoice_batch_allocations.sql`](NhaDanShop/src/main/resources/db/migration/V5__invoice_batch_allocations.sql), [`V7__stock_adjustment_source_batch.sql`](NhaDanShop/src/main/resources/db/migration/V7__stock_adjustment_source_batch.sql), [`V11__payment_events.sql`](NhaDanShop/src/main/resources/db/migration/V11__payment_events.sql), [`V14__inventory_movements_batch_fk_on_delete_set_null.sql`](NhaDanShop/src/main/resources/db/migration/V14__inventory_movements_batch_fk_on_delete_set_null.sql)
- FE references: [`nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendPaymentEventAdapter.ts`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendPaymentEventAdapter.ts), [`nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx), [`nha-dan-pos-c091ee5b/src/services/index.ts`](nha-dan-pos-c091ee5b/src/services/index.ts)
- Report/API references: [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/ReportController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ReportController.java), [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/RevenueController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/RevenueController.java), [`NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryStockService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryStockService.java), [`nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx), [`nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx), [`nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx), [`nha-dan-pos-c091ee5b/src/services/adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts)
- Catalog/directory/auth references: [`nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx), [`nha-dan-pos-c091ee5b/src/pages/admin/ProductDetail.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProductDetail.tsx), [`nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendProductAdapter.ts`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendProductAdapter.ts), [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/ImageUploadController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ImageUploadController.java), [`nha-dan-pos-c091ee5b/src/pages/admin/Suppliers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Suppliers.tsx), [`nha-dan-pos-c091ee5b/src/pages/admin/Customers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Customers.tsx), [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/SupplierController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/SupplierController.java), [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/CustomerController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/CustomerController.java), [`nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx), [`nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx`](nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx), [`nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts`](nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts), [`nha-dan-pos-c091ee5b/src/components/layout/AdminAuthGuard.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminAuthGuard.tsx)

## Updated Implementation Scope
- Kết luận hiện tại: chưa đúng hết. Lỗ hổng rõ nhất là delete/archive sản phẩm, phân loại, và combo chỉ dựa trên “đã từng được dùng chưa”, chưa chặn khi còn tồn vật lý, batch còn hàng, hoặc hàng còn hạn bán được.
- Giữ nguyên nguyên tắc kế toán/kho: nghiệp vụ đã phát sinh không xóa vật lý nếu ảnh hưởng lịch sử; dùng cancel, void, hoặc reverse để tạo bút toán hoàn tồn đúng batch.
- Scope mới bổ sung các lỗi vận hành admin đang thấy trong ảnh: báo cáo tồn kho thiếu giá trị, export Excel lợi nhuận/doanh thu chưa gọi API, menu sản phẩm bị cắt, upload ảnh sai luồng, CRUD nhà cung cấp/khách hàng chưa save ổn định, phiếu nhập thiếu gợi ý sản phẩm/variant, và UX hết phiên cần modal đăng nhập.
- Test full backend chưa verify được nếu Gradle vẫn bị Windows khóa `build/test-results/test/binary/output.bin`; cần chạy lại sau khi dừng process Java cũ.

## Required Soft Delete / Stock Rules
- Thêm guard dùng chung cho `Product`, `ProductVariant`, và `Combo` trước khi delete/archive hoặc set `active=false`.
- Nếu còn `remainingQty > 0` ở bất kỳ batch nào: chặn thao tác, trả lỗi nghiệp vụ rõ ràng.
- Nếu còn hàng bán được: chặn với lý do “còn tồn, còn hạn, đang bán”.
- Nếu chỉ còn hàng hết hạn hoặc blocked: vẫn chặn, yêu cầu xử lý bằng kiểm kê điều chỉnh, void, hoặc tiêu hủy trước.
- Chỉ khi tồn vật lý bằng 0 mới cho archive nếu đã có lịch sử, hoặc hard delete nếu hoàn toàn chưa dùng.
- HTTP nên là `409 Conflict` qua `GlobalExceptionHandler` cho `IllegalStateException`; message cần có `productCode` hoặc `variantCode`, tồn vật lý, tồn bán được, và số batch còn hàng.

## Combo Virtual Stock Rule
- Tính virtual sellable stock từ batch bán được của component default variant: batch `active`, còn hạn, product/variant active, variant sellable.
- Không dùng đơn thuần `variant.stockQty` vì field này là tồn vật lý, có thể bao gồm hàng hết hạn hoặc blocked.
- Combo delete/archive phải bị chặn khi virtual sellable stock > 0 hoặc component còn tồn vật lý cần xử lý.

## Files / Entities To Audit Later
- Customer: entity, service, controller, repository, DTOs, invoice/pending-order references, returns/reporting/loyalty/CRM references if present, and FE customer services/adapters/pages/selection controls.
- Supplier: entity, service, controller, repository, DTOs, inventory receipt references, purchase/debt/payment/reporting references if present, and FE supplier services/adapters/pages/selection controls.
- Voucher: entity, service, controller, repository, DTOs, pending-order/invoice usage, voucher snapshots, applicability logic, reports, and FE voucher services/adapters/pages/selection controls.
- Promotion / khuyến mãi: entity, service, controller, repository, DTOs, pending-order/invoice usage, gift/discount application, `promotionSnapshot` / `giftLinesSnapshot`, reports, and FE promotion services/adapters/pages/selection controls.
- Combo: entity, service, controller, repository, DTOs, invoice line combo fields, product/variant composition references, combo refresh behavior, and FE combo services/adapters/pages/selection controls.
- For each added entity, audit whether current behavior hard-deletes, soft-deletes, only deactivates, or lacks delete/archive behavior; identify references/snapshots and default list/search filters before implementation.

## Current Behavior By Entity
- SalesInvoice: `DELETE /api/invoices/{id}` hard-deletes same-day non-cancelled invoices after restoring stock. `PATCH /api/invoices/{id}/cancel` keeps the invoice row, sets `CANCELLED`, restores stock, and appends `invoice_cancel` movements when allocation rows exist. Reports generally filter `COMPLETED`, so cancelled invoices are excluded while deleted invoices disappear entirely. Completed same-day invoices can currently be hard-deleted.
- InventoryReceipt: `DELETE /api/receipts/{id}` hard-deletes the receipt and its batches only when every batch has `remainingQty == importQty`. It appends `goods_receipt_delete` movements before deleting batches. API exposes `status="confirmed"`, `canDelete`, and `deleteBlockReason="downstream_consumption"`.
- ProductBatch: no standalone delete API found. Hard-delete occurs through receipt delete. `inventory_movements.batch_id` is now `ON DELETE SET NULL`, but invoice allocation rows and stock adjustment source batch rows still block physical batch deletes.
- Product: delete is already soft: `ProductService.softDelete` sets `active=false`. Product code remains unique and reserved after deactivation.
- ProductVariant: delete is hard with guards. It blocks only-default-variant deletion and deletion when batches exist. There is an implied deactivate path in error text, but no clear variant `active` request/update surface.
- PaymentEvent: no delete API found. Ignore/unignore is effectively the current archive flow through `status=IGNORED`. Linked events point at pending orders; webhook replay may still relink an ignored row if matching logic runs.
- StockAdjustment: create starts as `DRAFT`; confirm mutates batch stock and creates positive batches when needed. Delete is allowed only for `DRAFT`; confirmed adjustments cannot be deleted. No first-class reverse/void flow exists.
- Customer: planned audit target. Determine whether current delete hard-deletes, soft-deletes, or only deactivates; identify invoice, pending-order, return, report, loyalty, and CRM references; verify whether customer list/search filters archived records.
- Supplier: planned audit target. Determine whether current delete hard-deletes, soft-deletes, or only deactivates; identify inventory receipt, purchase history, debt/payment, and report references; verify whether supplier list/search filters archived records.
- Voucher: planned audit target. Determine whether vouchers can be hard-deleted, deactivated, expired, or archived; identify pending-order/invoice usage and snapshot references; verify applicability filters and reporting behavior.
- Promotion / khuyến mãi: planned audit target. Determine whether promotions can be hard-deleted, deactivated, expired, or archived; identify pending-order/invoice/gift/discount usage and snapshot references; verify applicability filters and reporting behavior.
- Combo: planned audit target. Determine whether combos can be hard-deleted, deactivated, or archived; identify sold invoice line references and combo snapshot fields; verify whether sale selection excludes inactive records.

## Risk Analysis For Soft Delete Changes
- SalesInvoice: replacing hard delete with cancel/void improves ledger continuity, but must preserve current stock restore behavior, `invoice_cancel` movement semantics, reports filtering `COMPLETED`, and idempotency scopes. Policy should also close the auth gap where cancel is less restricted than delete if not intentional.
- InventoryReceipt: replacing hard delete with void/cancel is high impact because receipt delete currently physically removes batches. Voiding must not leave positive-quantity voided batches sellable through FEFO, projection, or stock sync queries.
- ProductBatch: adding `status=VOIDED` without query changes is dangerous. Current FEFO, active batch, expiry, and `sumRemainingQtyByVariantId` queries rely on `remainingQty > 0`, so a voided positive-qty batch would still be considered stock unless quantities are zeroed or every query filters status.
- Product/ProductVariant: product soft delete is already safe but code reuse remains blocked. Variant hard delete is riskier because variants anchor batches, invoices, receipts, adjustments, and pending-order lines. A variant archive flag is safer than delete but requires list/search/product detail filtering decisions.
- ProductVariant with remaining stock: archiving/deactivating a stocked variant is business-sensitive because stock remains real inventory. Archive must not remove stock, mutate batches, delete movements, or break FEFO/projection; if the business meaning of “archived but stocked” is ambiguous, implementation must pause and ask before allowing it.
- PaymentEvent: archive is mostly already represented by `IGNORED`; adding another archive state risks confusion unless it is clearly an alias or separate display flag. Need to preserve payment-event link semantics and not alter manual payment behavior.
- StockAdjustment: confirmed adjustments are historical inventory events. Deleting or mutating them would make stock audit trails ambiguous. A reverse adjustment is safer than changing confirmed records, but should not be introduced until movement/ledger policy for adjustments is defined.
- Customer/Supplier: archive is lower inventory risk than batch/receipt voiding, but list/search and transaction selection must be consistent. Historical invoices, pending orders, receipts, and reports must keep displaying snapshots or stored names even if the master record is archived.
- Voucher/Promotion: archive must be separated from historical applicability. New orders must not apply archived records, while existing `voucherSnapshot`, `promotionSnapshot`, and `giftLinesSnapshot` remain immutable and reportable.
- Combo: archive must remove combos from new sale selection without changing historical invoice lines. If invoice lines store `comboSourceId`, `comboSourceCode`, and `comboSourceName`, those fields must remain visible even when the combo master is archived.

## Recommended Target Policy
- SalesInvoice: no hard delete for `COMPLETED`; use `CANCELLED` for operational cancellation and optionally add `VOIDED` only if finance needs a distinct audit label. Keep restore stock and append reverse movements. Hard delete allowed only for true drafts if drafts are ever added.
- InventoryReceipt: stop hard-deleting confirmed receipts that created batches. Add receipt `status` such as `CONFIRMED`, `VOIDED` or `CANCELLED`; void should preserve receipt header/items, append reverse `InventoryMovement` rows, and ensure affected stock cannot remain sellable incorrectly. If void uses the “set `remainingQty = 0` through controlled reversal” approach, it must use the existing `StockMutationService` / stock mutation path, sync `ProductVariant.stockQty` immediately, update inventory projection consistently, run in the same transaction as receipt status/audit update, and preserve batch invariants. Do not fake void by hard-deleting batches or by directly mutating `product_batches.remainingQty` in ad hoc code/SQL.
- ProductBatch: no hard delete once created. Add `status` such as `ACTIVE`, `VOIDED`, `DEPLETED` only if the implementation also updates FEFO/projection/report filters. Prefer voiding by reducing `remainingQty` to zero through a controlled reversal and retaining original `importQty` for audit.
- Product: keep `active=false` archive behavior. Hard delete only for products never referenced by variants/transactions, if needed for cleanup.
- ProductVariant: add archive/deactivate policy. Hard delete only if never used and has no batches, invoice lines, receipt lines, pending order lines, adjustments, or movements. Archiving a variant with remaining stock must not remove inventory or alter existing `ProductBatch`, `InventoryMovement`, invoice item, receipt item, pending-order snapshot, or stock-adjustment references. If archived variants should be unsellable, sale-selection/search endpoints must exclude them while historical invoice, receipt, and batch views still display archived variant identity. `ProductVariant.stockQty`, inventory projection, and FEFO must remain correct after archive.
- PaymentEvent: no delete. Keep `IGNORED` as archive-like state, or add `archivedAt/archivedBy` only for UI hiding while preserving link data.
- StockAdjustment: delete only `DRAFT`; confirmed adjustments should be voided by creating an explicit reverse adjustment or future movement pair, not by deleting or editing the original.
- Customer: soft delete/archive, not hard delete if referenced by invoices, pending orders, returns, reports, loyalty, or CRM history. Default customer list/search should hide archived customers; historical invoice and pending-order records must still show customer snapshot/data. Consider `active=false` or `archivedAt` / `archivedBy` / `archiveReason`.
- Supplier: soft delete/archive, not hard delete if referenced by inventory receipts, purchase history, debt/payment records, or reports. Default supplier list/search should hide archived suppliers; historical receipt records must still show supplier snapshot/data. Consider `active=false` or `archivedAt` / `archivedBy` / `archiveReason`.
- Voucher: deactivate/archive, not hard delete if ever used in pending orders, invoices, or snapshots. Archived vouchers must not apply to new orders; historical `voucherSnapshot` data remains unchanged and used vouchers remain reportable. Consider status `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- Promotion / khuyến mãi: deactivate/archive, not hard delete if ever used in pending orders, invoices, gifts, discounts, or `promotionSnapshot`. Archived promotions must not apply to new orders; historical `promotionSnapshot` and `giftLinesSnapshot` remain unchanged. Consider status `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- Combo: archive/deactivate, not hard delete if ever sold or referenced by invoice line combo fields. Archived combos must not be selectable for new sale; historical `comboSourceId`, `comboSourceCode`, and `comboSourceName` remain visible. Consider `active=false` or status `ACTIVE`, `ARCHIVED`.

## Proposed Status Fields / Columns
- `inventory_receipts.status`: additive enum/string default `CONFIRMED`; candidate values `CONFIRMED`, `VOIDED`.
- `inventory_receipts.voided_at`, `voided_by`, `void_reason`: additive audit fields.
- `product_batches.status`: additive default `ACTIVE`; candidate values `ACTIVE`, `VOIDED`. Consider `DEPLETED` as derived from `remainingQty=0`, not necessarily stored initially.
- `product_batches.voided_at`, `voided_by`, `void_reason`: optional audit fields if batch void is exposed directly.
- `product_variants.active`: additive default true, if not already present in the live schema/entity. Pair with `archived_at`, `archived_by` only if UI/audit needs it.
- `payment_events.archived_at` is optional and lower priority; `IGNORED` may already be enough.
- `stock_adjustments.status`: extend only if needed, e.g. keep `DRAFT`, `CONFIRMED`; add `VOIDED` only if reverse policy is implemented. Prefer `reversal_of_adjustment_id` or `voided_by_adjustment_id` for traceability.
- `customers.active` or `customers.archived_at`, `archived_by`, `archive_reason`: additive only; default current rows to active/unarchived.
- `suppliers.active` or `suppliers.archived_at`, `archived_by`, `archive_reason`: additive only; default current rows to active/unarchived.
- `vouchers.status` or `vouchers.active` plus optional `archived_at`: additive only; candidate statuses `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- `promotions.status` or `promotions.active` plus optional `archived_at`: additive only; candidate statuses `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- `combos.active` or `combos.status` plus optional `archived_at`: additive only; candidate statuses `ACTIVE`, `ARCHIVED`.

## Proposed API Changes
- SalesInvoice: change `DELETE /api/invoices/{id}` to reject completed invoices with a clear message pointing to `PATCH /cancel`, or keep delete only for future drafts. Consider admin-only authorization for cancel if policy requires parity with delete.
- InventoryReceipt: add `PATCH /api/receipts/{id}/void` or `/cancel`; leave `DELETE` as compatibility endpoint that rejects confirmed receipts once void exists. Do not implement draft/confirm lifecycle in this audit scope.
- ProductBatch: avoid public hard delete. Add `PATCH /api/batches/{id}/void` only after batch status query filters are ready.
- Product/ProductVariant: expose `archive/deactivate` endpoints or extend existing delete semantics to mean archive for variants. Keep hard delete behind strict “never used” validation if retained.
- PaymentEvent: keep ignore/unignore. If needed, add display-only archive as a separate endpoint that does not affect matching/linking.
- StockAdjustment: keep draft delete. Add future `POST /api/stock-adjustments/{id}/reverse` or create a new adjustment with `reversalOfId`.
- Customer: future `PATCH /api/customers/{id}/archive` or make `DELETE /api/customers/{id}` mean archive. Exact endpoint choice must be audited before implementation.
- Supplier: future `PATCH /api/suppliers/{id}/archive` or make `DELETE /api/suppliers/{id}` mean archive. Exact endpoint choice must be audited before implementation.
- Voucher: future `PATCH /api/vouchers/{id}/archive` or deactivate endpoint. Exact endpoint choice must be audited before implementation.
- Promotion / khuyến mãi: future `PATCH /api/promotions/{id}/archive` or deactivate endpoint. Exact endpoint choice must be audited before implementation.
- Combo: future `PATCH /api/combos/{id}/archive` or deactivate endpoint. Exact endpoint choice must be audited before implementation.

## Minimal FE Impact
- Surface status badges and disabled delete actions only where the UI already has delete/status controls.
- For receipts, reuse existing `status`, `canDelete`, and `deleteBlockReason`; update text to “downstream consumption”.
- For invoices, prefer “Cancel/Void” wording over “Delete” for completed invoices.
- For products/variants/batches, default lists should hide archived/voided records, with optional “include archived” later.
- Payment events should keep ignore/unignore UX; do not introduce invoice creation or pending-order behavior changes.
- Stock adjustments should keep delete only for draft and later show reverse/void for confirmed if backend exists.
- Hide archived customers, suppliers, vouchers, promotions, and combos from new transaction selection by default.
- Keep historical invoice, receipt, pending-order, voucher, promotion, gift, and combo snapshot views readable even when master records are archived.
- Add only minimal UI labels/status badges and disabled actions where existing screens already show status/delete controls.
- Consider optional `includeArchived` filters later for admin/audit views; avoid broad UI redesign during policy rollout.

## Additional Admin/API Issues To Fix
- Inventory stock report value is not useful in the `Giá trị` column even though [`InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx) reads `closingValue` from [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts) and backend exposes `/api/reports/inventory`. Verify [`InventoryStockService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryStockService.java) returns non-zero `closingValue` based on remaining batch cost and that frontend maps the exact field names from [`InventoryStockReportRow`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryStockReportRow.java).
- Inventory report export button currently has no handler in [`InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx). Wire it to `GET /api/reports/inventory/export?from=&to=` and download `.xlsx` with admin auth.
- Revenue report export in [`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx) currently only shows `toast.success("Đã xuất báo cáo Excel")`. Wire it to `GET /api/revenue/total/export?from=&to=&period=` and decide whether product-filtered export is in-scope; backend export endpoints currently do not accept `productIds`.
- Profit report export in [`ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx) currently only shows a toast. Wire it to `GET /api/reports/profit/export?from=&to=` and decide whether product-filtered export is in-scope; backend profit export currently does not accept `productIds`.
- Product table action menu in [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx) is rendered inside a table wrapper with `overflow-hidden`, so the `...` menu can be clipped. Move to a shared portal/dropdown pattern or change the container/menu positioning so it stays visible above the table without breaking rounded borders and pagination.
- Product/variant image upload in [`ProductDetail.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProductDetail.tsx) converts the file to a base64 data URL and sends it as `imageUrl`, which violates backend `@Size(max = 500)` on [`ProductPatchRequest`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/ProductPatchRequest.java) and [`ProductVariantPatchRequest`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/ProductVariantPatchRequest.java). Use [`ImageUploadController`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ImageUploadController.java) `POST /api/images/upload` first, then persist the returned short public `url` through product or variant patch.
- Supplier/customer drawers already delegate to `adminSuppliers.save` and `adminCustomers.save`, and backend has CRUD endpoints. Verify request/response shape, `active`/archive behavior, validation messages, refresh after save, and both add/edit/deactivate/delete paths in [`Suppliers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Suppliers.tsx), [`Customers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Customers.tsx), [`SupplierController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/SupplierController.java), and [`CustomerController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/CustomerController.java).
- Receipt create manual line search in [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx) currently adds a new manual line from free text; it does not suggest existing products/variants by product name, product code, or variant code. Add an autocomplete backed by the loaded catalog so selecting a suggestion fills product code, variant code, name, category, units, conversion, sell price, and default shelf-life fields.
- Admin expired-session handling is currently fragmented between [`adminApi.ts`](nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts), [`admin-auth.tsx`](nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx), [`AdminAuthGuard.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminAuthGuard.tsx), and page-local redirects such as [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx). Replace raw toasts/redirects with a modal that says the session expired and has a “Đăng nhập” button preserving `next`.
- Storefront user expired-session UX should follow the same modal pattern using the shared auth state in [`admin-auth.tsx`](nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx), but route non-admin users back to `/login?next=<current>` and never into `/admin/**`.

## Public/API Behavior
- Product, variant, and combo delete/archive/toggle inactive endpoints return `409 Conflict` when any physical stock remains. The error message must mention the SKU/code, physical remaining stock, sellable stock, and number of batches blocking the action.
- Inventory, revenue, and profit report export buttons should download backend `.xlsx` files and surface backend validation/auth errors through the same admin error UI/toast style.
- Product/variant image upload should send multipart files to `/api/images/upload`; `imageUrl` fields should store only the returned URL or a manually entered URL under 500 characters.
- Customer and supplier `DELETE` continues to mean deactivate/archive, not hard delete, when referenced by historical transactions.
- Receipt product suggestions must not create a new product if the selected product/variant already exists; saving should still use numeric backend `productId` and `variantId`.
- Expired session modal clears stale session state and offers a single login action. Admin users return to the admin page after login if authorized; storefront users return to the storefront page/account flow.

## Migration Strategy
- Additive only: add nullable/defaulted status and audit columns without dropping data or changing existing FK behavior initially.
- Backfill: set existing invoices to current statuses; receipts to `CONFIRMED`; batches to `ACTIVE`; product variants to `active=true`; payment ignored rows remain `IGNORED`; confirmed stock adjustments remain `CONFIRMED`.
- Backfill customers/suppliers/combos to active/unarchived and vouchers/promotions to their current active/inactive equivalent. Preserve all existing snapshots and transaction references.
- Indexes/filters: add indexes for status/active columns used by list, FEFO, projection, and search paths, for example `(variant_id, status, remaining_qty, expiry_date)` on batches if status is added.
- Rollout order: add schema and read-side filters first, then write-side void/cancel endpoints, then FE affordances.
- No destructive migration: do not delete historical rows, do not null transaction references, do not rewrite inventory movement history.

## Query / Filter Impact
- List endpoints: default exclude `VOIDED`/archived where appropriate, but provide explicit include/status filters for audit views.
- Reports: continue filtering invoice revenue on `COMPLETED`; ensure voided receipts/batches do not inflate inventory valuation or inbound purchase reports unless explicitly included as audit rows.
- FEFO: must exclude voided/deactivated batches or ensure voided batches always have `remainingQty=0` before status is introduced.
- Inventory projection: `findActiveBatchesByVariantId`, `sumRemainingQtyByVariantId`, expiring/expired-with-stock, valuation, and cost queries must align on the same sellable batch predicate.
- Search: product and variant search should default to active records; archived records need explicit include flags to avoid accidental reuse or hidden duplicates.
- ProductVariant archive: sale-selection/search endpoints must exclude archived variants if the approved policy makes archived variants unsellable. Inventory projection and `ProductVariant.stockQty` must continue to count remaining stock correctly unless a separately approved stock-removal/reversal flow changes quantities.
- Receipt void: affected batches must become non-sellable by one explicitly designed approach: set `remainingQty` to `0` through controlled reversal and sync `ProductVariant.stockQty`/projection, or introduce `ProductBatch.status=VOIDED` only after sellable-stock predicates are unified across FEFO, inventory projection, `ProductVariant.stockQty` sync, batch list/search, expiry, valuation, and report queries. The controlled-reversal approach must append reverse `InventoryMovement` rows, use `StockMutationService` / the stock mutation path rather than raw field updates, run in the same transaction as receipt status/audit update, and preserve receipt header/items for audit. Never leave a voided batch with `remainingQty > 0` while still included in FEFO/projection.
- New order/customer selection must exclude archived customers by default, while historical invoices and pending orders continue to display customer snapshot/data.
- Supplier selection for new receipts must exclude archived suppliers by default, while historical receipts continue to display supplier snapshot/data.
- Voucher and promotion applicability engines must exclude archived/inactive records from new orders, while reports continue to use immutable snapshots for historical orders.
- Combo sale selection must exclude archived combos by default, while invoice history continues to display stored combo source fields.
- Reports must keep historical snapshot data and should not silently drop old orders/receipts just because a master record is archived.

## Recommended Implementation Phases
1. Invoice hard-delete hardening — already implemented / first: reject hard delete for completed invoices and steer to cancel; preserve invoice stock restore, `invoice_cancel` movements, pending-order, and payment-event behavior.
2. ProductVariant archive: add `active` read/write support and change variant delete semantics to archive when used; keep hard delete only for never-used variants. Explicitly decide how stocked archived variants behave before implementation: archive must not remove stock or alter batch quantities, and can only affect new-sale selection if that policy is approved.
3. Customer/Supplier archive: add archive semantics and list/search filters for selection/history entities with lower inventory risk than batches.
4. Voucher/Promotion archive: remove archived/inactive records from applicability engines while preserving `voucherSnapshot`, `promotionSnapshot`, and `giftLinesSnapshot`.
5. Combo archive: hide archived combos from new sale selection while preserving historical invoice combo source fields.
6. StockAdjustment reversal: add explicit reverse adjustment flow and, if desired, inventory movement records for adjustments.
7. Receipt void design: add receipt status/audit columns and `void` endpoint after movement/reversal policy is stable. The design must preserve receipt/items, append reverse movements, and guarantee voided receipt stock cannot remain sellable through FEFO/projection. If the design uses `remainingQty = 0`, it must be implemented as a controlled stock reversal through `StockMutationService` in the same transaction as receipt void status/audit, not as direct DB or entity field mutation.
8. ProductBatch status policy: add batch status only with unified sellable-stock predicate across FEFO, projection, stock sync, expiry, valuation, and search queries.
9. Product/ProductVariant/Combo stocked archive guards: add one shared backend stock eligibility check used by delete, archive, and active-toggle write paths. Include physical stock, sellable stock, and batch count in the error.
10. Combo virtual stock correction: update backend combo stock calculation to use the unified sellable-batch predicate for component default variants instead of raw `variant.stockQty`.
11. Report/export UI fix: fix inventory report `closingValue` mapping/source if backend is returning `0`, then add authenticated binary download helpers and wire inventory, revenue, and profit export buttons to backend APIs.
12. Product admin UI fix: make the `...` menu visible outside the clipped table area and keep row action behavior unchanged.
13. Image upload integration: add a frontend image upload helper for `/api/images/upload`, use returned `url` for product/variant patch, and show a clear R2-not-configured/manual-URL fallback.
14. Supplier/customer CRUD verification: test and fix create/update/deactivate/delete/archive flows, including validation, refresh, active status display, and historical soft-delete expectations.
15. Receipt-line autocomplete: reuse backend catalog data in receipt create, add suggestions by product name, product code, and variant code, and fill canonical existing SKU data on selection.
16. Expired-session modal: centralize admin/storefront auth-expiry event handling and replace page-local expired-session toasts with modal + login button preserving `next`.
17. FE cleanup: minimal labels, status badges, disabled delete buttons, and include-archived filters after backend APIs are stable.

Customer/Supplier/Voucher/Promotion/Combo policies are mostly selection/history rules and carry lower inventory risk than `ProductBatch.status`. ProductBatch status remains late because it touches FEFO, projection, stock sync, inventory valuation, and search. Receipt void remains after invoice, variant, archive, and adjustment/reversal policy is stable.

## What NOT To Implement First
- Do not add `ProductBatch.status` alone without updating FEFO/projection/stock-sync predicates.
- Do not implement receipt draft/confirm lifecycle as part of this policy.
- Do not fake receipt void by deleting batches without preserving header/item audit data.
- Do not change pending-order confirm, payment-event linking, manual payment behavior, invoice FEFO deduction, invoice cancel restore, or append-only inventory movements.
- Do not reintroduce product-level stock as canonical truth.
- Do not implement ProductBatch status before the sellable-batch predicate is unified across FEFO, projection, stock sync, expiry, valuation, and search.
- Do not archive a stocked ProductVariant in a way that removes stock, alters batch quantities, breaks FEFO, or changes inventory projection. If the business meaning is unclear, pause and ask before allowing archive.
- Do not leave a voided receipt batch with `remainingQty > 0` while it is still included in FEFO, projection, `ProductVariant.stockQty` sync, batch list/search, expiry, valuation, or report queries.
- Do not implement receipt void by directly setting `product_batches.remainingQty` in ad hoc code or SQL. Receipt void must be a controlled stock reversal through the existing stock mutation path; if that cannot be done safely without bypassing batch invariants, pause and ask before proceeding.
- Do not implement receipt void before invoice, variant, archive, and reversal policies are stable.
- Do not hard-delete customer, supplier, voucher, promotion, or combo records if referenced by transactions, snapshots, reports, or history.
- Do not remove, rewrite, or hide historical snapshots such as customer/supplier names, `voucherSnapshot`, `promotionSnapshot`, `giftLinesSnapshot`, or invoice combo source fields.
- Do not work around image upload by increasing `imageUrl` to store base64 blobs. Store files through `/api/images/upload` or store a short external/manual URL.
- Do not fake report export with a success toast or client-side mock file. Use backend export endpoints and real blob downloads.
- Do not make receipt autocomplete create duplicate products/variants when the existing catalog has a match by product code, variant code, or selected suggestion.
- Do not redirect users away immediately on auth expiry without explaining the session expired and offering a login action.

## Acceptance Checklist
- Completed invoices cannot be hard-deleted; cancellation/void preserves stock restoration and movement history.
- Receipt void preserves receipt and item audit data and appends reverse movements without breaking projections.
- Voided/deactivated batches cannot be sold through FEFO and do not inflate `ProductVariant.stockQty` projection.
- Product/ProductVariant archive preserves transaction references and blocks unsafe SKU/code reuse according to explicit policy.
- Product/ProductVariant/Combo archive/delete/active-toggle is blocked whenever physical batch stock remains, including expired or blocked stock.
- Product/ProductVariant/Combo archive/delete error messages include code, physical stock, sellable stock, and blocking batch count, and map to `409 Conflict`.
- Combo virtual sellable stock is computed from active, unexpired, sellable component batches and not from raw `variant.stockQty`.
- Archiving a stocked ProductVariant does not remove stock, does not alter batch quantities, and does not break inventory projection or `ProductVariant.stockQty`; it only affects new-sale selection if explicitly approved.
- Voided receipt stock cannot be selected by FEFO and cannot inflate inventory projection or `ProductVariant.stockQty`.
- If receipt void uses the `remainingQty = 0` reversal approach, it appends reverse `InventoryMovement` rows, uses `StockMutationService` / the stock mutation path, syncs `ProductVariant.stockQty` immediately, updates projection consistently, runs in the same transaction as receipt status/audit update, preserves receipt header/items, and does not bypass batch invariants.
- PaymentEvent ignore/archive does not create invoices and does not alter pending-order link semantics.
- Confirmed stock adjustments are reversed through explicit reversal, not hard-deleted.
- Archived customers, suppliers, vouchers, promotions, and combos are not selectable for new transactions by default.
- Historical invoices, receipts, pending orders, voucher/promotional snapshots, gift snapshots, and invoice combo fields remain readable.
- Reports remain correct and continue to rely on historical snapshots where appropriate.
- Inventory report `Giá trị` column and total valuation display real backend values for stocked batches.
- Inventory, revenue, and profit “Xuất Excel” buttons download real backend `.xlsx` files with current date filters.
- Product table `...` action menu is not clipped by the table container.
- Product and variant image upload persists a returned URL from `/api/images/upload` and no longer sends base64 into `imageUrl`.
- Supplier and customer add/edit/deactivate/delete/archive flows save to backend and reload the list with clear errors on validation/auth failures.
- Receipt create suggests products/variants by name, product code, and variant code; selecting a suggestion fills canonical product/variant fields.
- Admin and storefront expired sessions show a modal with a login button and preserve the intended return URL.
- Referenced customer, supplier, voucher, promotion, and combo business entities are not hard-deleted.
- All schema changes are additive, backfilled, indexed where needed, and non-destructive.
- Existing Slice 1A/1B/2/3/4 behavior remains intact.

## Recommended First Implementation Prompt
“Local-only. Implement the next approved slice from `soft_delete_audit_8377f006.plan.md`: add shared Product/ProductVariant/Combo stocked archive/delete guards, fix combo virtual sellable stock from active unexpired sellable component batches, then address report/export/image/directory/receipt-autocomplete/auth-expiry UI gaps in the listed order. Preserve historical records, use cancel/void/reverse instead of hard delete for posted business documents, add focused backend/FE tests, and run `.\gradlew.bat test --no-daemon` after clearing locked Java processes plus frontend build/tests for touched UI.”

Audit complete. No code changes made.