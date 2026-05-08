---
name: stock_adjustment_reversal
overview: Implement a local-only StockAdjustment reversal flow that preserves confirmed records, applies inverse stock changes through the controlled mutation path, and keeps batch/variant projections consistent without touching unrelated invoice, receipt, archive, or payment behavior.
todos:
  - id: add-v16-reversal-schema
    content: Add V16 migration for reversal linkage fields on stock_adjustments and stock_adjustment_item_batch_allocations trace table.
    status: completed
  - id: trace-new-confirms-only
    content: Update confirm path to write allocation trace only for new confirms after V16; do not backfill old confirmed adjustments.
    status: completed
  - id: implement-strict-reverse-logic
    content: Implement reverse logic using allocation trace as primary source, deterministic fallback only when provably safe, and never re-run FEFO heuristics.
    status: completed
  - id: enforce-reversal-rejections
    content: Reject reversal when stock is insufficient, trace is missing and effect is non-deterministic, original is already reversed, target is itself a reversal, or any batch would go negative.
    status: completed
  - id: enforce-positive-batch-rule
    content: Reverse positive adjustments only if the full created batch quantity is still available; do not partially reverse.
    status: completed
  - id: preserve-existing-policies
    content: Keep DRAFT delete unchanged, CONFIRMED delete blocked, FEFO unchanged, projection invariant unchanged, and ProductVariant.stockQty equal to SUM(ProductBatch.remainingQty).
    status: completed
  - id: avoid-out-of-scope-changes
    content: Do not introduce InventoryMovement for stock adjustments, mutate confirmed quantities, direct-update ProductBatch.remainingQty outside StockMutationService, break unrelated domains, or backfill legacy traces.
    status: completed
isProject: false
---

# StockAdjustment Reversal Plan

## Audit Findings
- `StockAdjustment` is defined in [NhaDanShop/src/main/java/com/example/nhadanshop/entity/StockAdjustment.java](NhaDanShop/src/main/java/com/example/nhadanshop/entity/StockAdjustment.java) with `Status { DRAFT, CONFIRMED }`, `createdBy`, `confirmedBy`, `confirmedAt`, and no reversal fields.
- `StockAdjustmentItem` in [NhaDanShop/src/main/java/com/example/nhadanshop/entity/StockAdjustmentItem.java](NhaDanShop/src/main/java/com/example/nhadanshop/entity/StockAdjustmentItem.java) has `variant`, optional `sourceBatch`, `systemQty`, `actualQty`, computed `diffQty`, and `note`.
- `StockAdjustmentController` in [NhaDanShop/src/main/java/com/example/nhadanshop/controller/StockAdjustmentController.java](NhaDanShop/src/main/java/com/example/nhadanshop/controller/StockAdjustmentController.java) currently exposes `GET /api/stock-adjustments`, `GET /{id}`, `POST /`, `PUT /{id}/confirm`, and `DELETE /{id}`. New endpoint will be `POST /api/stock-adjustments/{id}/reverse`.
- `StockAdjustmentService` in [NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) currently allows DRAFT hard delete unchanged, rejects confirmed delete, and confirms by calculating `diff = actualQty - systemQty`.
- Current confirm stock path uses [NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java) `updateStockWithBatches`, which locks variant/batches, rejects negative batch remaining, and recalculates `ProductVariant.stockQty` from `SUM(ProductBatch.remainingQty)`.
- Positive adjustment confirm creates a new batch with code `adjNo + "-" + variantCode`; negative confirm deducts either the explicit `sourceBatchId` or FEFO batches. The FEFO batch allocations are not currently persisted, which means exact reversal of older negative adjustments without `sourceBatchId` cannot be proven safely.
- `InventoryMovement` exists, but stock adjustments do not currently append movements. I will not introduce a partial movement policy for adjustments in this phase; reversal audit will live in StockAdjustment linkage plus a focused batch-allocation trace.
- Transactions already exist on create/confirm/delete. Reversal will be one `@Transactional` service method covering reversal record/linkage, batch mutation, variant stock sync, combo refresh, and allocation trace writes.
- Current schema is in [NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql](NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql) and `source_batch_id` was added by [NhaDanShop/src/main/resources/db/migration/V7__stock_adjustment_source_batch.sql](NhaDanShop/src/main/resources/db/migration/V7__stock_adjustment_source_batch.sql). Latest migration is V15, so any additive migration will be V16.

