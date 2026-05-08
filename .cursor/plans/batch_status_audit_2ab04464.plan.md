---
name: Batch Status Audit
overview: "ProductBatch status and unified sellable predicate tracking. Slices 0–6 complete: Slice 6 closes with 6A (tests + read-only smoke) and 6B (live HTTP + Postgres gap-close PASS, including pending-order confirm E2E). Sales FEFO, projection, ADJ current-adjustable per plan."
todos:
  - id: slice-5a-audit
    content: "Slice 5A: StockAdjustment predicate alignment audit (read-only); decision recorded in plan."
    status: completed
  - id: decision-slice
    content: "Decision slice: lock onHand/current stock vs sellableQty semantics before implementation."
    status: completed
  - id: v18-status-metadata
    content: "Future slice V18: add ProductBatch.status schema/entity/default/backfill only; no behavior switch."
    status: completed
  - id: add-predicates-side-by-side
    content: "Future slice: add current-stock and sellable repository predicates/helpers side-by-side without switching callers."
    status: completed
  - id: switch-sales-fefo
    content: "Future slice: switch sales FEFO to unified sellable predicate with focused runtime tests."
    status: completed
  - id: decide-sellable-qty
    content: "Slice 4A: additive `sellableQty` API/DTO/FE types only; reporting unchanged. Slice 4B: confirmed no report/accounting/visible UI use of sellable; future UI TBD by product."
    status: completed
  - id: align-adjustment-predicate
    content: "Slice 5B: `findCurrentAdjustableByVariantIdForUpdate` + `StockAdjustmentService` confirm/DRAFT create; tests `StockAdjustmentServiceSlice5bIntegrationTest`, `ProductBatchRepositoryCurrentAdjustableSlice5bTest`."
    status: completed
  - id: full-regression
    content: "Slice 6 (2026-04-27, local): 6A — `gradlew test` 51/51; `slice6_regression_readonly_smoke.ps1` (health/Flyway/SQL); integration tests + `InvoiceBatchAllocationIntegrationTest` TestConfig +ObjectMapper (test only). 6B — `slice6b_live_http_gap_close.ps1` live HTTP + Postgres gap-close PASS (receipt void/delete, FEFO, pending-order confirm+dup, combo, stock adj, projection, final SQL)."
    status: completed
isProject: false
---

# ProductBatch Status Audit

