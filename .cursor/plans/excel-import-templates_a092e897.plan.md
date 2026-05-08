---
name: excel-import-templates
overview: Fix Excel import templates and UI download entry points while aligning isSellable-aware price validation across product and receipt import flows. The plan keeps receipt batch cost guards intact and scopes stricter sellable pricing only to saleable new catalog variants.
todos:
  - id: ui-template-download-buttons
    content: Add template download buttons and concise modal copy for product and receipt imports
    status: completed
  - id: backend-template-columns
    content: Add product column N and receipt column P isSellable columns to generated backend templates
    status: completed
  - id: product-import-validation
    content: Make product import validation saleable-aware in backend and FE review
    status: completed
  - id: receipt-import-validation
    content: Keep receipt unitCost guard and add saleable-aware sellPrice guard for new variants
    status: completed
  - id: tests-and-selenium
    content: Add/adjust backend, FE, and Selenium coverage for templates and validation guards
    status: completed
isProject: false
---

# Excel Import Template And Validation Plan

## Scope
- Backend templates in `[NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelTemplateService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelTemplateService.java)`.
- Product import backend validation in `[NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)`.
- Receipt import backend validation in `[NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)`.
- FE import modals in `[nha-dan-pos-c091ee5b/src/components/shared/ImportPreviewDialog.tsx](nha-dan-pos-c091ee5b/src/components/shared/ImportPreviewDialog.tsx)` and `[nha-dan-pos-c091ee5b/src/components/shared/ReceiptImportPreviewDialog.tsx](nha-dan-pos-c091ee5b/src/components/shared/ReceiptImportPreviewDialog.tsx)`.
- FE review validation in `[nha-dan-pos-c091ee5b/src/components/shared/ProductImportReview.tsx](nha-dan-pos-c091ee5b/src/components/shared/ProductImportReview.tsx)` and receipt review validation in `[nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx)`.
- FE parser tests in `[nha-dan-pos-c091ee5b/src/test/excelImportSlice5.test.ts](nha-dan-pos-c091ee5b/src/test/excelImportSlice5.test.ts)` plus Selenium coverage under `[nha-dan-pos-c091ee5b/automation/selenium/specs](nha-dan-pos-c091ee5b/automation/selenium/specs)`.

## Current Findings
- Backend endpoints already exist:
  - `GET /api/products/template` → `template_import_san_pham.xlsx`.
  - `GET /api/receipts/template` → `template_import_phieu_nhap_kho.xlsx`.
- FE has `downloadAdminBlob()` in `[nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts](nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts)`, so no new download infrastructure is needed.
- Product parser already reads column `N` as `isSellable`, but product template currently says **13 columns A-M** and omits `N`.
- Receipt parser already reads column `P` as `isSellable`, but receipt template currently says **15 columns A-O** and omits `P`.
- Product FE review currently blocks `sellPrice === 0` and `costPrice === 0` for all rows, including `isSellable=false`, which conflicts with the desired NVL/non-saleable workflow.

## Implementation Steps

1. Add template download buttons in import modals
- In `ImportPreviewDialog.tsx`:
  - Import `Download` icon and `downloadAdminBlob`.
  - Add button `Tải template Excel` calling `downloadAdminBlob('/api/products/template', 'template_import_san_pham.xlsx')`.
  - Replace hardcoded text `Copy of template_import_san_pham (5).xlsx` with short neutral guide: `Tải template, điền dữ liệu, rồi upload để review.`
- In `ReceiptImportPreviewDialog.tsx`:
  - Add equivalent button calling `downloadAdminBlob('/api/receipts/template', 'template_import_phieu_nhap_kho.xlsx')`.
  - Replace hardcoded receipt template filename and long guide with the same short wording.

2. Update backend Excel templates
- Product template (`buildProductTemplate`):
  - Change layout/title/merge/autofilter from A-M to A-N.
  - Add header `N: Ban hang? / isSellable`.
  - Add sample values, e.g. saleable rows `TRUE`, and at least one NVL/non-saleable sample `FALSE` with `Gia ban=0`, `Gia von=0` if useful.
  - Update guide sheet: document accepted values `TRUE/FALSE`, `co/khong`, `ban/nguyen lieu/raw`; blank defaults to `TRUE`.
  - Update guide wording for pricing: price > 0 only when `N` is saleable; non-saleable/NVL may use 0.
- Receipt template (`buildReceiptTemplate`):
  - Change sheet title/header from A-O to A-P.
  - Add header `P: Ban hang? / isSellable` and style as optional/sellability column.
  - Include sample values and guide note; blank defaults to `TRUE`.
  - Preserve `E: Gia nhap (*)` as required and > 0.

3. Align product import validation across backend and FE
- Backend `ExcelImportService.parseSheet`:
  - Keep negative price errors for both prices.
  - Add saleable-aware rule after parsing `isSellable`:
    - If `ImportSellableParser.defaultTrue(isSellable)` is `true`, require `costPrice > 0` and `sellPrice > 0`.
    - If false, allow `0` or blank/null to become `0`, but still reject negative values.
  - Update class comments from `Gia von (*)`, `Gia ban (*)`, `> 0` to conditional language.
- FE `ProductImportReview.validateDraft`:
  - If `variant.isSellable !== false`, `sellPrice <= 0` and `costPrice <= 0` are errors.
  - If `variant.isSellable === false`, `0` is allowed, negative still errors.
  - Preserve existing warning `Giá bán < giá vốn` only when both prices are > 0.

