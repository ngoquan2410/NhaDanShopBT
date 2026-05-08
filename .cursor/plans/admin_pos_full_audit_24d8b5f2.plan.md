---
name: Admin POS full audit
overview: Audit production risks for Admin POS across frontend and backend, focusing on inventory consistency, concurrency, business logic correctness, integration mismatch, timezone, and performance. Output is prioritized issues with minimal fix approach (no refactor/code rewrite).
todos: []
isProject: false
---

# Full System Audit - Admin POS

## Top Critical Issues (Production-break risks)

### CRIT-001 — Stock integrity can be broken by direct manual stock overwrite
- **Description:** `variant.stockQty` can be updated directly without reconciling `batch.remainingQty`.
- **Root cause:** Multiple write paths update stock summary independently from batch-layer stock.
- **Impact:** Persistent mismatch between summary stock and lot stock; downstream FEFO/reports become unreliable.
- **Suggested fix (no code):**
  - Remove all direct writes to `variant.stockQty` and route stock mutations through one entry point `updateStockWithBatches(variantId, changes)`.
  - In this entry point: lock variant + related batches (`FOR UPDATE`), mutate only `batch.remainingQty`, then recalculate `variant.stockQty = sum(batch.remainingQty)`.
  - Add mandatory invariant guard after every stock transaction: if mismatch then throw and write audit.
  - Replace all `Math.max(0, ...)` stock clamps with fail-fast validation (no silent correction).
  - Apply consistently across receipt, sale, cancel, adjustment, import flows.
- **Status:** IN_PROGRESS
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java)

### CRIT-002 — Cancel/delete invoice restore is not batch-traceable
- **Description:** Restore logic uses cost/fallback targeting, not exact deducted batch map.
- **Root cause:** No immutable movement ledger (`invoice_item -> batch_id -> deducted_qty`).
- **Impact:** Batch drift over time, FEFO/expiry distortion even when total stock seems correct.
- **Suggested fix (no code):** Persist batch allocation at sell time; restore exactly from stored allocations.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)

### CRIT-003 — Receipt deletion has race window
- **Description:** “Has sold?” check and batch delete are not protected as one locked sequence.
- **Root cause:** Missing lock continuity around check-delete rollback flow.
- **Impact:** Concurrent sales can pass between steps, causing invalid rollback/delete behavior.
- **Suggested fix (no code):** Use consistent row locking for all involved batch/variant rows across full transaction.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)

### CRIT-004 — Excel receipt import still has lost-update risk
- **Description:** Concurrent imports can overwrite stock increments.
- **Root cause:** Non-locking read-modify-write (`findById + save`) in import flow.
- **Impact:** Silent stock under/over-count in production under parallel operations.
- **Suggested fix (no code):** Force all stock increments through locking entry point (`for update` + deterministic update).
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)

### CRIT-005 — Revenue consistency risk across modules
- **Description:** Revenue paths can diverge (gross vs net logic) and produce inconsistent business numbers.
- **Root cause:** Not all reporting paths apply one canonical “valid invoice status + net formula” rule.
- **Impact:** Revenue/profit dashboards can disagree; financial decisions become unsafe.
- **Suggested fix (no code):** Standardize canonical formula and mandatory status filter (`COMPLETED`) across all report endpoints.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java)

### CRIT-006 — Missing centralized invariant guard after stock mutations
- **Description:** Stock can drift because no centralized check validates `stockQty == sum(batch.remainingQty)` after receipt/sale/cancel/adjust.
- **Root cause:** Inventory invariant not enforced as mandatory post-condition.
- **Impact:** Drift accumulates and only appears late in audits/reports.
- **Suggested fix (no code):** Add mandatory invariant verification + audit logging after every mutation transaction.
- **Status:** TODO

### CRIT-007 — Clamp logic (`Math.max(0, ...)`) can hide real data corruption
- **Description:** Negative results are clamped instead of failing fast.
- **Root cause:** Defensive clamp replaces integrity validation.
- **Impact:** Root cause is masked; corrupted flows continue silently.
- **Suggested fix (no code):** Replace clamp with hard validation + explicit business rule for negative stock policy.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)

### CRIT-008 — Missing idempotency strategy for inventory write operations
- **Description:** Retries can create duplicate business effects in import/receipt/invoice/adjust flows.
- **Root cause:** No request idempotency key and no dedupe contract.
- **Impact:** Duplicate stock movements and financial documents under network retry/timeouts.
- **Suggested fix (no code):** Introduce idempotency key policy for all mutating POS endpoints.
- **Status:** TODO

