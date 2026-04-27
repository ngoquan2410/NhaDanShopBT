# Post ProductBatch Status Checkpoint — Local

Date: 2026-04-27

## Summary

**PASS:** ProductBatch status initiative Slices 0-6 are complete in the local backend checkpoint.

- Latest local Flyway checkpoint: **V18**.
- Slice 6B live HTTP + Postgres gap-close: **PASS**.
- `docs/backend-integration-pack.md` addendum updated with the current local backend baseline.
- This checkpoint is local-only and documentation-only.

## Completed Changes

- **V18 ProductBatch status:** `ProductBatch.status` is present with `active`, `depleted`, `voided`, `blocked`, and `archived`.
- **Sales FEFO sellable predicate:** sale deduction uses the sellable predicate: `remainingQty > 0`, status `active`, non-expired, product active, variant active.
- **InventoryProjection additive `sellableQty`:** `onHand`, `reserved`, and `available` keep current/system semantics; `sellableQty` is additive. SINGLE returns an integer; COMBO returns `null`.
- **StockAdjustment currentAdjustable:** unsourced negative correction uses current-adjustable stock: `remainingQty > 0`, status `active` / `blocked`, no expiry filter, and no product/variant active requirement for negative correction.
- **Receipt void lifecycle:** receipt void/delete behavior was already completed before this checkpoint; void zeroes remaining stock through `StockMutationService` and records `goods_receipt_void` movement when remaining stock exists, while fully consumed void is metadata-only.
- **Combo virtual stock caveat documented:** COMBO variant stock is virtual and must not be compared to physical batch sums.

## Verification

**PASS:** Local verification is complete for the checkpoint.

- `compileJava`: **PASS**.
- Frontend `npm run build`: **PASS**.
- `gradlew test`: **PASS**, 51/51.
- Backend health: **200**.
- Flyway: **V18**, `success=true`.
- Slice 6B live HTTP scenarios: **PASS**.
- Key invariant: voided receipt positive remaining = **0**.
- Key invariant: SINGLE `stockQty` equals positive batch sum.

## Carry-Forward

**GAP / future optional:** ProductBatch status lifecycle sync remains optional and future-scoped.

Potential V19 lifecycle sync, only if UI/reporting starts relying heavily on `ProductBatch.status`:

- `remainingQty = 0` + `active` -> `depleted`.
- batch from voided receipt -> `voided`.
- mutation path sync so future receipt void / sales depletion / stock mutation paths maintain status metadata.

Additional carry-forward notes:

- Explicit `sourceBatch` voided + positive remaining is not live-testable through public API because the public flow cannot create a voided lot with positive remaining; this is covered by test.
- `docs/backend-integration-pack.md` is an untracked local documentation file.

## Guardrails

- No push / merge / deploy.
- No deployment-facing config change.
- EC2 / production unchanged.
- Local-only checkpoint.
- Documentation-only: no Java/TS code changes, no migration, no DB operations, no config/deploy changes.
