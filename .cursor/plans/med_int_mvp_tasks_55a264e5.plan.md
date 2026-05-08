---
name: med_int_mvp_tasks
overview: Create small, one-agent executable tasks for MED-001..006 and INT-001..003 only, ordered from safest to riskiest with strict file scope and minimal change constraints.
todos:
  - id: int-002-invoice-error-parser
    content: "[INT-002] FE error parser utility (invoices)"
    status: completed
  - id: int-002-receipts-error-parser
    content: "[INT-002] FE error parser adoption (receipts)"
    status: completed
  - id: int-001-receipt-date-payload-builder
    content: "[INT-001] FE normalize receipt date payload builder"
    status: completed
  - id: int-001-remove-page-date-formatting
    content: "[INT-001] FE remove ad-hoc date formatting in page layer"
    status: completed
  - id: int-003-product-list-params
    content: "[INT-003] FE server-driven product list params"
    status: in_progress
  - id: med-002-invoice-business-clock
    content: "[MED-002] Inject business clock into invoice timestamps"
    status: completed
  - id: med-002-excel-import-business-clock
    content: "[MED-002] Inject business clock into Excel import service"
    status: completed
  - id: med-004-fefo-expiry-comparator
    content: "[MED-004] Align FEFO expiry comparator with policy"
    status: completed
  - id: med-005-search-index-migration
    content: "[MED-005] Add minimal index migration for text search"
    status: completed
  - id: med-003-invoice-list-read-amplification
    content: "[MED-003] Reduce invoice list read amplification"
    status: completed
  - id: med-001-adjustment-stale-snapshot-guard
    content: "[MED-001] Add stale snapshot guard at adjustment confirm"
    status: completed
  - id: med-006-adjustment-lock-order-guard
    content: "[MED-006] Enforce lock-order comment + guard in adjustment confirm"
    status: completed
isProject: false
---

# MED/INT MVP Task List (Safest -> Riskier)

### Task 1
Task Name:
INT-002 FE error parser utility (invoices)

Scope:
INT-002

Files:
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/utils/apiError.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/utils/apiError.js)
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useInvoices.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useInvoices.js)

Change:
- Add one shared `extractApiErrorMessage(error)` helper that resolves `detail -> message -> error -> fallback`.
- Replace ad-hoc invoice hook error parsing with this helper only.

Constraints:
- Do not modify backend error schema.
- Do not touch stock/invoice business logic; UI message mapping only.

### Task 2
Task Name:
INT-002 FE error parser adoption (receipts)

Scope:
INT-002

Files:
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useReceipts.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useReceipts.js)
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/utils/apiError.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/utils/apiError.js)

Change:
- Reuse the same `extractApiErrorMessage` helper in receipt hook paths.
- Keep existing toast flow, only normalize message extraction.

Constraints:
- No changes to API endpoints or payloads.
- No inventory/stock logic changes.

### Task 3
Task Name:
INT-001 FE normalize receipt date payload builder

Scope:
INT-001

Files:
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/receiptService.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/receiptService.js)

Change:
- Add a small mapper that sends date-only fields in one consistent format (no mixed `T00:00:00` patching at call sites).
- Ensure `null/empty` date fields stay `null` instead of default-now mutation in client.

Constraints:
- Do not change API URLs or response mapping.
- No backend changes in this task.

### Task 4
Task Name:
INT-001 FE remove ad-hoc date formatting in page layer

Scope:
INT-001

Files:
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/ReceiptsPage.jsx](c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/ReceiptsPage.jsx)

Change:
- Remove local `date + T00:00:00` shaping and delegate to `receiptService` payload builder.
- Keep form validation behavior unchanged.

Constraints:
- No backend contract changes.
- Do not modify receipt stock mutation behavior.

### Task 5
Task Name:
INT-003 FE server-driven product list params

Scope:
INT-003

Files:
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/productService.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/productService.js)
- [c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useProducts.js](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useProducts.js)

Change:
- Add optional query params (`page`, `size`, `keyword`, `sort`) to product fetch calls.
- Stop mandatory full-fetch + heavy client filtering when params are present.

Constraints:
- Do not redesign product page UI state model.
- No stock/batch logic changes.

### Task 6
Task Name:
MED-002 Inject business clock into invoice timestamps

Scope:
MED-002

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)

Change:
- Inject `Clock` and replace `LocalDateTime.now()` / `LocalDate.now()` usages with `LocalDateTime.now(clock)` / `LocalDate.now(clock)` where business-time checks occur (create/delete/cancel guards).

Constraints:
- Do not change invoice status transitions.
- Do not change FEFO, allocation, or stock restore algorithms.

### Task 7
Task Name:
MED-002 Inject business clock into Excel import service

Scope:
MED-002

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)

Change:
- Inject `Clock` and replace raw date/time reads with clock-based calls for import-day and default-date logic.

Constraints:
- Do not alter import stock mutation entry point.
- No locking or transaction behavior changes in this task.

### Task 8
Task Name:
MED-004 Align FEFO expiry comparator with policy

Scope:
MED-004

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)

Change:
- Update sellable-batch query comparator from strict `>` to policy-approved boundary (`>=`) if business decides “sell on expiry date”.
- Keep comparator consistent across FEFO query variants in this repository.

Constraints:
- Do not modify deduction logic in services.
- No changes to stock quantity calculations.

### Task 9
Task Name:
MED-005 Add minimal index migration for text search

Scope:
MED-005

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/resources/db/migration/V8__search_indexes.sql](c:/Work/NhaDanShopBT/NhaDanShop/src/main/resources/db/migration/V8__search_indexes.sql)

Change:
- Add functional indexes matching existing lower/unaccent-like search predicates for customer/supplier/product-variant hot columns.
- Keep migration idempotent-safe for existing environments.

Constraints:
- No repository query rewrite in this task.
- No changes to stock/invoice tables.

### Task 10
Task Name:
MED-003 Reduce invoice list read amplification

Scope:
MED-003

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java)
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)

Change:
- Add one list query with explicit fetch plan/entity graph for fields required by invoice list DTO.
- Wire `listInvoices(...)` to this query to reduce lazy traversal spikes.

Constraints:
- No DTO contract changes.
- Do not touch create/cancel/delete stock mutation flows.

### Task 11
Task Name:
MED-001 Add stale snapshot guard at adjustment confirm

Scope:
MED-001

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)

Change:
- Before applying each line in `confirm`, compare current locked `variant.stockQty` with `item.systemQty` snapshot.
- If mismatch, fail fast with clear stale-draft message requiring recount/recreate.

Constraints:
- Do not change batch deduction math.
- Do not add integration tests in this task.

### Task 12
Task Name:
MED-006 Enforce lock-order comment + guard in adjustment confirm

Scope:
MED-006

Files:
- [c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)

Change:
- Add explicit deterministic lock-order rule in code (variant lock first, then source batch lock list sorted by id).
- Apply minimal sort/guard where source batch locking happens to keep behavior deterministic under concurrency.

Constraints:
- No transaction boundary changes.
- Do not alter inventory arithmetic or FEFO selection rules.
- No cross-service refactor.