## Medium Risks

### MED-001 — Stocktaking drift risk (snapshot vs confirm-time stock)
- **Description:** Adjustment uses draft snapshot delta then applies on later current stock.
- **Root cause:** Long-lived draft with no stale-check policy.
- **Impact:** Confirmed stock may not match actual counted inventory intent.
- **Suggested fix (no code):** Add stale snapshot detection/reconfirm workflow before confirm.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)

### MED-002 — Time handling is inconsistent across services
- **Description:** Some flows use `businessClock`, others still use raw `LocalDate.now()/LocalDateTime.now()`.
- **Root cause:** Partial migration to timezone-aware clock injection.
- **Impact:** Day-boundary and “today” validation/report mismatches across environments.
- **Suggested fix (no code):** Normalize all business-time reads to injected `Clock/ZoneId`.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/config/TimeConfig.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/config/TimeConfig.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)

### MED-003 — N+1/read amplification remains on list/report paths
- **Description:** DTO mapping traverses lazy graphs and some queries still lack explicit fetch strategy.
- **Root cause:** Mixed fetch planning across endpoints.
- **Impact:** Latency spikes and DB pressure at scale.
- **Suggested fix (no code):** Standardize projection/fetch-plan for high-traffic list APIs.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)

### MED-004 — FEFO expiry boundary may be incorrect for business policy
- **Description:** FEFO query uses `expiryDate > CURRENT_DATE`.
- **Root cause:** Hardcoded boundary may conflict with policy allowing sell on expiry date.
- **Impact:** Potential over-block/under-block of sellable stock.
- **Suggested fix (no code):** Confirm policy and align comparator (`>` vs `>=`) consistently.
- **Status:** TODO

### MED-005 — Search queries are index-unfriendly
- **Description:** `lower(...)`, `%keyword%`, accent-unaccent patterns can bypass normal indexes.
- **Root cause:** Full-text-like search on standard columns without matching index strategy.
- **Impact:** Full scans and degraded search at scale.
- **Suggested fix (no code):** Add functional/trigram index strategy aligned to query patterns.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/CustomerRepository.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/CustomerRepository.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SupplierRepository.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/SupplierRepository.java), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java)

### MED-006 — Locking/version strategy is not fully unified
- **Description:** Some critical paths are hardened, others still use mixed lock/read patterns.
- **Root cause:** Incremental fixes without a single concurrency contract.
- **Impact:** Residual lost updates and inconsistent behavior under high concurrency.
- **Suggested fix (no code):** Define one locking/version matrix per use-case (receipt, sell, cancel, adjust, import).
- **Status:** TODO

## Frontend-Backend Integration Issues

### INT-001 — Date payload pattern is mixed and fragile
- **Description:** Frontend alternates date-only+`T00:00:00` and null-default-now.
- **Root cause:** No single date input contract.
- **Impact:** Boundary inconsistencies with timezone and validation rules.
- **Suggested fix (no code):** Define strict API contract for date-only vs datetime fields and defaults.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/ReceiptsPage.jsx`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/ReceiptsPage.jsx), [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/receiptService.js`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/receiptService.js), [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)

### INT-002 — Validation/error contract is inconsistent across screens
- **Description:** UI parses `detail|message|error` inconsistently.
- **Root cause:** No standardized backend error envelope consumed uniformly by frontend.
- **Impact:** Misleading toasts, hidden actionable errors, poor operator response.
- **Suggested fix (no code):** Standardize one error schema and one frontend parsing adapter.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useInvoices.js`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useInvoices.js), [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useReceipts.js`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useReceipts.js), [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/InvoicesPage.jsx`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/pages/admin/InvoicesPage.jsx)

### INT-003 — Unbounded frontend product fetch flow
- **Description:** Full list fetch + client filtering/sorting on large dataset.
- **Root cause:** Server-side pagination/filter not mandatory in product admin flow.
- **Impact:** Slow UI, stale data races, high memory usage.
- **Suggested fix (no code):** Move filtering/sorting/paging contract to backend for large collections.
- **Status:** TODO
- **Evidence:** [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/productService.js`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/services/productService.js), [`c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useProducts.js`](c:/Work/NhaDanShopBT/NhaDanShopUi/src/hooks/useProducts.js)