## Current Status
- Slice 0 COMPLETE: decision capture.
- Slice 1 COMPLETE: V18 `ProductBatch.status` metadata/entity/DTO/backfill.
- Slice 2 COMPLETE: predicate helpers/repository methods side-by-side.
- Slice 3 COMPLETE: sales FEFO switched to the sellable predicate.
- Slice 3.5 COMPLETE: carry-forward audit; variant 6 is COMBO virtual stock, not batch drift.
- **Slice 4A COMPLETE:** `InventoryProjectionResponse` + FE `InventoryProjection` add **additive** `sellableQty` only. **SINGLE:** integer sum of sellable batch remaining. **COMBO (e.g. variant 6):** `null`. `onHand`, `available`, `byBatch`, and `ProductVariant.stockQty` semantics **unchanged** (`onHand` = current/system/physical; `available` = existing onHand−reserved, **not** sale-sellable).
- **Slice 4B COMPLETE (audit / closure decision, 2026-04-26, local):** `sellableQty` is **API/adapter contract only** for now. **No** visible UI change, **no** report or accounting change in this slice. A future UI may show `sellableQty` only after an explicit product decision. Inventory/stock reports remain **current/system** stock (variant + batch ledgers) unless a separate change is approved.
- **Slice 5A COMPLETE (audit / decision only, 2026-04-26, local):** Stock adjustment **behavior unchanged**; see [§ Slice 5A — StockAdjustment predicate alignment audit](#slice-5a--stockadjustment-predicate-alignment-audit) for path map, current predicates, DB counts, **proposed** `currentAdjustable` policy, and **recommended Slice 5B** implementation scope. **No** production Java/TS edits in 5A.
- **Slice 5B COMPLETE (implementation, 2026-04-26, local):** [§ Slice 5B — current-adjustable predicate (implemented)](#slice-5b--current-adjustable-predicate-implemented) — `ProductBatchRepository.findCurrentAdjustableByVariantIdForUpdate`; unsourced negative in `StockAdjustmentService.confirm` uses it; DRAFT **create** no longer requires variant `active` (admin correction / unsourced without active); explicit `sourceBatch` negative rejects `voided`/`depleted`/`archived`. Reverse and `StockMutationService` unchanged. Tests + `BatchExpiryCorrectionIntegrationTest` `ObjectMapper` test bean. **No** migration, **no** sales FEFO / projection / report / FE change.
- **Slice 6 COMPLETE (6A + 6B, 2026-04-27, local):** Slice **6A** — [§ Slice 6 — full regression (runtime)](#slice-6--full-regression-runtime): `.\gradlew.bat test` **51/51**; `nha-dan-pos-c091ee5b` `npm run build` OK; `/actuator/health` 200; Flyway V18; read-only SQL smoke; integration tests for most matrix rows; test-only `ObjectMapper` in `InvoiceBatchAllocationIntegrationTest`. Script: [`slice6_regression_readonly_smoke.ps1`](../NhaDanShop/scripts/slice6_regression_readonly_smoke.ps1). Slice **6B** — **COMPLETE:** live HTTP + Postgres gap-close **PASS** via [`slice6b_live_http_gap_close.ps1`](../NhaDanShop/scripts/slice6b_live_http_gap_close.ps1) (admin auth from env; no secrets in output): receipt void/delete matrix, sales FEFO (active / blocked / expired), `POST /api/pending-orders/{id}/confirm` + duplicate confirm (no duplicate invoice/movement), combo sell → archive → resell rejected, stock adjustment API (unsourced negative on blocked + expired lots with allocation trace), authenticated `GET /api/inventory/projections/{id}` vs SQL for touched variants (COMBO `sellableQty` null), final SQL invariants (`voided`+positive remaining sum 0; no negative `remaining_qty`; touched non-COMBO stock vs batch sum; `sellableQty` ≤ `onHand` where applicable). **Caveat:** explicit `sourceBatch` = voided lot with `remaining>0` is **N/A** live (no public API to create that state); **PASS** in `StockAdjustmentServiceSlice5bIntegrationTest`. **This plan edit only:** no Java/TS/migration/DB/config changes in the tracking pass.
- Current Flyway: V18.

### Slice 5A — StockAdjustment predicate alignment audit

**Verdict: PASS** (read-only; `voided` receipt with `remaining_qty > 0` = **0**; Flyway **V18** with `success = true`; `compileJava` green).

#### Scope (5A)
Files inspected: `StockAdjustmentService.java`, `StockAdjustment.java`, `StockAdjustmentItem.java`, `StockAdjustmentItemBatchAllocation.java`, `StockAdjustmentController.java`, DTOs `StockAdjustmentRequest` / `StockAdjustmentResponse` / `StockAdjustmentReverseRequest`, `ProductBatchRepository.java` (unsourced + lock queries), `StockAdjustmentRepository.java`, `StockAdjustmentItemBatchAllocationRepository.java`, `StockMutationService.java` (`updateStockWithBatches`, variant invariant). Tests: `BatchExpiryCorrectionIntegrationTest` (uses adjustment). **No** production code or migration in 5A.

#### Lifecycle map (current code)
| Step | API | Service behavior | Notes |
|------|-----|------------------|--------|
| Create draft | `POST /api/stock-adjustments` | `create`: `nextAdjNo()`, DRAFT, per item loads variant (must be **active**), optional `sourceBatch` by id with variant ownership check, snapshot `systemQty` = `variant.stockQty`, `IdempotencyService` optional | **No** `PUT` update draft; **no** batch deduction |
| Delete draft | `DELETE /api/stock-adjustments/{id}` | `delete`: allowed only if not CONFIRMED | Idempotency optional |
| Confirm | `PUT /api/stock-adjustments/{id}/confirm` | `confirm`: `findByIdForUpdate(adj)`; per item `findByIdForUpdate(variant)`; reject if `stockQty` changed vs snapshot; `diff = actual - system` | **Idempotency** optional on confirm |
| Reverse | `POST /api/stock-adjustments/{id}/reverse` | `reverse`: only CONFIRMED, not already reversed; loads allocation trace; trace validation or legacy path | **Idempotency** optional |

**Confirm path detail**
- **diff = 0:** skip.
- **diff &lt; 0, `sourceBatch` set:** `lockSourceBatchesInDeterministicOrder` → `ProductBatchRepository.findAllByIdInForUpdate` (sorted ids); check variant match and `toDeduct <= remainingQty`; `StockMutationService.updateStockWithBatches` single delta; `saveConfirmAllocationTrace`.
- **diff &lt; 0, no sourceBatch (unsourced negative):** `findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(variantId, 0)` — Spring Data: **`remainingQty > 0` only**, `ORDER BY expiryDate ASC` — **no** `status` filter, **no** expiry filter → **can deduct from expired, blocked, etc.**; builds list of `BatchStockChange` deltas; `updateStockWithBatches` then per-change allocation trace. **Does not** use `findByVariantIdForUpdateFEFO` (sellable predicate).
- **diff &gt; 0 (positive):** `new ProductBatch` with `batchCode = adjNo + '-' + variantCode`, expiry from variant or +10y, `importQty`/`remainingQty` = diff, `costPrice`; **default `status` = active** via entity `@PrePersist`; `updateStockWithBatches(create)`; find by `batchCode`, trace.

**`StockMutationService.updateStockWithBatches`:** `findByIdForUpdate(variant)` + **`findAllByVariantIdForUpdate(variantId)`** locks **all** batches of variant, applies creates/deltas, **`recalcAndAssertInvariant`** sets `ProductVariant.stockQty = SUM(remaining)` — **not** the sales sellable sum.

**`InventoryMovement`:** **not** appended by `StockAdjustmentService` confirm/reverse; ledger append exists on `StockMutationService.appendMovement` but is **not** called from these paths in reviewed code.

**`ProductBatch.status`:** **not** read in `confirm` deduction paths; status only as entity default on **new** batch (positive line).

#### Path classification
- **Exact-batch:** `sourceBatch` negative confirm; reverse trace inverse / legacy source-batch branch.
- **Created-batch:** positive confirm (new batch, default `active`).
- **Unsourced current stock:** unsourced negative — today = **all positive `remainingQty` FEFO by expiry** (not sellable).
- **Draft/meta:** create/delete draft; read `getAll` / `getById`.

#### Policy — proposed for Slice 5B (not implemented in 5A)
Answered relative to **recommended default** (product may adjust):

| Question | Proposed default |
|----------|------------------|
| Unsourced negative: deduct from **expired** positive? | **Yes** (physical stock is still on hand) unless product forbids. |
| Deduct from **blocked** positive? | **Yes** (treat as inventory correction on held stock) — status encodes *sale* policy, not necessarily *physical* denial for admin adjustment. **Alternative:** exclude blocked; document tradeoff. |
| Deduct from **archived**? | **No** (exclude from `currentAdjustable`; archived = out of active inventory pool for adjustments). |
| **Voided / depleted** rows with positive remaining? | **Must not** (voided receipt + positive is invariant **0**); **depleted** with `remaining_qty=0` N/A. |
| **Product/variant active** for unsourced negative? | **Decide in 5B:** strict POS might require active; **admin correction** may allow inactive to drain stock — table both options. |
| Reuse **sales sellable** predicate? | **No** (Slice 3 FEFO / `sumSellable*`); adjustment is **not** a sale. |
| New **`currentAdjustable` predicate?** | **Yes** for unsourced negative: e.g. `remainingQty > 0`, `status IN ('active','blocked')`, exclude `voided`,`depleted`,`archived` — **no** `expiryDate` filter; **no** “sellable” product/variant check unless product requires. |
| **Order** | `expiryDate ASC, id ASC` (FEFO-like on physical). |
| **Pessimistic locks?** | Today `updateStockWithBatches` already locks **all** variant batches; future query may still iterate a filtered list for ordering — keep **same lock pattern** to avoid deadlocks. |
| **Error if only non-adjustable stock** | Clear `IllegalStateException` (Vietnamese) e.g. insufficient **adjustable** stock, distinct from “not enough sellable for sale.” |

**Exact `sourceBatch` negative (5B):** validate variant ownership, `remainingQty` ≥ amount; **explicit status** allowlist: e.g. allow `active` + **blocked** + **expired** physical rows; **reject** `voided`/`depleted`/`archived` even if a bug showed positive qty. **Do not** use sellable predicate.

**Reverse:** keep **trace-only** inverse; no FEFO guess (already enforced for legacy FEFO-without-trace). **No change** to reverse semantics in 5A.

**Positive:** new batch default `status = active` (current); future optional `blocked` only with product approval.

#### Read-only SQL (local `psql`, 2026-04-26)
- Flyway latest rows: **18 … 14** all `success = t`.
- `remaining_qty > 0` by `status`: **active 17**, **blocked 2**; no archived positive; **2** active rows expired.
- `voided` receipt + `remaining_qty > 0`: **0**.
- `stock_adjustment_items` with `source_batch_id` set: **2**; confirmed items: **10**; allocation table rows: **10**; **0** confirmed line with non-zero diff and missing allocation (post-V16 consistent).

#### Recommended Slice 5B implementation scope
- **Repository:** add e.g. `findByVariantIdForUpdateCurrentAdjustable` (or named query) with predicate above; keep `findByVariantIdAndRemainingQtyGreaterThan…` for comparison/tests only if needed.
- **Service:** switch **only** unsourced-negative branch in `StockAdjustmentService.confirm` to the new method; add explicit status checks for **sourceBatch** path; align error messages.
- **Do not change:** `ProductBatchService` sales FEFO; projection; reports; receipt void; invoice cancel; reverse algorithm except **bugfix** if status validation missing on source batch.
- **Tests:** unit/integration for unsourced negative (blocked + expired + archived exclusion), sourceBatch rejected status, combo/pending order untouched.

#### 5A explicit non-changes
No production behavior change; no migration/DB write; no sales FEFO change; no projection/report/frontend change; no receipt/cancel/reverse **logic** change; no `stockQty` / `onHand` / `available` **semantic** change; no combo/pending-order/payment/confirm change; no push/merge/deploy/config; no DB reset; no secrets printed.

### Slice 5B — current-adjustable predicate (implemented)

**Verdict: PASS** — `align-adjustment-predicate` todo completed.

#### Policy implemented
- Unsourced negative: `ProductBatchRepository.findCurrentAdjustableByVariantIdForUpdate(variantId)` — `remainingQty > 0`, `status IN ('active','blocked')`, `ORDER BY expiryDate ASC, id ASC`, `PESSIMISTIC_WRITE`; no expiry date filter; no product/variant active filter. Insufficient stock error references **tồn điều chỉnh được (active/blocked)**, not sellable.
- DRAFT create: **removed** “variant must be active” check so inactive variants can be adjusted (admin physical correction).
- Explicit `sourceBatch` negative: after lock, `assertSourceBatchStatusAllowedForExplicitNegative` rejects `voided`, `depleted`, `archived`; **allows** `active`, `blocked`, and **expired** (expiry not checked).
- Positive new batch, reverse: **unchanged**; mutation still `StockMutationService.updateStockWithBatches` only.

#### Files changed
- [ProductBatchRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java) — new `findCurrentAdjustableByVariantIdForUpdate`.
- [StockAdjustmentService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) — `confirm` unsourced + explicit branches; `create` active check removed; `assertSourceBatchStatusAllowedForExplicitNegative` private.
- [StockAdjustmentServiceSlice5bIntegrationTest.java](NhaDanShop/src/test/java/com/example/nhadanshop/service/StockAdjustmentServiceSlice5bIntegrationTest.java) — new.
- [ProductBatchRepositoryCurrentAdjustableSlice5bTest.java](NhaDanShop/src/test/java/com/example/nhadanshop/repository/ProductBatchRepositoryCurrentAdjustableSlice5bTest.java) — new.
- [BatchExpiryCorrectionIntegrationTest.java](NhaDanShop/src/test/java/com/example/nhadanshop/service/BatchExpiryCorrectionIntegrationTest.java) — `ObjectMapper` `@Bean` for `DataJpaTest` + `InvoiceService`; test rename for current-adjustable wording.

#### Tests / verification
- `.\gradlew.bat test` (narrow): `StockAdjustmentServiceSlice5bIntegrationTest`, `ProductBatchRepositoryCurrentAdjustableSlice5bTest`, `BatchExpiryCorrectionIntegrationTest` — **all passed** (2026-04-26 local).
- `compileJava` — **OK**.
- Optional local DB: `flyway_schema_history` top **V18** with `success = true`; `voided` receipt + `remaining_qty>0` = **0**.
- `GET /actuator/health` — **200** (when backend up).
- **No** end-to-end HTTP smoke with fixture IDs in this pass (H2 `DataJpaTest` covers behavior); no secrets printed.

#### 5B explicit non-changes
No migration or DB repair; no sales FEFO / `ProductBatchService` FEFO change; no `InventoryProjection` / `ReportService` / `RevenueService` / `InventoryStockService` / frontend change; no receipt void/delete, invoice cancel, or **reverse** algorithm change; `ProductVariant.stockQty` still = sum of batch `remainingQty` after mutation (compatibility layer); `InventoryMovement` still not written from ADJ confirm in this change set; no combo / pending-order / payment / confirm change; no push/merge/deploy/config; no DB reset.

#### 5B follow-up hardening (same slice, policy tighten)
- **Inactive catalog:** `create` and `confirm` reject **positive** `actualQty` vs snapshot when variant or product is inactive; unsourced / explicit **negative** still allowed (physical drain).
- **Explicit sourceBatch:** status must be exactly **`active` or `blocked`** (incl. expired lots with those statuses); `null`, blank, `voided`, `depleted`, `archived`, or any other string rejected.
- **Tests:** `StockAdjustmentServiceSlice5bIntegrationTest` extended; `BatchExpiryCorrectionIntegrationTest` unchanged in behavior.

### Slice 6 — full regression (runtime)

**Verdict: PASS.** Historical **live HTTP GAPs** (pending-order confirm E2E, full void/FEFO/combo/adj choreography vs tests-only) are **closed by Slice 6B** (scripted local run, **PASS**).

#### Slice 6A (tests + read-only smoke — historical baseline)

| Area | Result | Evidence |
|------|--------|----------|
| Pre-check: `compileJava` | **PASS** | `BUILD SUCCESSFUL` |
| Pre-check: FE `npm run build` | **PASS** | `nha-dan-pos-c091ee5b` (not touched in Slice 6; re-run for audit) |
| `gradlew test` (all) | **PASS** 51/51 | After `InvoiceBatchAllocationIntegrationTest$TestConfig` + `ObjectMapper` (test-only) |
| Health + Flyway + SQL smoke | **PASS** | [`slice6_regression_readonly_smoke.ps1`](../NhaDanShop/scripts/slice6_regression_readonly_smoke.ps1) |
| **A** receipt void / delete | **PASS** (tests) | `ReceiptDeletionLockingIntegrationTest` |
| **B** sales FEFO | **PASS** (tests) | `ProductBatchServiceSlice3FefoTest`, `BatchExpiryCorrectionIntegrationTest`, `Crit007FailFastStockIntegrationTest` |
| **C** projection / sellableQty | **PASS** (tests) | `InventoryProjectionServiceSlice4aTest` |
| **D** invoice cancel | **PASS** (tests) | `InvoiceBatchAllocationIntegrationTest`, `StockMutationIntegrationTest` case3; cancel restore = allocation/legacy, not sellable FEFO |
| **E** pending-order confirm | **PASS** (tests / prior GAP at HTTP) | Webhook/coverage via `PaymentEventIntegrationTest`; **HTTP E2E closed in 6B** (see below) |
| **F** combo | **PASS** (tests) | `Crit007ComboVirtualStockIntegrationTest` |
| **G** stock adjustment 5B | **PASS** (tests) | `StockAdjustmentServiceSlice5bIntegrationTest` + `ProductBatchRepositoryCurrentAdjustableSlice5bTest` |
| **H** global SQL (read-only smoke) | **PASS** | `voided`+pos=0; `negative_remaining_batches=0`; `single_variant_stock_mismatch=0` |

**Test-only file:** [InvoiceBatchAllocationIntegrationTest.java](NhaDanShop/src/test/java/com/example/nhadanshop/service/InvoiceBatchAllocationIntegrationTest.java) — `ObjectMapper` bean for `DataJpaTest` (same as BatchExpiry).

#### Slice 6B (live HTTP + Postgres gap-close — **PASS**, 2026-04-27 local)

Script: [`slice6b_live_http_gap_close.ps1`](../NhaDanShop/scripts/slice6b_live_http_gap_close.ps1). **PASS** across: unconsumed receipt void + delete-voided 409; consumed void metadata-only (no extra movement); partial-consumption receipt delete 409; active sale; blocked / expired positive sale rejected with `onHand>0`, `sellableQty=0`; pending-order create → **confirm** → invoice + movement; **second confirm** returns same invoice, **no** duplicate movement rows; combo sell (component movement) → combo delete/archive → resell **400**; stock adjustment **POST** + **PUT confirm** unsourced negative on **blocked** and **expired** lots with `stock_adjustment_item_batch_allocations` trace; `GET /api/inventory/projections/{variantId}` vs SQL for all touched variants; final invariants (voided remaining sum 0, no negative remaining, non-COMBO stock vs batch sum, sellable ≤ onHand).

**Example resource IDs (one successful 6B run; IDs vary per run):** void unconsumed `rid=81` `batch=84` `v=65`; consumed void `rid=82` `inv=71` `v=66`; partial delete `rid=83` `inv=72` `v=67`; FEFO ok `inv=73` `v=68`; blocked `b=88` `v=69`; expired `b=89` `v=70`; pending order `14` / invoice `74` (dup confirm idempotent); combo `product=70` `compVar=71` `comboVar=72` `inv=75`; stock adj `adj=18` `v=73` `b=91` (blocked) and `adj=19` `v=74` `b=92` (expired); projection sweep `v=65`…`v=74` (incl. COMBO `v=72`, `sellableQty` null).

**Explicit caveat (unchanged):** **live** E2E for **explicit `sourceBatch` = voided** with positive `remaining` is **N/A** — the API cannot create voided+remaining lots. **Covered by test:** `StockAdjustmentServiceSlice5bIntegrationTest#explicit_source_rejects_voided_status`.

**Source grep (no `sellable` in void/receipt path):** `InventoryReceiptService` (void/delete) has no sellable; `StockAdjustmentService` has no FEFO sellable; `InvoiceService.cancel` / `restoreStockFromAllocations` uses exact allocations or legacy list query **not** `find*Sellable*`.

**Non-changes (Slice 6 overall):** Slice 6A required no new `src/main` behavior work for closure; 6B is **verification-only** (script issues HTTP + read-only `psql` invariants, fixture rows via **API + permitted local status/expiry `UPDATE` on isolated test rows** in the script, not a migration). This **plan** update: **markdown only** — no Java/TS/migration/DB write/config, no push/merge/deploy; no secrets printed.

### Slice 4B — Local audit record (PASS)
- **Verdict:** **PASS** — no BLOCKED conditions (builds green; no FE screen conflates `available` with sellable; report services do not use `InventoryProjection`/`sellableQty`).
- **Builds (local, 2026-04-26):** `nha-dan-pos-c091ee5b`: `npm run build` **exit 0** (~2m39s). `NhaDanShop`: `.\gradlew.bat compileJava --no-daemon` **BUILD SUCCESSFUL**.
- **Runtime API (optional):** `GET http://localhost:8080/api/inventory/projections/1` returned **403 Forbidden** without credentials — **server reachable**; full JSON field checks (`sellableQty` presence, blocked fixture, COMBO `null`) require an authenticated request (not recorded here).
- **FE usage:** Grep of `nha-dan-pos-c091ee5b/src/**/*.tsx` — **no** imports of `inventory` service / `getInventoryProjection` / `listInventoryProjections`. Inventory projection is **services-layer only** (`BackendInventoryAdapter`, `HybridInventoryAdapter`, `LocalInventoryAdapter`, `inventoryProjectionNormalize.ts`, `types.ts`). `sellableQty` is optional on `InventoryProjection`; normalizer omits/undefined when absent or null/empty; **no** UI breakage from missing `sellableQty`.
- **Report/backend (read-only):** `ReportService` (profit), `RevenueService` (invoices/variants for revenue), `InventoryStockService` (period stock from movements/batches/variants) — **no** references to `InventoryProjectionService`, `sellableQty`, or `InventoryProjection` response types. `ExpiryWarningService` — batch expiry warnings only; no projection/sellable. Slice 4A did not alter these call paths.
- **Files changed in Slice 4B pass:** this plan only (`batch_status_audit_2ab04464.plan.md`).
- **Explicit non-changes (Slice 4B):** no UI redesign; no report/accounting change; no `onHand`/`available`/`stockQty` semantic change; no FEFO / receipt / cancel / reverse / stock adjustment change; no migration/DB write; no push/merge/deploy or deployment-facing config; no DB reset; no secrets printed.

## 0. Decision Log
- `ProductBatch.remainingQty` remains the batch-level stock truth.
- `ProductVariant.stockQty` remains the compatibility projection of current/system stock. It must not be redefined as sellable quantity.
- `InventoryProjection.onHand` remains current/system/physical stock, not sale-sellable capacity.
- `InventoryProjection.available` stays aligned with existing `onHand - reserved` semantics for now. It must not be overloaded into sale sellability.
- If the business/UI needs sale capacity, add an additive field later, such as `sellableQty` or `saleAvailableQty`.
- Sales FEFO should eventually use one sellable predicate: `remainingQty > 0`, `status = 'active'`, `expiryDate >= CURRENT_DATE`, `variant.active = true`, and `product.active = true`.
- Exact historical mutation flows must not use the sellable predicate: invoice cancel allocation restore, stock adjustment reverse, receipt void, and receipt delete remain exact-batch or trace-based.
- `expired` is not a persisted `ProductBatch.status` initially; expiry remains a date predicate because it changes with time.
- Stop before implementation if there is disagreement on `onHand` vs sellable semantics.

## Slice 0 Status
- Slice 0 decision capture is COMPLETE as documentation/decision capture only.
- No Java/TS changes.
- No migration.
- No DB changes.
- No behavior changes.

Locked semantics:
- `ProductBatch.remainingQty` is batch-level stock truth.
- `ProductVariant.stockQty` is current/system compatibility projection, not sellable truth.
- `InventoryProjection.onHand` is current/system/physical stock, not sale-sellable capacity.
- `InventoryProjection.available` remains aligned with current `onHand/reserved` semantics and must not be overloaded as sellable.
- Future `sellableQty`/`saleAvailableQty` must be additive only if explicitly approved later.
- Exact historical mutation flows must not use sellable predicate.
- Expired is not persisted `ProductBatch.status` initially.

Note:
- Slice 1 V18 metadata-only was already completed after these decisions had been captured informally in audit/baseline.
- This edit is only formal tracking cleanup.

## 1. Git Status
- Audit command run: `git status --short` in `C:\Work\NhaDanShopBT`.
- No implementation changes were made in this audit pass.
- Working tree was already very dirty before/during audit. Main groups observed:
  - Modified backend Java/config files across controllers, DTOs, entities, repositories, services, security, and migrations already present through `V17__inventory_receipt_void.sql`.
  - Deleted legacy `NhaDanShopUi/**` files.
  - Untracked current frontend folder `nha-dan-pos-c091ee5b/**`.
  - Untracked backend additions including inventory projection, payment events, idempotency, receipt void, stock mutation, vouchers, shipping/payment settings, tests, scripts, and `.cursor/plans/**`.
  - `NhaDanShop/application-local.properties.example`, `NhaDanShop/src/main/resources/application.properties`, `dev-start.ps1`, and `brd.md` were dirty; secrets were not printed.

## 2. Files Inspected
- Backend batch/repositories:
  - [NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductBatch.java](NhaDanShop/src/main/java/com/example/nhadanshop/entity/ProductBatch.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/dto/ProductBatchResponse.java](NhaDanShop/src/main/java/com/example/nhadanshop/dto/ProductBatchResponse.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductBatchService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductBatchService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ExpiryWarningService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExpiryWarningService.java)
- Stock mutation/invoice/receipt/adjustment:
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)
- Projection/reporting:
  - [NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryProjectionController.java](NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryProjectionController.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryProjectionService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryProjectionService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionResponse.java](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionResponse.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionBatchResponse.java](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionBatchResponse.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/repository/InventoryReceiptRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/InventoryReceiptRepository.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryStockService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryStockService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ReportService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReportService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java)
- Product/variant/combo:
  - [NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductVariantService.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ActiveEntityGuards.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ActiveEntityGuards.java)
  - [NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)
- Frontend:
  - [nha-dan-pos-c091ee5b/src/services/inventory/InventoryService.ts](nha-dan-pos-c091ee5b/src/services/inventory/InventoryService.ts)
  - [nha-dan-pos-c091ee5b/src/services/inventory/inventoryProjectionNormalize.ts](nha-dan-pos-c091ee5b/src/services/inventory/inventoryProjectionNormalize.ts)
  - [nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendInventoryAdapter.ts](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendInventoryAdapter.ts)
  - [nha-dan-pos-c091ee5b/src/services/adapters/local/LocalInventoryAdapter.ts](nha-dan-pos-c091ee5b/src/services/adapters/local/LocalInventoryAdapter.ts)
  - [nha-dan-pos-c091ee5b/src/services/adapters/HybridInventoryAdapter.ts](nha-dan-pos-c091ee5b/src/services/adapters/HybridInventoryAdapter.ts)
  - [nha-dan-pos-c091ee5b/src/services/types.ts](nha-dan-pos-c091ee5b/src/services/types.ts)
  - [nha-dan-pos-c091ee5b/src/services/goodsReceipts/GoodsReceiptService.ts](nha-dan-pos-c091ee5b/src/services/goodsReceipts/GoodsReceiptService.ts)
  - [nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendGoodsReceiptAdapter.ts](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendGoodsReceiptAdapter.ts)
  - [nha-dan-pos-c091ee5b/src/services/adapters/local/LocalGoodsReceiptAdapter.ts](nha-dan-pos-c091ee5b/src/services/adapters/local/LocalGoodsReceiptAdapter.ts)

## 3. Current Predicate Map
- `ProductBatch.hasStock()` in `ProductBatch.java`
  - Current predicate: `remainingQty > 0`.
  - Type: read/helper only.
  - Risk: too narrow for future sellability; does not know status, expiry, receipt status, product/variant active.
- Sales FEFO in `ProductBatchRepository.findByVariantIdForUpdateFEFO` and `findByProductIdForUpdateFEFO`
  - Current predicate: `remainingQty > 0 AND expiryDate >= CURRENT_DATE`, ordered by `expiryDate ASC`; pessimistic write lock.
  - Type: read-for-update followed by mutation in `ProductBatchService.deductFromBatches`.
  - Risk: no `ProductBatch.status`, no receipt status, no product/variant active in query.
- `ProductBatchService.deductStockFEFOWithTrace*`
  - Current predicate: delegates to FEFO queries above; mutates returned batches directly, then syncs variant stock.
  - Type: mutation.
  - Risk: any positive/non-expired status-blocked row would still sell until FEFO query changes.
- `InvoiceService.createInvoice` and `createInvoiceFromPendingOrder`
  - Current predicate: product active checked, variant active through `variantService.resolveVariant`, stock gate via `variant.stockQty`, batch deduction via FEFO.
  - Type: mutation + ledger append.
  - Risk: `stockQty` includes expired positive batches, so it can say enough stock before FEFO later fails; future non-sellable positive batches would create the same gap unless stockQty meaning is explicit.
- `InvoiceService.expandComboToItems`
  - Current predicate: combo product active, each component uses default/resolved active variant and component `stockQty`, then component FEFO.
  - Type: mutation + ledger append through invoice path.
  - Risk: combo availability inherits `stockQty` semantics, not FEFO sellable capacity.
- `InvoiceService.cancelInvoice` / `restoreStockFromAllocations`
  - Current predicate: exact allocation batch ids when present; legacy fallback uses cost match then non-expired/newest heuristic.
  - Type: mutation + `invoice_cancel` movement.
  - Risk: exact restore should likely ignore sellability status and restore to historical batch; legacy fallback could restore into a future blocked/voided batch unless constrained or deprecated.
- `StockMutationService.updateStockWithBatches`
  - Current predicate: caller-chosen exact batch or new batch; validates no negative remaining and recalculates `variant.stockQty` from `sumRemainingQtyByVariantId`.
  - Type: mutation.
  - Risk: it centralizes invariant but not sellability; if status affects stockQty, `sumRemainingQtyByVariantId` must change deliberately.
- `StockMutationService.recalcAndAssertInvariant`
  - Current predicate: `sumRemainingQtyByVariantId` = all batches for variant with `remainingQty > 0`, no expiry/status.
  - Type: projection sync.
  - Risk: status meanings must decide whether non-sellable positive stock is counted in compatibility `stockQty`.
- Receipt create in `InventoryReceiptService.createReceipt`
  - Current predicate: creates new batch with `importQty = remainingQty = addedRetailQty`; expiry from override, variant expiryDays, or +10 years; appends `goods_receipt` movement.
  - Type: mutation.
  - Risk: future status default must be active for normal receipt-created batches.
- Receipt void in `InventoryReceiptService.voidReceipt`
  - Current predicate: exact receipt-owned batches via `findByReceiptIdForUpdate`; for each `remainingQty > 0`, subtracts exact remaining to zero and appends `goods_receipt_void`.
  - Type: mutation.
  - Risk: current correctness relies on zeroing; if future status allows positive voided rows, FEFO/projection must exclude them.
- Receipt delete in `InventoryReceiptService.deleteReceipt`
  - Current predicate: exact receipt-owned batches; allowed only when `remainingQty == importQty`, voided receipts rejected; deletes batch rows after controlled stock subtraction.
  - Type: mutation.
  - Risk: no need to change for status unless batch status replaces hard delete later.
- Stock adjustment confirm, sourceBatch negative path
  - Current predicate: exact source batch, variant ownership check, `remainingQty >= toDeduct`.
  - Type: mutation.
  - Risk: exact batch path may need to allow deduction from blocked/quarantined stock for disposal, or reject if only business sellable stock is allowed. This is a policy decision.
- Stock adjustment confirm, unsourced negative path
  - Current predicate: `findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(variantId, 0)`, no expiry filter, no status.
  - Type: mutation.
  - Risk: already differs from sales FEFO; can reduce expired batches first and would reduce future blocked positive batches unless changed.
- Stock adjustment confirm, positive path
  - Current predicate: creates new `ProductBatch` from adjustment with `remainingQty = importQty = diff`, expiry from variant expiryDays or +10 years.
  - Type: mutation.
  - Risk: future status default likely `active`, unless adjustment reason means quarantine/blocked.
- Stock adjustment reverse
  - Current predicate: exact inverse by allocation trace or deterministic legacy batch; validates remaining for negative inverse.
  - Type: mutation.
  - Risk: should not use current sellable FEFO; status should not cause reverse to pick substitute batches.
- Excel receipt import
  - Current predicate: creates new receipt/batches via `StockMutationService.updateStockWithBatches`; no FEFO selection.
  - Type: mutation.
  - Risk: no `InventoryMovement` append observed here, unlike manual receipt create; future status default/backfill must include Excel-created batches.
- Projection list in `InventoryProjectionService.listProjections`
  - Current predicate: variants from `findAllActiveWithProductAndCategory` (`variant.active = true`, no product.active predicate), batches from `findActiveBatchesByVariantIds` (`remainingQty > 0`, no expiry/status).
  - Type: read-only.
  - Risk: projection onHand is positive physical/current stock, not sale FEFO capacity.
- Projection single in `InventoryProjectionService.getProjection`
  - Current predicate: variant by id with no active check; batches with `remainingQty > 0`.
  - Type: read-only.
  - Risk: single endpoint exposes inactive variants and same positive-batch semantics.
- Expiry warning in `ExpiryWarningService`
  - Current predicate: `remainingQty > 0` plus expiry threshold/expired; no product/variant active/status/receipt status.
  - Type: read-only.
  - Risk: future non-sellable positive stock should probably still appear if it is physically present and expired/near-expiry, but status should be visible.
- Inventory stock report in `InventoryStockService`
  - Current predicate: variants from `findAllActiveWithProductAndCategory`; currentStock from `variant.stockQty`; receipt sums confirmed only; invoice sums completed only; avg cost from non-expired positive batches.
  - Type: read-only report.
  - Risk: currentStock can include expired positive batches while avg cost excludes expired; status could widen this mismatch.
- Receipt aggregates in `InventoryReceiptRepository`
  - Current predicate: `item.receipt.status = 'confirmed'` for received totals.
  - Type: current/valid aggregate.
  - Risk: already excludes voided receipts; future batch status should not make historical receipt rows disappear from audit lists.
- Sales/revenue aggregates in `SalesInvoiceRepository`
  - Current predicate: invoice status `COMPLETED` for revenue, sold qty, costs, daily revenue, top/last-sale queries.
  - Type: current business aggregate.
  - Risk: unrelated to batch status except cost snapshots and allocation history must remain stable.
- Product/variant active selection
  - Current predicate: product sale paths check `product.active`; variant resolution checks `variant.active`; projections/reports often only check `variant.active`.
  - Type: mixed read/mutation.
  - Risk: inactive product with active variant and positive stock may still appear in projection/report, but not sell through normal invoice paths.
- Frontend inventory projection
  - Current predicate: backend returns onHand/available/byBatch; normalizer trusts fields; local adapter uses mock `variant.stock` as onHand/available and no batches.
  - Type: read-only UI contract.
  - Risk: additive `status` field is possible, but current UI has no notion of batch status or sellability reason.

## 4. Sellable Gaps / Risks
- Current backend sellable predicate for sales FEFO is not simply `remainingQty > 0`; it is effectively:
  - product must be active in `InvoiceService` sale path,
  - variant must be active via `ProductVariantService.resolveVariant`,
  - variant `stockQty` must be at least requested quantity,
  - selected batch must satisfy `remainingQty > 0 AND expiryDate >= CURRENT_DATE`.
- The FEFO query itself does not filter product active, variant active, receipt status, or future batch status.
- Projection predicate is not the same as sellable. Projection onHand/byBatch currently counts `remainingQty > 0` regardless of expiry and regardless of product active in list mode.
- `ProductVariant.stockQty` is a compatibility projection from positive remaining batches, including expired positive batches. It is not currently guaranteed to equal sellable FEFO capacity.
- Receipt void currently avoids sellability leakage by zeroing exact receipt-owned remaining batch quantity. If a future status model leaves positive `voided` rows, FEFO/projection must exclude them explicitly.
- StockAdjustment unsourced negative adjustment is a predicate outlier: it uses positive remaining by expiry order but does not require non-expired, and does not use the sales FEFO lock query.
- Inventory value/avg-cost queries differ:
  - `sumBatchValueByVariant` counts positive remaining including expired.
  - `avgCostPriceByVariant` counts positive remaining and non-expired only.
- Expiry warnings intentionally include positive expired/near-expired stock, and should probably remain physical/admin visibility rather than sellability.
- Frontend local inventory fallback assumes `variant.stock` is both onHand and available; no batch status/sellability concept exists there yet.
- Security side note found during audit: backend `SecurityConfig` appears to allow authenticated GET `/api/inventory/**` before broader admin inventory rules, while frontend adapter comment says admin JWT. Not fixed in this pass.
- Decision now locked for the next plan: projection and sellability are not identical. `onHand` remains current/system/physical stock; sellable capacity must be additive if needed.

## 5. Recommended Future Status Model
- `active`
  - Meaning: normal current batch eligible for sale if other sellability predicates pass.
  - Set by: receipt create, Excel import, positive stock adjustment by default, migration backfill for positive current rows.
  - `remainingQty > 0` allowed: yes.
  - Counts in sellable FEFO: yes, if `remainingQty > 0`, non-expired, product active, variant active.
  - Counts in projection onHand: yes.
  - Visible in admin history: yes.
- `depleted`
  - Meaning: batch has no remaining stock; historical row only.
  - Set by: mutation path when remaining becomes zero, or derived during backfill. Consider whether this should be persisted or derived from `remainingQty = 0`.
  - `remainingQty > 0` allowed: no, ideally check constraint or service invariant if persisted.
  - Counts in sellable FEFO: no.
  - Counts in projection onHand: no.
  - Visible in admin history: yes.
- `voided`
  - Meaning: batch belongs to a voided receipt or was explicitly voided as part of a receipt/batch correction policy.
  - Set by: receipt void future status step, or migration backfill for rows tied to voided receipts.
  - `remainingQty > 0` allowed: should be no under current receipt-void baseline; if historical inconsistencies exist, allow temporarily only for audit/backfill and exclude from sellability.
  - Counts in sellable FEFO: no.
  - Counts in projection onHand: normally no because current receipt void baseline sets `remainingQty = 0`; if any voided receipt batch has positive remaining, stop and report rather than guessing.
  - Visible in admin history: yes.
- `blocked` or `quarantined` (prefer one; recommended: `blocked` for user-facing simplicity)
  - Meaning: positive stock exists but must not be sold, e.g. quality hold, manual quarantine, damaged/under review.
  - Set by: future explicit admin action or adjustment reason, not by default create path.
  - `remainingQty > 0` allowed: yes.
  - Counts in sellable FEFO: no.
  - Counts in projection onHand: yes while `onHand` means current/system/physical stock. Do not exclude blocked stock from `onHand` unless explicitly approved later.
  - Visible in admin history: yes.
- `archived`
  - Meaning: retained historical batch hidden from normal operational flows.
  - Set by: future admin/archive path only, not receipt void.
  - `remainingQty > 0` allowed: explicit future decision required.
  - Counts in sellable FEFO: no.
  - Counts in projection onHand: explicit future decision required. Do not bake this into Slice 1.
  - Slice 1 must not change onHand/projection behavior.
  - Visible in admin history: yes.
- Do not model `expired` as persisted status initially.
  - Expiry is already a date predicate and changes with time.
  - Persisting `expired` creates clock-driven data churn and can conflict with reports that need the actual expiry date.

## 6. Proposed Unified Predicate
- Recommended backend concept:
  - Repository-level methods for DB-critical selection and sums.
  - A small helper/specification only for in-memory/read DTO annotations, not as the sole authority for locked selection.
- Proposed class/helper names:
  - `ProductBatchSellability` for in-memory checks and central constants.
  - `ProductBatchRepository.findSellableByVariantIdForUpdateFefo(...)` for sale FEFO.
  - `ProductBatchRepository.findCurrentOnHandBatchesByVariantIds(...)` for explicit projection/current-stock reads.
  - `ProductBatchRepository.sumCurrentRemainingQtyByVariantId(...)` for explicit current/system stock sums.
  - `ProductBatchRepository.sumSellableRemainingQtyByVariantId(...)` only if a separate sellable stock number is needed.
  - Keep `sumRemainingQtyByVariantId(...)` if it remains physical/current compatibility stock.
- Exact recommended sellable predicate for sale FEFO:
  - `batch.variant.id = :variantId`
  - `batch.remainingQty > 0`
  - `batch.expiryDate >= CURRENT_DATE`
  - `batch.status = 'active'`
  - `batch.variant.active = true`
  - `batch.variant.product.active = true`
  - no dependency on receipt status for normal operation if receipt void always zeroes remaining; optionally add `(batch.receipt IS NULL OR batch.receipt.status = 'confirmed')` as a defensive predicate only after verifying it does not exclude legitimate non-receipt/manual/adjustment batches.
- Projection recommendation:
  - Keep `onHand` as current/system/physical stock and preserve `available = onHand - reserved` semantics for this plan.
  - Do not silently exclude expired, blocked, or archived positive stock from `onHand`.
  - Add a separate future `sellableQty` or `saleAvailableQty` field if UI/business needs sale capacity.
- Repository changes needed later:
  - Rename misleading `findActiveBatchesByVariant*` or add new explicit methods: `findCurrentOnHandBatchesByVariant*` and `findSellableBatchesByVariantForFefo`.
  - Add status predicates to FEFO first; projection/value/report/expiry/adjustment queries must be changed only in later slices after their semantics are explicitly approved.
- Service helper needed later:
  - `ProductBatchSellability.isSellable(ProductBatch b, Clock clock)` for DTO badges/tests, mirroring DB predicate where possible.
  - Keep mutation authorization in services (`InvoiceService`, `StockAdjustmentService`) because exact-batch restore/reverse has different rules from sale sellability.

## 7. Historical Pre-Implementation V18 Proposal (Stale Context)
- Status note: V18 is now implemented. This section is preserved as historical planning context from before Slice 1 and no longer describes pending work.
- File proposal only, not created yet: `V18__product_batch_status.sql`.
- Goal: add `ProductBatch.status` as metadata only. Do not switch FEFO, projection, reporting, `StockMutationService`, or frontend behavior in this slice.
- Schema proposal:
  - Add `product_batches.status VARCHAR(32) NOT NULL DEFAULT 'active'`.
  - Add check constraint: `status IN ('active', 'depleted', 'voided', 'blocked', 'archived')`.
- Backfill proposal:
  - `receipt.status = 'voided'` -> `voided`; expected `remaining_qty = 0` under current receipt void baseline.
  - `remaining_qty > 0` and receipt not voided -> `active`.
  - `remaining_qty = 0` and receipt not voided -> `depleted`.
  - Batches without receipt -> `active` or `depleted` by `remaining_qty`.
- Index proposal:
  - Add FEFO index such as `(variant_id, status, expiry_date, id)` with `remaining_qty` included if supported/appropriate, or `(variant_id, status, remaining_qty, expiry_date, id)` for JPQL predicates.
  - Do not add projection semantics-changing indexes until projection current-stock vs sellable behavior is approved.
  - Preserve existing expiry indexes unless query plans show replacements are safe.
- Critical stop condition:
  - If any batch linked to a voided receipt has `remaining_qty > 0`, stop and report.
  - Do not zero stock in migration.
  - Do not mutate stock in migration.
  - Do not guess.
- Entity/DTO proposal:
  - Add `ProductBatch.status` field.
  - Add status to `ProductBatchResponse` only if additive and safe.
  - Do not redesign frontend.
- Verification proposal:
  - `compileJava`.
  - Backend health.
  - Flyway V18 success.
  - SQL backfill counts by status.
  - Stock invariant unchanged: `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)`.
  - Receipt void smoke still passes.
  - Normal invoice sale still passes.

## 8. Proposed Implementation Slices
1. Slice 0: decision capture only.
   - Capture locked semantics: `remainingQty` truth, `stockQty` current/system projection, `onHand` current/system/physical, `available` not sellable, future `sellableQty` additive only.
   - No Java/TS changes, no migration, no behavior change.
2. Slice 1: V18 schema/entity/default/backfill only.
   - Add `ProductBatch.status` as metadata only.
   - Do not switch FEFO, projection, reporting, `StockMutationService`, or frontend behavior.
   - Stop on voided receipt batches with positive `remaining_qty`.
3. Slice 2: add explicit predicates/helpers without switching callers.
   - Add current/onHand predicate and sellable predicate side-by-side.
   - Add characterization tests proving normal active rows behave the same as old query.
4. Slice 3: switch sales FEFO only.
   - Predicate: variant id, `remainingQty > 0`, `status = 'active'`, non-expired, variant active, product active.
   - Do not change invoice cancel restore, stock adjustment reverse, receipt void, receipt delete, projection, or reports.
5. Slice 4: projection/reporting decision and additive fields.
   - Keep `onHand`, `ProductVariant.stockQty`, and `available` unchanged unless explicitly approved.
   - If needed, add optional `sellableQty` computed from the sellable predicate.
6. Slice 5: StockAdjustment predicate alignment.
   - Decide separate policy for unsourced negative stock adjustment.
   - Do not blindly reuse sales sellable predicate.
   - Exact `sourceBatch` and reverse remain exact-batch flows.
7. Slice 6: full regression runtime — **closed:** 6A = tests + `slice6_regression_readonly_smoke.ps1`; 6B = `slice6b_live_http_gap_close.ps1` live HTTP + Postgres (PASS) per [§ Slice 6 — full regression (runtime)](#slice-6--full-regression-runtime).

## 9. Runtime Verification Plan
- A. Active batch sells.
  - Given active product, active variant, active batch, `remainingQty > 0`, future expiry.
  - When invoice or pending-order confirm sells it.
  - Then FEFO deducts it, allocation row is written, `variant.stockQty` syncs, and `invoice` movement is appended.
- B. Depleted batch excluded.
  - Given status `depleted` or `remainingQty = 0`.
  - Then FEFO does not select it and projection excludes it from positive byBatch because quantity is zero.
- C. Voided receipt batch remains non-sellable.
  - Given receipt void produced `remainingQty = 0` and future status `voided`.
  - Then FEFO excludes it, projection excludes it because quantity is zero, while receipt history/get still shows voided receipt.
- D. Manually blocked positive batch not sold.
  - Given `remainingQty > 0`, future expiry, status `blocked`.
  - Then invoice FEFO refuses/ignores it; `onHand` remains current/system/physical unless a later slice explicitly changes it; admin history still displays it.
- E. Inactive product/variant not sold.
  - Given positive active-status batch but inactive product or variant.
  - Then invoice/pending confirm rejects; frontend selection endpoints do not offer it.
- F. Projection invariant.
  - Verify `ProductVariant.stockQty` remains equal to current/system batch remaining sum and inventory projection `onHand` matches that same approved meaning.
  - Add separate assertion for `sellableQty` only if introduced later.
- G. Receipt void baseline still passes.
  - Fully unconsumed receipt void removes remaining stock through `StockMutationService`, appends `goods_receipt_void`, keeps receipt readable, rejects delete of voided receipt.
  - Fully consumed receipt void remains metadata-only 200.
- H. Stock adjustment reverse still passes.
  - Trace-based reverse restores/deducts exact batches and does not guess current FEFO.
- I. Invoice cancel still passes.
  - Allocation-based cancel restores exact allocated batches and appends `invoice_cancel` movements.
- J. Combo archive still passes.
  - Archived combo is not selectable; component batch sellability remains governed by component variant FEFO, not combo status.
- K. Expiry behavior.
  - Expired positive batch is not sale-sellable, but remains visible in expiry/admin handling as approved.
- L. Slice 1 metadata-only safety.
  - Adding/backfilling status does not change normal invoice sale, receipt void, projection `onHand`, `ProductVariant.stockQty`, or report numbers.

## 10. Original Audit-Only Confirmations (Stale Context)
- Status note: this section describes the original audit-only pass. It no longer describes the current repo state after Slice 1, Slice 2, Slice 3, and Slice 3.5.
- Audit only.
- No Java/TypeScript app code changes.
- No ProductBatch.status implementation.
- No V18 migration written.
- No FEFO/projection/report/frontend business logic edits.
- No `ProductVariant.stockQty` semantic change.
- No `InventoryProjection.onHand` semantic change.
- No `InventoryProjection.available` semantic change.
- (Superseded by Slice 4A—see **Current Status**; this bullet reflected pre–Slice-4A audit state.)
- No push, merge, deploy, or config change.
- No DB reset.
- No secrets printed.
- Receipt void semantics were not changed.
- FEFO was not changed.
- Invoice cancel, stock adjustment reverse, combo archive, and pending-order/payment/confirm were not changed.
- Pending-order/payment/confirm semantics were not changed.
- Critical design finding locked: sellability and projection are not identical today; `onHand` remains current/system/physical stock and sale capacity must be additive if needed.

## 11. Slice 3.5 — Carry-forward cleanup audit (read-only, plan only)

**Scope:** 2026-04-26 local verification. No production code, no migration, no DB writes, no config/deploy.

### 11.1 Pre-checks
- `GET /actuator/health` (port 8080): **200** / `UP`
- `flyway_schema_history` latest: **version 18**, **success = true**
- `psql`: `C:\Program Files\PostgreSQL\14\bin\psql.exe` (password from env, not recorded here)

### 11.2 Variant 6 — “drift” root cause (not physical batch desync)

| Field / query | Result (local DB snapshot) |
|---------------|----------------------------|
| `product_variants` id=6 | `product_id=4`, `variant_code=RT-USED-...`, `is_active=false`, `stock_qty=32`, has `updated_at` |
| `products` id=4 | `product_type=COMBO`, `is_active=false`, code/name RT used fixture |
| `product_batches` `variant_id=6` | **0 rows** |
| `inventory_movements` `variant_id=6` | **0 rows** |
| `sales_invoice_items` / batch allocations for variant 6 | **0** |
| `stock_adjustment_items` `variant_id=6` | **0** |
| `product_combo_items` | `combo_product_id=4`, `product_id=1`, `quantity=1` |
| Default variant of component product 1 | `stock_qty=32` (same as variant 6) |

**Conclusion:** This is **not** “`stockQty` out of sync with `SUM(batches)`” in the sense of a broken receipt/ledger. Variant **6** is the **default variant of a COMBO product** (product 4). Physical batches attach to **SINGLE** component variants (e.g. product 1), not to the combo’s own `product_variants` row. `ProductVariant.stockQty` on the combo row is the **virtual** stock (`min` of `floor(component.defaultVariant.stockQty / qty))` maintained by `ProductComboService.updateVirtualStock` (see [ProductComboService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)) — so **no rows in `product_batches` for `variant_id=6` is expected** while `stock_qty=32` matches component availability.

**Remediation (if any):** Do **not** “repair” with batch backfill for variant 6. Optional: document or assert in code/tests that `sumRemainingQtyByVariantId` invariants apply to **SINGLE** variants only; combo rows use virtual stock. If an admin report compares `stock_qty` to batch sums for all variants, exclude `products.product_type = 'COMBO'` or use virtual stock explicitly.

**Slice 4 impact:** This does **not** block projection/sellable work: it is a **model interpretation** issue, not corrupted batch ledger data for real stock.

### 11.3 `ProductBatch.status` lifecycle mismatch (counts + samples)

| Pattern | Count | Sample / note |
|--------|------|-----------------|
| `remaining_qty = 0` AND `status = 'active'` | **1** | `batch_id=6` — `receipt_id=6` → `inventory_receipts.status=voided` (Slice 1 dormant `status` not synced) |
| `remaining_qty = 0` AND `status != 'depleted'` AND (receipt null OR receipt not voided) | **0** | The lone zero-`active` row is on a **voided** receipt, so excluded by this stricter “non-voided” filter |
| Voided receipt, batch `status` ≠ `'voided'` | **1** | Same row `batch_id=6` |
| Voided receipt AND `remaining_qty > 0` | **0** | **Required invariant holds** (stop condition clear) |
| `remaining_qty > 0` AND `status = 'depleted'` | 0 | — |
| `remaining_qty > 0` AND `status = 'voided'` | 0 | — |
| `status = 'blocked'` AND `remaining_qty > 0` (Slice 3 local test fixtures) | **2** | e.g. batches tied to `S3BLK-*` products from gap-close script; safe to leave or clear in dev only |
| `status = 'archived'` | 0 | — |

**Conclusion:** Mismatch is **metadata-only** (voided receipt + zero quantity but `active`), consistent with pre–Slice-3.5 policy: **no** receipt-void `status` sync in Slice 1–3. No positive remaining on voided receipts.

### 11.4 Recommended future alignment (not implemented; requires approval)

- **A — Mutation path sync (preferred long-term):** On receipt void (after stock zeroing), set affected batches to `voided`; on last sale hitting `remainingQty==0`, set `depleted`; on receipt/positive adjustment create, ensure `active`. **Does not** change `remainingQty` rules.
- **B — One-off backfill (V19+):** `UPDATE`/`WHERE` in migration or controlled job: `zero + active` → `depleted` or `voided` if receipt voided; **stop** if any `voided` receipt with `remaining_qty>0` (currently **0**). Classify as **metadata-only** if only `status` flips and quantities untouched.
- **C — Hybrid:** B once + A going forward. Lowest risk for reporting/UI that will surface `status`.

**V19 before Slice 4?** **Optional, not mandatory for Slice 4** if Slice 4 is strictly **additive** (`sellableQty` or projection **labels** without treating `status` as source of truth for `onHand`). If Slice 4 **filters** or **displays** `status` in UI/API, **A+C** (small backfill + void path) reduces confusion. Coordinate with [§5 Recommended Future Status Model](#5-recommended-future-status-model) in this file.

### 11.5 Slice 4 readiness

**Decision: `READY_FOR_SLICE_4`**

| Criterion | Verdict |
|-----------|---------|
| Variant 6 | **Isolated, explainable (COMBO virtual stock)** — not a blocker for sellable/projection design |
| `voided` receipt with positive `remaining_qty` | **0** — safe |
| Status mismatch (zero `active` on voided) | **Metadata-only**; can ship Slice 4 **or** do V19 metadata backfill first — **not** a hard gate unless product requires `status` to be user-trustworthy in Slice 4 deliverables |
| `stockQty` / batch integrity for real SINGLE stock | **No evidence of global corruption** from this audit |

**READY_FOR_SLICE_4 only if** Slice 4 is additive and does not redefine `onHand` or `available`. If Slice 4 exposes or relies heavily on `batch.status` UX, schedule V19 metadata lifecycle sync first. If Slice 4 adds **only** `sellableQty` / reporting fields **without** redefining `onHand`/`available`, proceed. If Slice 4 **depends** on `status` being accurate in DB for every row, schedule **C (hybrid)** before or in parallel (approved migration).

### 11.6 Explicit non-changes (Slice 3.5 pass)
- No Java/TypeScript production edits in this pass (plan edit only).
- No migration, no DB write/repair, no FEFO / projection / report / void / cancel / reverse / pending-order / combo behavior change, no `stockQty` or `onHand`/`available` semantic change, no push/merge/deploy/config, no DB reset, no secrets printed.