4. Apply similar receipt import guard without weakening batch cost
- Backend `ExcelReceiptImportService`:
  - Keep `cost/unitCost` as required `> 0` for every receipt line because it creates physical batch cost and impacts COGS/reporting.
  - For new product/variant creation from receipt Excel, if the resolved new variant is saleable (`isSellable` default true), require `sellPrice > 0`; if `isSellable=false`, allow `sellPrice=0`.
  - Do not require `sellPrice > 0` when updating existing variant unless current behavior already creates/overwrites sale price; avoid changing shipped receipt-update semantics unexpectedly.
- FE `GoodsReceiptCreate.validateLine`:
  - Keep `unitCost <= 0` as error.
  - Add/adjust saleable-aware `sellPrice` validation for new product/variant rows only:
    - `isSellable !== false && sellPrice <= 0` → error.
    - `isSellable === false && sellPrice === 0` → allowed.

5. Guardlist: do not break other features
- API contract guard:
  - Do not change core `ProductVariantRequest` DTO validation (`@DecimalMin("0.00")`) globally; this keeps existing API compatibility for manual admin CRUD, tests, and callers outside Excel import.
  - Do not change product/variant create/update endpoint paths, request field names, or response DTOs.
  - Do not change auth/session behavior for downloads; use existing `downloadAdminBlob()` so refresh-token and expired-session handling stay consistent.
- POS/storefront guard:
  - Do not change POS scan, quote, invoice, storefront catalog, cart, or checkout logic.
  - Do not change existing sellability gates; `isSellable=false` remains hidden/blocked from sales.
  - Do not introduce a runtime sales fallback that silently converts price `0` to another value.
- Inventory/COGS/reporting guard:
  - Do not relax receipt `unitCost > 0` validation, because receipt import creates physical batches and drives FEFO COGS/profit/reporting.
  - Do not change stock mutation, batch allocation, FEFO deduction, receipt void/delete, stock adjustment, production, invoice cancel, COGS, revenue, or profit services.
  - Do not change historical invoice/commercial snapshots or report formulas.
- Import compatibility guard:
  - Preserve old templates compatibility: product files without column N and receipt files without column P default to `isSellable=true`.
  - Preserve blank `isSellable` default as `true`, so saleable rows without explicit column still require positive prices.
  - Keep accepted sellability tokens centralized through `ImportSellableParser`; do not duplicate divergent token parsing in services.
  - Keep product import and receipt import rules separate: product import is catalog staging; receipt import creates stock/batches.
- UI/UX guard:
  - Avoid hardcoding local file names in UI copy.
  - Do not remove existing upload/review flow or staging behavior; only add download CTA and shorten the guide copy.
  - Do not block review navigation for warning-only rows; only actual validation errors should disable save/import.
- Test/regression guard:
  - Existing critical-watchlist, admin-ops, and full Selenium scopes must remain runnable.
  - Add targeted assertions for the new template buttons and isSellable validation, but do not weaken existing receipt/stock/commercial assertions.

## Done Criteria
- Product import modal shows a `Tải template Excel` button and no longer mentions `Copy of template_import_san_pham (5).xlsx`.
- Receipt import modal shows a `Tải template Excel` button and no longer mentions `template_import_phieu_nhap_kho- Bánh tráng Tìn Tìn.xlsx`.
- Downloaded product template contains column `N: Ban hang? / isSellable` and guide explains saleable pricing vs NVL pricing.
- Downloaded receipt template contains column `P: Ban hang? / isSellable` and guide keeps `Gia nhap` required > 0.
- Product import:
  - `isSellable=true` or blank + `sellPrice=0` or `costPrice=0` is blocked.
  - `isSellable=false` + `sellPrice=0` and `costPrice=0` is allowed.
  - Negative price remains blocked in all cases.
- Receipt import:
  - `unitCost=0` remains blocked.
  - New saleable variant with `sellPrice=0` is blocked.
  - New non-saleable variant with `sellPrice=0` is allowed if `unitCost > 0`.
- Existing Selenium/critical watchlist remains green.
- Guardlist is verified:
  - Manual product CRUD still accepts zero price where it did before.
  - POS/storefront sale flow remains gated by `isSellable` and does not sell `isSellable=false`.
  - Receipt import still rejects `unitCost=0`.
  - Existing old-format Excel files still parse with default `isSellable=true`.

## Test Plan
- Backend/unit or integration:
  - Add/extend template assertions to verify product column N and receipt column P exist in generated workbooks.
  - Add/extend `ExcelImportService` tests for saleable/non-saleable price validation.
  - Add/extend `ExcelReceiptImportService` tests for `unitCost > 0` and saleable-aware new variant `sellPrice`.
- Frontend unit tests:
  - Extend `excelImportSlice5.test.ts` for product column N parsing if needed (already partially covered).
  - Add validation-focused tests for product import review if test harness exists; otherwise cover via Selenium.
- Selenium automation:
  - Add to `admin-ops-catalog.spec.mjs` or a focused import spec:
    - Open product import modal, assert `Tải template Excel` exists, click it, and verify `.xlsx` download artifact appears or at minimum no UI error and modal remains usable.
    - Assert guide text is concise and does not include `Copy of template_import_san_pham`.
  - Add to receipt/inventory spec:
    - Open receipt import modal, assert download button exists, click it, verify download/no UI error.
    - Assert old hardcoded file name is absent.
  - Add parser/import review scenario if practical:
    - Upload generated XLSX fixture with `isSellable=false` and zero prices; assert review is not error.
    - Upload saleable zero-price row; assert review blocks save.

## Rollback Plan
- If stricter saleable pricing blocks legitimate catalog staging, revert only validation rules while keeping template download buttons and cột `isSellable`, because template/download are additive and backward compatible.