## Implementation Approach
- Add additive Flyway migration `V16__stock_adjustment_reversal.sql` with reversal linkage on `stock_adjustments`:
  - `reversed_at TIMESTAMPTZ NULL`
  - `reversed_by VARCHAR(100) NULL`
  - `reversal_reason TEXT NULL`
  - `reversal_adjustment_id BIGINT NULL REFERENCES stock_adjustments(id)`
  - `reverses_adjustment_id BIGINT NULL REFERENCES stock_adjustments(id)`
  - partial unique index on `reverses_adjustment_id` where not null, to prevent duplicate reversal documents
  - optional check preventing self-reversal
- Add a small allocation trace table, likely `stock_adjustment_item_batch_allocations`, to store `adjustment_item_id`, `batch_id`, and signed `qty_delta`. This is needed because current FEFO negative adjustment confirm mutates multiple batches without persisting which batches were touched.
- Write `stock_adjustment_item_batch_allocations` only for new confirmations after V16. Do not attempt to backfill old or legacy confirmed adjustments. Existing confirmed adjustments without trace remain reversible only if deterministic under the strict fallback rule.
- Update `StockAdjustment` entity and `StockAdjustmentResponse` to expose reversal metadata/linkage. Keep status values as `DRAFT` and `CONFIRMED`; reversal is represented by explicit links rather than mutating confirmed quantities or adding a destructive status transition.
- Add `StockAdjustmentReverseRequest` with optional `reason` and `reversedBy`.
- Add `IdempotencyScopes.stockAdjustmentReverse(id)` and wire controller endpoint through existing idempotency service.
- Extend confirm path only inside stock adjustment behavior to write allocation rows for new confirmations after each controlled mutation. Existing confirm semantics and DRAFT delete behavior remain unchanged, and there is explicitly no backfill.
- Add `reverse(id, request)` in `StockAdjustmentService`:
  - lock original adjustment with `findByIdForUpdate`
  - require original status `CONFIRMED`
  - reject if original already has `reversalAdjustmentId`/`reversedAt`
  - reject if the requested adjustment is itself a reversal via `reversesAdjustmentId`
  - build a new confirmed reversal StockAdjustment record linked to the original
  - use allocation trace rows as the primary source of truth when present, applying the exact inverse per batch
  - use `diffQty` only as a consistency check or fallback input, not as the primary source when allocation rows exist
  - if allocation trace is missing, allow reversal only when the original stock effect can be proven 1:1 deterministic
  - verify every required batch independently; reject if any required original batch cannot satisfy the exact inverse quantity needed for that batch
  - never use total variant stock as proof of reversibility, never borrow from another batch, and never compensate from another batch
  - if allocation trace requires batch A quantity 5, batch A must be able to reverse quantity 5; batch B stock cannot cover it
  - never re-run FEFO heuristics, never reverse by current FEFO as a fallback, and reject legacy negative FEFO adjustments without allocation trace
  - for positive adjustments that created a batch, reverse only if the created batch still has the full created quantity available; reject if any of that batch has been consumed downstream
  - do not partially reverse a created adjustment batch, and do not create a compensating negative elsewhere to fake reversal
  - apply stock changes through `StockMutationService.updateStockWithBatches`, never direct `remainingQty` assignment outside that path
  - rely on `StockMutationService` negative guard to reject downstream consumption that would make any batch negative
  - refresh combos for affected variants as confirm already does
  - save original reversal metadata and the reversal adjustment in the same transaction
- Keep `InventoryMovement` unchanged for this phase and report that decision explicitly.

