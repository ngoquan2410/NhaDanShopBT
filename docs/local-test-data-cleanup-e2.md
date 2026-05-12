# Slice E2 local test-data cleanup policy

Scope: local-only Public Catalog DTO hardening (`E2`). No database reset, no direct SQL delete, and no destructive cleanup are approved for this slice.

## Known automation/test prefixes

- `SLICE_B22_`
- `SLICE_B23_`
- `SLICE_C_`
- `SLICE_D_`
- `SLICE_E_`
- `SLICE_E2_`
- `SLICE_F_`
- `SLICE_G_`
- `E2-VIS-`
- `E2-HIDDEN-`
- `CAT-PUBDTO-`

## E2 fixture cleanup behavior

The Slice E2 Selenium fixture creates only owned category/product rows with `SLICE_E2_`, `E2-VIS-`, and `E2-HIDDEN-` identifiers. Its cleanup is API-safe and limited to those rows:

1. `DELETE /api/products/{id}` for the two products created by the E2 run.
2. `DELETE /api/categories/{id}` for the category created by the E2 run.

If the backend archives instead of physically deleting a product, or if a record has become referenced by history, the row is left in the local DB intentionally for audit/history. This is expected and safer than direct SQL cleanup.

## Records intentionally not cleaned broadly

Do not hard-delete or bulk-delete rows by prefix for receipts, invoices, pending orders, payment events, stock adjustments, product batches, inventory movements, production orders, promotions, vouchers, or loyalty records. These records can carry historical stock/payment/commercial effects and should only be voided/cancelled through existing business APIs when a specific test owns the fixture and the API explicitly supports safe cancellation.

## Owner data protection

No owner real data should be deleted by E2 cleanup. Any future cleanup helper must be type-specific, prefix-owned, and API-mediated. If ownership or downstream references are uncertain, leave the data in place and document it in the run evidence instead of deleting it.

