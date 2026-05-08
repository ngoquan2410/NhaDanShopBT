---
name: receipt_void_phase
overview: Add a conservative receipt void lifecycle on top of the existing hard-delete flow, preserving historical receipt rows while reversing only the exact remaining qty of receipt-owned batches through the current controlled stock mutation path.
todos:
  - id: audit-receipt-lifecycle
    content: Confirm final set of receipt entity, DTO, controller, repository, and reporting queries touched by persisted void status.
    status: cancelled
  - id: design-void-storage
    content: Add V17 persisted receipt void metadata and update InventoryReceipt/response mapping to use real status instead of synthetic confirmed.
    status: cancelled
  - id: implement-void-api
    content: Add void request DTO, idempotency scope, PATCH void endpoint, and service logic that zeroes only exact receipt-owned remaining batch qty via StockMutationService.
    status: cancelled
  - id: preserve-delete-and-reporting
    content: Keep DELETE semantics unchanged for confirmed receipts, block delete for voided receipts, and exclude voided receipts from receipt-derived reporting aggregates.
    status: cancelled
  - id: verify-runtime-matrix
    content: Run compile, backend health/Flyway checks, and runtime A-F with SQL assertions for movements, batch qty, projection, and duplicate safety.
    status: completed
isProject: false
---

# Receipt Void Phase Plan

## Audit Summary
- Receipt API base path is [`c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\InventoryReceiptController.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\InventoryReceiptController.java):
  - `GET /api/receipts`
  - `GET /api/receipts/{id}`
  - `POST /api/receipts`
  - `PATCH /api/receipts/{id}/meta`
  - `DELETE /api/receipts/{id}`
- Receipt lifecycle is currently synthetic only:
  - [`InventoryReceipt.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\entity\InventoryReceipt.java) has no `status`, `voidedAt`, `voidedBy`, or `voidReason` fields.
  - [`InventoryReceiptResponse.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\dto\InventoryReceiptResponse.java) exposes `status`, but mapper hardcodes `confirmed`.
  - [`DtoMapper.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\DtoMapper.java) currently returns:

```170:184:NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java
public static InventoryReceiptResponse toResponse(InventoryReceipt r, ReceiptDeleteEligibility eligibility) {
    return new InventoryReceiptResponse(
            // ...
            r.getCreatedAt(), r.getUpdatedAt(),
            ReceiptDeleteEligibility.STATUS_CONFIRMED,
            eligibility.canDelete(),
            eligibility.deleteBlockReason()
    );
}
```
- Existing exact-batch controlled mutation path already exists and should be reused:

```42:93:NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java
@Transactional
public void updateStockWithBatches(Long variantId, List<BatchStockChange> changes) {
    ProductVariant variant = variantRepo.findByIdForUpdate(variantId)
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
    List<ProductBatch> lockedBatches = batchRepo.findAllByVariantIdForUpdate(variantId);
    // ... apply delta to the exact batchId ...
    recalcAndAssertInvariant(variant);
}
```
- Existing receipt delete already uses that path with pessimistic lock ordering and appends `goods_receipt_delete` movement before deleting the batch row:

```368:411:NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java
public void deleteReceipt(Long id) {
    InventoryReceipt receipt = receiptRepo.findByIdForUpdate(id)
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
    // lock variants, then receipt batches
    List<ProductBatch> batches = batchRepo.findByReceiptIdForUpdate(id);
    ReceiptDeleteEligibility deleteEligibility = ReceiptDeleteEligibility.fromBatches(batches);
    if (!deleteEligibility.canDelete()) {
        throw new IllegalStateException("Không thể xóa phiếu nhập ...");
    }
    for (ProductBatch batch : batches) {
        stockMutationService.updateStockWithBatches(
                batch.getVariant().getId(),
                List.of(StockMutationService.BatchStockChange.delta(batch.getId(), -batch.getImportQty())));
        appendGoodsReceiptDeleteMovement(receipt, batch);
        batchRepo.delete(batch);
    }
    receiptRepo.delete(receipt);
}
```
- `InventoryMovement` has only a non-unique `(source_type, source_id)` index, so duplicate void protection must be enforced in application code. The void path should check `goods_receipt_void` duplicates per batch/sourceId before mutating stock.
- Migration is required for persistent void metadata, because there is currently no stored receipt status and the response-level `status` is synthetic.

## Implementation Shape
- Add migration `V17__inventory_receipt_void.sql` to persist receipt lifecycle metadata on `inventory_receipts`:
  - `status VARCHAR(32) NOT NULL DEFAULT 'confirmed'`
  - `voided_at TIMESTAMP NULL`
  - `voided_by VARCHAR(255) NULL`
  - `void_reason TEXT NULL`
  - Optional check constraint limited to `confirmed` / `voided` if it matches repo style; otherwise enforce in service.