## Verification Plan
- Run `./gradlew.bat compileJava --no-daemon` from [NhaDanShop](NhaDanShop).
- Restart backend with `SPRING_PROFILES_ACTIVE=local`, confirm Tomcat starts on 8080, and verify Flyway advances to V16 only if migration is accepted.
- API-check DRAFT create/delete remains unchanged.
- API-check confirmed delete is still rejected.
- API-check `POST /api/stock-adjustments/{id}/reverse` succeeds on a controlled reversible adjustment, original remains readable with reversal metadata, and reversal record remains readable.
- Verify `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)` and inventory projection returns to the pre-adjustment value.
- Verify duplicate reverse is rejected and stock is unchanged.
- Verify downstream consumption case rejects cleanly when the target batch no longer has enough remaining stock, or report skipped reason if a safe fixture is too heavy locally.
- Verify per-batch exactness: if a required original batch cannot satisfy its exact inverse quantity, reversal rejects even when total stock across the variant is sufficient.
- Verify a legacy negative FEFO adjustment without allocation trace rejects with a clear business error instead of guessing batches.
- Verify a positive adjustment reversal rejects when its created batch was partially consumed downstream.
- Confirm no frontend, invoice create/cancel, receipt create/delete, ProductVariant archive, Customer/Supplier/Voucher/Promotion, FEFO, payment, Casso, Goong, deployment config, push, merge, or deploy changes are made.

## Acceptance Checklist
- DRAFT delete behavior remains unchanged.
- CONFIRMED delete remains blocked.
- Reversal uses allocation trace rows as the source of truth when present.
- Legacy fallback is allowed only when the original stock effect is provably 1:1 deterministic.
- Legacy negative FEFO adjustments without allocation trace reject with a clear business error.
- Positive adjustment reversal succeeds only when the full created batch quantity is still available.
- No partial reversal of created adjustment batches is allowed.
- Duplicate reversal is rejected.
- Target adjustments that are themselves reversal documents cannot be reversed.
- Reversal rejects before commit if any required original batch cannot satisfy its exact inverse quantity; total variant stock or another batch cannot be used as compensation.
- Reversal does not borrow from another batch and does not use global variant quantity as proof of reversibility.
- `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)` remains true after confirm and reversal.
- FEFO, invoice, receipt, payment, ProductVariant archive, Customer, Supplier, Voucher, and Promotion behavior remain unchanged.
- No InventoryMovement policy is introduced for stock adjustments in this phase.
- No legacy allocation trace backfill is attempted.

## Risk / Edge Cases
- Allocation trace timing: `stock_adjustment_item_batch_allocations` starts only for confirmations after V16. Old confirmed adjustments remain trace-less; no backfill will be run.
- Source of truth order: use allocation trace rows first; use deterministic legacy reconstruction only when provably safe. If allocation trace exists, do not recompute the batch effect from `diffQty` alone.
- Legacy fallback strictness: missing trace means reversal must reject unless the exact affected batch can be proven without guessing. Never re-run historical FEFO, and never use current FEFO to approximate a reversal.
- Per-batch exactness: each required original batch must have enough `remainingQty` for that batch's inverse operation. Total stock across the variant is not enough, and another batch cannot cover a shortfall.
- Positive adjustment batch consumption: if a positive adjustment created a batch and downstream activity consumed any quantity from that batch, reversal must reject. It must not partially reverse or compensate through another batch.
- Projection safety: all stock changes stay inside `StockMutationService.updateStockWithBatches`, so negative batches are rejected and variant stock is recalculated from batch sums.

## TODO List
- Add V16 migration for reversal linkage fields on `stock_adjustments` and the `stock_adjustment_item_batch_allocations` trace table.
- Confirm path: write allocation trace only for new confirms after V16, and do not backfill old confirmed adjustments.
- Reverse logic: use allocation trace as primary source, fallback only if deterministic and provably safe, and never re-run FEFO heuristics.
- Reject reversal if any required original batch cannot satisfy its exact inverse qty; never use total variant stock or another batch as compensation.
- Also reject reversal if no allocation trace exists and the original effect is not deterministic, original adjustment is already reversed, target adjustment is itself a reversal, or reversal would make any batch negative.
- Positive adjustment: reverse only if the full created batch quantity is still available; no partial reversal.
- Keep DRAFT delete unchanged, CONFIRMED delete blocked, FEFO unchanged, projection invariant unchanged, and `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)`.
- Do not introduce InventoryMovement for stock adjustments in this phase, mutate existing confirmed adjustment quantities, direct-update `ProductBatch.remainingQty` outside `StockMutationService`, break invoice/receipt/payment/variant/customer/supplier/voucher/promotion behavior, or backfill legacy allocation traces.