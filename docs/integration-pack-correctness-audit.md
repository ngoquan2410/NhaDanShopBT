# Backend integration pack — correctness audit snapshot

Cross-check with [`backend-integration-pack.md`](backend-integration-pack.md). This file is a **working snapshot**; reconcile after major domain changes.

## Inventory & batches
- `ProductBatch.remainingQty` is stock truth; variant stock is projection after receipt, sale, cancel, adjustment, production.
- POS / labels: barcode `BATCH:{batchId}` for exact-batch sale; receipt labels encode the same.

## Pricing → pending → invoice
- Quote snapshots carry VAT, promo, voucher, shipping, loyalty; confirm flows do not recompute line snapshots incorrectly.
- Line economics: `lineNetRevenue`, `unitCostSnapshot`, COGS, profit; VAT and shipping excluded from category/product revenue per pack.

## Stock adjustment
- Negative adjustments respect `currentAdjustable`; batch-sourced lines reverse with exact trace (no silent FEFO).

## Production
- Output batch cost = weighted raw + overhead / qty; output expiry = min(raw expiry). `recipe_code` column typed for text search (guard migration).

## Reports
- Inventory movement report reconciles with batch sums; revenue/profit reports use persisted line net revenue, not gross with VAT.

## Tests
- Run focused integration tests under `Slice6*`, `Slice7*`, `Slice8*`, `InvoiceBatch*`, `BatchExpiry*`, `Production*` when touching these areas.