## Data Consistency Risks (Most Important)

- No enforced invariant check between `stockQty` and sum of batch remainder after each stock mutation.
- No immutable batch movement ledger linking invoice item deduction and cancel restore.
- Multiple write paths mutate stock independently (receipt/sale/adjustment/import/manual variant update), increasing drift probability.
- Locking/idempotency policy is not uniformly applied across all stock mutation endpoints.

## Improvements (No code, minimal and practical)

1. **Inventory correctness guardrail first**
   - Enforce one stock-mutation policy with unified lock path.
   - Add post-mutation invariant validation (`variant.stockQty == sum(batch.remainingQty)`) and audit on mismatch.

2. **Batch traceability for cancellation/reversal**
   - Persist per-transaction batch allocation records during sell.
   - Use exact allocation records for cancel/rollback (not heuristic matching).

3. **Concurrency hardening**
   - Standardize lock/version strategy across receipt/sell/cancel/adjust/import.
   - Add idempotency key policy for all mutating inventory and invoice endpoints.
   - Keep lock order deterministic to reduce deadlocks.

4. **Revenue/profit consistency**
   - Define one canonical net revenue formula.
   - Enforce valid invoice status filtering consistently in all aggregate/report queries.

5. **FE↔BE contract normalization**
   - Standardize date/time input-output contract and timezone assumptions.
   - Standardize one error payload schema across backend and frontend adapters.

6. **Performance quick wins**
   - Remove remaining N+1/read amplification in high-volume list/report APIs.
   - Add/verify indexes for invoice/receipt/batch/search hot predicates.
   - Move heavy import/report/export to controlled async jobs with bounded executor.

## Priority Action Plan

- **P0 (Immediate):** CRIT-001, CRIT-002, CRIT-003, CRIT-004, CRIT-006, CRIT-007
- **P1 (Next Sprint):** CRIT-008, MED-002, MED-003, MED-006, INT-001, INT-002
- **P2 (Stabilization):** MED-004, MED-005, INT-003 + performance/index program

## Architecture Improvements

- Tách dần “god services” (`InventoryReceiptService`, `InvoiceService`, `ExcelReceiptImportService`) theo use-case boundary.
- Chuẩn hóa nguồn thời gian và transaction semantics cho toàn bộ service nghiệp vụ.
- Chuẩn hóa sequence/id generation cho môi trường multi-instance.
- Áp dụng CQRS-lite cho báo cáo nặng: read-model/summary + async export pipeline.

## Issue Tracking Table

| ID | Severity | Section | Title | Status |
|---|---|---|---|---|
| CRIT-001 | Critical | Inventory | Stock overwrite breaks batch consistency | IN_PROGRESS |
| CRIT-002 | Critical | Invoice | Cancel/delete restore not batch-traceable | TODO |
| CRIT-003 | Critical | Receipt | Receipt delete race window | TODO |
| CRIT-004 | Critical | Receipt/Import | Excel import lost update | TODO |
| CRIT-005 | Critical | Revenue | Revenue consistency drift across modules | TODO |
| CRIT-006 | Critical | Inventory | Missing centralized invariant guard | TODO |
| CRIT-007 | Critical | Inventory | Clamp logic hides corruption | TODO |
| CRIT-008 | Critical | Concurrency | Missing idempotency for mutating flows | TODO |
| MED-001 | Medium | Stocktaking | Snapshot-confirm drift risk | TODO |
| MED-002 | Medium | Time | Inconsistent business clock usage | TODO |
| MED-003 | Medium | Performance | N+1/read amplification on list/report | TODO |
| MED-004 | Medium | Inventory | FEFO expiry boundary ambiguity | TODO |
| MED-005 | Medium | Performance | Index-unfriendly search queries | TODO |
| MED-006 | Medium | Concurrency | Lock/version policy not unified | TODO |
| INT-001 | Medium | Integration | Mixed date payload contract | TODO |
| INT-002 | Medium | Integration | Inconsistent error/validation contract | TODO |
| INT-003 | Medium | Integration/Performance | Unbounded frontend product fetch | TODO |

## Audit Scope Coverage

- Covered modules: product management, inventory, receipt (single+excel), invoice, revenue/profit, stocktaking, concurrency, integration, timezone, performance.
- Excluded: deployment infra tuning and DB execution plan measurements (needs production metrics/EXPLAIN).