- Update [`InventoryReceipt.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\entity\InventoryReceipt.java) with new persisted fields and a small internal enum/string constants if that keeps service logic explicit.
- Add additive request DTO [`InventoryReceiptVoidRequest.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\dto\InventoryReceiptVoidRequest.java) with optional `reason` and `voidedBy`.
- Add `PATCH /api/receipts/{id}/void` in [`InventoryReceiptController.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\InventoryReceiptController.java), protected by existing `/api/receipts/**` admin rules in [`SecurityConfig.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\security\SecurityConfig.java). Add idempotency scope in [`IdempotencyScopes.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\IdempotencyScopes.java), e.g. `receiptVoid(id)`.
- Extend [`InventoryReceiptService.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\InventoryReceiptService.java) with `voidReceipt(Long id, InventoryReceiptVoidRequest req)`:
  1. Lock receipt via `findByIdForUpdate`.
  2. If already `voided`, allow same-key idempotency replay to return the original successful response via the existing idempotency framework; a duplicate void with a new key or no key must reject with conflict semantics and do nothing.
  3. Lock variants in sorted order, then receipt batches using the same ordering discipline as `deleteReceipt`.
  4. For each receipt batch:
     - read exact `remainingQty`
     - build `sourceId = receipt:{receiptId}:batch:{batchId}:void` and check `goods_receipt_void` duplication before calling `updateStockWithBatches(...)`
     - if `remainingQty > 0`, call `updateStockWithBatches(variantId, delta(batchId, -remainingQty))`
     - append one `goods_receipt_void` movement only after the exact-batch mutation succeeds
     - if a movement with the same `sourceType/sourceId` already exists before the receipt is marked voided, fail `409` as inconsistent state instead of guessing
     - if `remainingQty == 0`, append no movement
  5. Mark receipt `status=voided`, fill `voidedAt`, `voidedBy`, `voidReason`, save.
  6. Return updated response; keep receipt row and batch rows for history.
- Preserve current DELETE behavior in the same service:
  - reject `status=voided` immediately after receipt lock, before any batch mutation/delete logic
  - confirmed + fully unconsumed: hard-delete still allowed
  - confirmed + partial/consumed: still blocked with `downstream_consumption`
  - voided: always blocked from delete, with `deleteBlockReason = voided`
- Update [`ReceiptDeleteEligibility.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\ReceiptDeleteEligibility.java) so response-level deleteability can account for persisted receipt status without reopening downstream-consumption semantics.
- Update response mapping in [`DtoMapper.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\DtoMapper.java) and [`InventoryReceiptResponse.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\dto\InventoryReceiptResponse.java) to return persisted `status` and additive void metadata (`voidedAt`, `voidedBy`, `voidReason`) while keeping `canDelete` / `deleteBlockReason` compatible.
- Add a small helper in [`InventoryMovementRepository.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\repository\InventoryMovementRepository.java) for duplicate movement detection, e.g. `existsBySourceTypeAndSourceId(...)`.
- Update only receipt-derived current/valid aggregate queries in [`InventoryReceiptRepository.java`](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\repository\InventoryReceiptRepository.java) so `sumReceivedQty...` excludes voided receipts where needed for stock/projection math, while list/get/admin history queries continue to include voided receipts unchanged.

## Behavior Decisions
- Fully unconsumed receipt:
  - `DELETE` remains available exactly as today.
  - `VOID` is also allowed and preserves the receipt row while zeroing receipt-owned batches via exact deltas.
- Partially consumed receipt:
  - `DELETE` stays blocked.
  - `VOID` removes only current `remainingQty` from each exact receipt batch; no FEFO rerun, no borrowing from other batches, no touch to already-consumed allocations.
- Fully consumed receipt:
  - choose metadata-only `VOID` with `200` and no new movement rows, because exact remaining qty is safely known to be `0` and this preserves audit/history without guessing.
- Duplicate `VOID`:
  - same idempotency key may replay the original successful response through the existing idempotency framework.
  - a new key or no key must reject with conflict semantics; no duplicate movement, no second stock mutation.

## Verification Plan
- Compile/backend:
  - `Set-Location C:\Work\NhaDanShopBT\NhaDanShop; .\gradlew.bat compileJava`
  - restart backend on `8080` if needed
  - verify `GET /actuator/health == 200`
  - verify Flyway latest version is `17` and `success = true`
- Runtime matrix:
  - A: fully unconsumed receipt void
  - B: partially consumed receipt void
  - C: fully consumed receipt metadata-only void
  - D: duplicate void with same-key replay vs new/no-key conflict; no duplicate movement
  - E: existing delete unchanged for safe delete and blocked partial delete
  - F: list/get return voided receipt with correct `status`, `canDelete=false`, `deleteBlockReason=voided`
- SQL assertions will focus on:
  - `inventory_receipts.status/voided_*`
  - exact `product_batches.remaining_qty`
  - `product_variants.stock_qty`
  - `inventory_movements` rows for `goods_receipt_void`
  - no duplicate `source_id`
  - no divergence between batch sums and variant projection

## Risks / Stop Conditions
- Stop if a receipt batch cannot be identified exactly from `batch.receipt.id` and `batch.id` under lock.
- Stop if duplicate void cannot be prevented without risking double movement append.
- Stop if keeping list/get/admin history inclusive while limiting reporting changes to receipt-derived current/valid aggregates turns out to require broader reporting semantics changes than this slice allows.
- Do not touch FEFO queries, `ProductBatch.status`, invoice cancel, stock adjustment reverse, combo archive, or pending-order/payment/confirm flows in this slice.
- If runtime A/B/C shows ProductVariant.stockQty != SUM(ProductBatch.remainingQty) for the tested variant after void, stop and report instead of patching unrelated stock/reporting logic.