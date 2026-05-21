# Revenue / Profit / Date / Shipping Fix Plan

## 1. Overview

This plan covers three scoped business behavior fixes/enhancements for NhaDan Shop:

1. Harden future-date selection for the Invoice page and Goods Receipt / Phiếu nhập page only.
2. Fix Profit weekly/monthly grouping clamp behavior, verify Revenue total grouping, and add a category revenue time-series line/area chart.
3. Add a configurable local shipping override for Mỏ Cày before calling GHN.

### Current assumptions

- `C:\Work\NhaDanShopBT\NhaDanBusinessTruth` is the business logic source of truth and overrides current code behavior when they conflict.
- Backend historical invoice/reporting data must be read from persisted snapshots/line financial fields, not recalculated from current catalog state.
- Existing frontend uses React/TypeScript under `nha-dan-pos-c091ee5b`.
- Existing backend uses Spring Boot/Java under `NhaDanShop`.
- Existing Selenium tests live under `nha-dan-pos-c091ee5b/automation/selenium/specs`.
- Final business decision for Task 2C: implement the proper persisted invoice-line category snapshot strategy; do not use current `product.category` as historical category truth.
- Final business decision for Task 2C default category chart: backend computes Top 10 + “Khác” from persisted invoice-line category snapshot revenue; frontend renders backend response.
- Final business decision for Task 3: implement Admin-editable local Mỏ Cày shipping rules now, with default fee `0đ` and ETA `1 day`.

### Out of scope

- No Production Recipe UI changes.
- No product revenue table behavior changes.
- No broad report refactor.
- No global date-picker behavior changes for unrelated pages.
- No GHN integration removal.
- No source-code implementation in this planning step.
- No application tests or Selenium specs changed in this planning step.

## 2. Business Truth Impact Analysis

### Task 1: Invoice / Goods Receipt Future Date Hardening

#### Relevant rules from `C:\Work\NhaDanShopBT\NhaDanBusinessTruth`

- Goods Receipt backend is confirmed-on-create.
- Receipt-derived reports must preserve historical truth and exclude voided receipts where appropriate.
- Invoice reports filter completed invoices.
- Historical snapshots must remain readable even if master data changes/deletes/archives.
- UI must not recompute historical invoice/pending/profit totals from current catalog/promotion/loyalty/recipe/product price.

#### Does this change touch invoice/profit/revenue/shipping snapshot logic?

- It touches Invoice and Goods Receipt list filter inputs only.
- It must not mutate invoice, receipt, quote, pending, profit, revenue, shipping, or stock snapshots.
- It must not change API contracts unless later investigation proves a backend guard is required.

#### Compliance notes

- Proposed behavior is compliant if it only prevents invalid future filter bounds in the two scoped list pages.
- Today remains selectable because “future” means strictly after local today.
- Quick filters remain compliant when they resolve to local today or earlier.
- This task does not alter historical records or reporting definitions.

#### Risks if implemented incorrectly

- A global date input change could break expiry, promotion, voucher, import, production, or other legitimate future-date flows.
- Clamping date state globally could silently alter unrelated filters.
- Rejecting today would violate the requirement.
- Changing backend receipt/invoice contracts could create unnecessary regressions.

#### Must not do

- Must not modify global `DateInput` semantics to affect unrelated pages.
- Must not change promotion/voucher/product/import/expiry date pickers.
- Must not alter invoice or receipt persistence.
- Must not recalculate invoice totals.
- Must not change receipt lifecycle.
- Must not break mobile/responsive layout.

#### Business truth task answers

1. Does this change touch any business truth rule?  
   Yes, indirectly: invoice/receipt historical visibility and report/filter access.
2. Which truth rule is relevant?  
   Snapshot/history rules, receipt lifecycle rules, invoice report filtering rules.
3. Is the proposed behavior compliant?  
   Yes, if scoped to UI date filters and optionally defensive query normalization for these pages only.
4. What must be avoided?  
   Avoid mutating historical snapshots, changing receipt/invoice semantics, or changing global date behavior.

#### Status

- Not blocked.

---

### Task 2A: Profit Grouping Clamp

#### Relevant rules from `C:\Work\NhaDanShopBT\NhaDanBusinessTruth`

- Profit report is based on persisted invoice item line snapshots.
- Quote/pending/invoice/profit use backend snapshots as source of truth.
- UI must not recompute historical invoice/pending/profit totals from current catalog, promotion, loyalty, recipe, or product price.
- Do not recompute invoice/pending/profit cũ from current promotion, recipe, product price, or batch cost.
- VAT is excluded from revenue/profit.
- Shipping is invoice-level bucket.
- Product/category reports use persisted line net revenue/profit:
  - revenue = sum(lineNetRevenue)
  - COGS = sum(lineCOGS)
  - profit = sum(lineNetRevenue - lineCOGS)
- Cancelled invoices excluded.

#### Does this change touch invoice/profit/revenue/shipping snapshot logic?

- It touches profit report aggregation windows.
- It must continue using persisted invoice item financial fields via backend repositories/services.
- It must not change invoice snapshots or source financial definitions.

#### Compliance notes

- Proposed clamp behavior is compliant because it narrows aggregation to selected `from/to`.
- Backend should compute each period using:
  - `effectiveStart = max(bucketStart, from)`
  - `effectiveEnd = min(bucketEnd, to)`
- Existing profit calculation using persisted line fields must remain unchanged.
- Adding yearly grouping is compliant only if implemented using the same persisted line snapshot logic and bounded `from/to`.

#### Risks if implemented incorrectly

- Aggregating from calendar week/month start before selected `from` includes out-of-range historical data.
- Recomputing profit from current product price/cost violates business truth.
- Including shipping/VAT in profit violates business truth.
- Frontend-side recomputation from product tables violates source-of-truth rules.

#### Must not do

- Must not calculate profit in UI from current catalog/product data.
- Must not include cancelled invoices.
- Must not include VAT in profit.
- Must not include or allocate shipping into merchandise profit.
- Must not use current product/category cost/price for historical invoices.
- Must not change persisted invoice snapshot semantics.

#### Business truth task answers

1. Does this change touch any business truth rule?  
   Yes, directly: profit report source and historical snapshot rules.
2. Which truth rule is relevant?  
   Profit report must use persisted invoice item snapshots; VAT/shipping excluded; cancelled invoices excluded.
3. Is the proposed behavior compliant?  
   Yes, if only period bounds are clamped and existing persisted line financial fields remain the source.
4. What must be avoided?  
   Avoid frontend recalculation, current catalog/cost lookup, VAT/shipping inclusion, and invoice snapshot mutation.

#### Status

- Not blocked.

---

### Task 2B: Revenue Total Grouping Verification

#### Relevant rules from `C:\Work\NhaDanShopBT\NhaDanBusinessTruth`

- Revenue/product/category report must not use current catalog price.
- VAT excluded from revenue/profit.
- Shipping fee/discount/net is invoice-level bucket.
- Shipping excluded from product/category revenue/profit.
- Product/category reports use persisted line net revenue/profit.
- Cancelled invoices excluded.
- Report export must call backend `.xlsx`, not fake success.

#### Does this change touch invoice/profit/revenue/shipping snapshot logic?

- It touches total revenue report verification and possibly backend aggregation if an out-of-range grouping bug is found.
- If only clamp logic changes, it does not change source financial semantics.
- If revenue meaning is changed, that would touch business definition and must be reviewed carefully.

#### Verified current-state findings

- `NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java` already has filtered grouping helpers:
  - `buildDailyRowsFiltered`
  - `buildWeeklyRowsFiltered`
  - `buildMonthlyRowsFiltered`
  - `buildYearlyRowsFiltered`
- `buildWeeklyRowsFiltered` and `buildMonthlyRowsFiltered` already compute effective bucket bounds from `from/to`.
- `buildYearlyRowsFiltered` also clamps yearly buckets by `from/to`.
- `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java` has `dailyRevenue` using `SUM(i.totalAmount - COALESCE(i.discountAmount, 0))`.
- That query needs business-truth review because `totalAmount` may include VAT and/or shipping depending on invoice semantics.

#### Compliance notes

- Grouping clamp appears already compliant for Revenue total buckets based on inspected code.
- Do not change Revenue total grouping if the only concern is date-window clamping.
- Potential semantic issue around total revenue definition must be documented as a follow-up business-truth risk, but it must not block current Revenue grouping clamp verification/fix.
- Revenue total semantic correction is out of scope for this implementation.
- Do not change the Revenue total query from `totalAmount` to another definition unless a separate approved task is created.
- Category/product revenue must remain persisted line net revenue and must exclude shipping/VAT.

#### Risks if implemented incorrectly

- Changing Revenue total semantics without explicit business approval may alter historical reports.
- Leaving a `totalAmount - discountAmount` query that includes VAT may conflict with “VAT excluded from revenue/profit.”
- Treating shipping as merchandise revenue could violate invoice-level bucket truth.
- Fixing grouping by querying full weeks/months directly could reintroduce out-of-range records.

#### Must not do

- Must not change product revenue table behavior.
- Must not silently change Revenue total definition.
- Must not include VAT in revenue/profit if business truth applies to this report.
- Must not include shipping in product/category revenue.
- Must not recompute historical revenue from current catalog price.
- Must not change export behavior unless the backend data contract changes deliberately.

#### Business truth task answers

1. Does this change touch any business truth rule?  
   Yes, directly: revenue reporting and historical snapshot rules.
2. Which truth rule is relevant?  
   VAT excluded, cancelled invoices excluded, reports must use backend/persisted financial fields.
3. Is the proposed behavior compliant?  
   Clamp verification/fix is compliant and non-blocking. Any Revenue total semantic correction is out of scope for this implementation and requires a separate approved task.
4. What must be avoided?  
   Avoid silent Revenue total meaning changes, VAT/shipping leakage, and current catalog recalculation.

#### Status

- Clamp portion not blocked.
- Revenue total semantic correction is documented as a follow-up risk and is explicitly out of scope; it must not block current Revenue grouping verification/fix.

---

### Task 2C: Category Revenue Line/Area Time-Series

#### Relevant rules from `C:\Work\NhaDanShopBT\NhaDanBusinessTruth`

- Product/category reports use persisted line net revenue/profit.
- Category revenue = `sum(lineNetRevenue)`.
- Profit = `sum(lineNetRevenue - lineCOGS)`.
- Shipping is invoice-level bucket.
- Shipping must not be allocated into product/category revenue/profit.
- VAT excluded from revenue/profit.
- UI must not recompute historical totals from current catalog, promotion, loyalty, recipe, or product price.
- Historical snapshots must remain readable even if master data changes/deletes/archives.
- Cancelled invoices excluded.

#### Does this change touch invoice/profit/revenue/shipping snapshot logic?

- It touches category revenue reporting.
- It must aggregate persisted invoice item financial fields.
- It must not mutate invoice snapshots.
- It must not derive historical revenue from current product price, current promotions, or current category assignments.
- Final decision requires persisted invoice-line category snapshots for category time-series; rows without reliable snapshot/backfill must be handled as `Unknown/Legacy Category`.

#### Compliance notes

- New endpoint is compliant if it aggregates persisted invoice item line net revenue only.
- Shipping and VAT must be excluded.
- It should not break existing `GET /api/revenue/by-category`.
- Default Top 10 + “Khác” behavior must be based on persisted category revenue within selected range.
- Category time-series must use persisted invoice-line category snapshot fields.
- Current `product.category` may be wrong for historical invoices if category assignments changed after the invoice was created.
- Existing code has no such fields yet; implementation must add them and migrate/backfill or use `Unknown/Legacy Category` for legacy rows.
- Current `product.category` is not an approved fallback for historical category time-series.
- Do not silently use current catalog category as historical truth.

#### Risks if implemented incorrectly

- Joining current `item.product.category` for old invoices may misclassify historical categories if master data changed.
- Using current product price or promotions violates snapshot truth.
- Allocating shipping or free-shipping discount to categories violates bucket rules.
- Replacing existing category totals API could break exports or existing UI behavior.
- Doing Top 10 aggregation in frontend from insufficient backend data can create inconsistent totals; final decision is backend computes Top 10 + “Khác” and frontend renders the backend response.
- Silently using current category master data can make historical category charts disagree with the invoice-line snapshot truth.

#### Must not do

- Must not break existing category totals API.
- Must not change product revenue table behavior.
- Must not use current product price/cost/promotion to calculate old invoice revenue.
- Must not include shipping fee, shipping discount, or VAT.
- Must not fetch on hover.
- Must not repeatedly fetch unchanged data.
- Must not lose historical readability when category master data changes.
- Must not silently use current `product.category` as historical category truth.

#### Business truth task answers

1. Does this change touch any business truth rule?  
   Yes, directly: category revenue reporting.
2. Which truth rule is relevant?  
   Category revenue must use persisted line net revenue; VAT/shipping excluded; no current catalog recomputation.
3. Is the proposed behavior compliant?  
   Yes, because the final plan requires persisted invoice item financial fields and persisted invoice-line category identity/name snapshots, with `Unknown/Legacy Category` for rows that cannot be reliably backfilled.
4. What must be avoided?  
   Avoid current catalog-derived revenue/category reassignment, shipping/VAT inclusion, and frontend financial recomputation.

#### Status

- UNBLOCKED with Proper snapshot implementation.
- Final business decision selects the proper historical implementation: add persisted invoice-line category snapshot fields and use those fields for category time-series.
- Relevant code inspection found no existing persisted invoice-line category ID/name/code snapshot fields in `SalesInvoiceItem`; implementation must add them before category time-series is released.
- Existing category revenue uses current catalog join `item.product.category.id/name` in `SalesInvoiceRepository.revenueByCategory`; that current-category join is not acceptable for historical category time-series.
- Historical invoice items without category snapshots must be handled explicitly:
  - Prefer migration/backfill if reliable historical category can be inferred.
  - If reliable backfill is not possible, group/display old rows as `Unknown/Legacy Category`.
- Do not implement a fallback current-category chart for this requirement.

---

### Task 3: Local Shipping Override For Mỏ Cày

#### Relevant rules from `C:\Work\NhaDanShopBT\NhaDanBusinessTruth`

- Shipping fee is backend-owned.
- Storefront quote uses `ShippingQuoteService`.
- Storefront quote must use backend shipping quote; do not trust client shipping snapshot.
- If missing province/district/ward, shipping quote status is incomplete.
- GHN carrier failure can fallback zone if config has rule.
- `rawAddress` is only for display/admin/shipper reference, not fee calculation.
- Quote-backed pending/invoice must use quote snapshot and must not recalculate catalog price.
- Free shipping only affects shipping discount.
- Free shipping does not reduce merchandise revenue/profit.
- Shipping is invoice-level bucket.
- Shipping must not be allocated into product/category revenue/profit.

#### Does this change touch invoice/profit/revenue/shipping snapshot logic?

- It touches backend shipping quote source and fee.
- It affects quote/pending/invoice shipping snapshot values downstream.
- It must not affect merchandise revenue/profit.
- It must not change GHN flow for non-local destinations.

#### Compliance notes

- A local override before GHN is compliant because backend remains the source of shipping quote.
- Matched Mỏ Cày destinations should return `source = local_rule` or equivalent if DTO/types support it.
- Existing DTO supports `source` and `zoneCode`; frontend type currently allows `"zone_fallback" | "carrier_api" | "client_snapshot"` and must be extended if `local_rule` is returned.
- Matching must use province/district/ward codes first and normalized Vietnamese names only as fallback.
- `rawAddress`, street, house text, or keywords like “UBND” must not be used for matching.
- Free shipping discounts must continue to affect only shipping discount buckets.
- Local rule must support fee and ETA configuration.
- Final business decision: default Mỏ Cày local rule fee is `0đ`, ETA is `1 day`, and Admin editability is required now.
- Inspected shipping settings do not currently support district/ward local matchers; implementation must extend shipping settings model/DTO/admin UI so the Mỏ Cày rule is editable and stored in one source of truth.
- Local Mỏ Cày override remains an invoice-level shipping bucket change only; it must not affect merchandise revenue/profit.

#### Risks if implemented incorrectly

- Calling GHN before local override defeats the requirement and causes wrong fees.
- Matching based on street/raw text can produce false positives.
- Hardcoding local logic inside controller creates duplication and future maintenance risk.
- Recalculating shipping at order creation instead of using quote snapshot can break quote-backed pending/invoice truth.
- Applying local shipping as merchandise discount would corrupt revenue/profit.

#### Must not do

- Must not remove GHN integration.
- Must not alter GHN behavior for non-local addresses.
- Must not trust client-provided shipping snapshot for storefront.
- Must not allocate shipping fee/discount to product/category revenue.
- Must not use `rawAddress` or street text for fee matching.
- Must not hardcode matching logic in controller.
- Must not hardcode the local fee in multiple places.
- Must not require DB migration unless existing settings/config patterns cannot support it.

#### Business truth task answers

1. Does this change touch any business truth rule?  
   Yes, directly: shipping quote and quote/pending/invoice snapshot rules.
2. Which truth rule is relevant?  
   Backend-owned shipping quote; quote snapshot used downstream; free shipping and shipping bucket separation.
3. Is the proposed behavior compliant?  
   Yes, if override is inside backend quote flow before GHN and downstream orders persist quote snapshot unchanged.
4. What must be avoided?  
   Avoid client-side shipping trust, raw-address matching, GHN regression, merchandise revenue/profit changes, and order-time recalculation.

#### Status

- Not blocked for architecture.
- UNBLOCKED by final business decision for implementation.
- Relevant code inspection shows existing shipping settings can configure fee/ETA by province-level zone only, not district/ward-level local matchers needed for Mỏ Cày.
- Required technical path: extend shipping settings DTO/model/admin UI to support local shipping rules with province/district/ward code/name matchers, fee, ETA, label, zoneCode, and enabled flag.
- Default configured rule: `zoneCode = LOCAL_MO_CAY`, label `Mỏ Cày local delivery`, fee `0`, ETA `1 day`, enabled `true`.

## 3. Relevant Code Areas To Inspect

### Frontend areas

- [ ] `nha-dan-pos-c091ee5b/src/pages/admin/Invoices.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/components/shared/PeriodFilter.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/components/shared/DateInput.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx`
- [ ] `nha-dan-pos-c091ee5b/src/services/adminBackend.ts`
- [ ] `nha-dan-pos-c091ee5b/src/services/types.ts`
- [ ] Checkout/storefront shipping quote components and adapters
- [ ] `nha-dan-pos-c091ee5b/src/services/shipping/ShippingService.ts`
- [ ] `nha-dan-pos-c091ee5b/src/services/adapters/remote/GhnShippingAdapter.ts`
- [ ] `nha-dan-pos-c091ee5b/src/services/adapters/remote/HybridShippingAdapter.ts`

### Backend areas

- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/controller/RevenueController.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/controller/ReportController.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/service/ReportService.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/dto/RevenueByCategoryDto.java`
- [ ] Add/inspect DTO for category revenue series
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingQuoteService.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingSettingsService.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingQuoteRequest.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingQuoteResponse.java`
- [ ] `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingAddressDto.java`
- [ ] Quote/pending/order services that persist shipping quote snapshot

### Test areas

- [ ] `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-sales-invoices.spec.mjs`
- [ ] `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-inventory-receipt-ui.spec.mjs`
- [ ] `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-reports.spec.mjs`
- [ ] `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-reports-export-ui.spec.mjs`
- [ ] Storefront checkout Selenium specs
- [ ] Backend report integration tests
- [ ] Backend shipping quote tests
- [ ] Frontend unit tests for report adapters if present

## 4. Current State Analysis

### Verified findings

- [ ] `NhaDanBusinessTruth` reviewed.
  - Key verified rules include backend snapshots as source of truth, no historical recomputation from current catalog/promotion/loyalty/recipe/product price, product/category persisted line net revenue/profit, shipping invoice-level bucket, VAT excluded from revenue/profit, storefront quote uses backend shipping quote, and quote-backed pending/invoice uses quote snapshot.

- [ ] Invoice date filter inspected.
  - `nha-dan-pos-c091ee5b/src/pages/admin/Invoices.tsx` uses `PeriodFilter` with `disableFutureDates`.
  - `periodToInvoiceDateRange` resolves quick filters to local today for `to`.
  - Custom range currently returns `period.from`/`period.to` without additional page-level clamp.

- [ ] Goods Receipt date filter inspected.
  - `nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx` uses `PeriodFilter` with `disableFutureDates`.
  - `periodToReceiptDateRange` resolves quick filters to local today for `to`.
  - Custom range currently returns `period.from`/`period.to` without additional page-level clamp.

- [ ] Shared period date filter inspected.
  - `nha-dan-pos-c091ee5b/src/components/shared/PeriodFilter.tsx` has opt-in `disableFutureDates`.
  - It sets `max` to local today when enabled.
  - It rejects manually entered future values in `onChange`.
  - Because this is shared, implementation should remain opt-in and scoped.

- [ ] Global `DateInput` inspected.
  - `nha-dan-pos-c091ee5b/src/components/shared/DateInput.tsx` currently disallows future dates by default and has `allowFuture`.
  - Guardlist says not to modify global date behavior for this task.

- [ ] Revenue total grouping inspected.
  - `RevenueService.getTotalRevenue` uses filtered daily/weekly/monthly/yearly builders.
  - `buildWeeklyRowsFiltered`, `buildMonthlyRowsFiltered`, and `buildYearlyRowsFiltered` clamp effective bucket bounds by `from/to`.
  - Current Revenue grouping likely already satisfies date clamp acceptance criteria.
  - `SalesInvoiceRepository.dailyRevenue` uses `SUM(i.totalAmount - COALESCE(i.discountAmount, 0))`; this needs business definition review for VAT/shipping inclusion.

- [ ] Category revenue totals inspected.
  - `RevenueService.getRevenueByCategory` currently returns total category distribution for the whole range.
  - It calls `SalesInvoiceRepository.revenueByCategory`.
  - Query aggregates `COALESCE(item.lineNetRevenue, item.quantity * item.unitPrice)` and COGS.
  - Query groups by `item.product.category.id/name`, which may use current category master data unless invoice item has persisted category snapshots elsewhere.

- [ ] Blocker 1 inspected: category historical snapshot availability.
  - Relevant files inspected:
    - `NhaDanShop/src/main/java/com/example/nhadanshop/entity/SalesInvoice.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/entity/SalesInvoiceItem.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/dto/SalesInvoiceItemResponse.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceService.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`
    - `NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql`
    - `NhaDanShop/src/main/resources/db/migration/V25__slice7_commercial_allocation.sql`
  - Finding: `SalesInvoiceItem` persists `product`, `variant`, quantity, unit price/cost snapshots, line allocation fields, `lineNetRevenue`, VAT line fields, combo fields, and batch allocations; it does not define category ID/name/code snapshot fields.
  - Finding: migrations for `sales_invoice_items` add product/variant references and commercial allocation fields, but no category snapshot columns were found.
  - Finding: invoice creation paths in `InvoiceService` set `item.setProduct(product)` and `item.setVariant(variant)` plus price/cost/commercial snapshots, but do not set category snapshot fields because such fields are absent.
  - Finding: `SalesInvoiceItemResponse` and `DtoMapper.toResponse` expose current `productCode/productName` and `variantCode/variantName` by dereferencing `item.getProduct()` / `item.getVariant()`; these are not persisted invoice-line name/code snapshots.
  - Finding: existing `SalesInvoiceRepository.revenueByCategory` groups by `item.product.category.id` and `item.product.category.name`, i.e. current catalog category relationship.
  - Answer 1: invoice items do not persist `categoryId`, `categoryName`, or `categoryCode` snapshot fields. No persisted product/variant name/code snapshot fields were verified either; only product/variant FK references and financial snapshots are persisted on invoice items.
    - Decision status: UNBLOCKED by final business decision for Task 2C category time-series using Proper snapshot implementation.
  - Business-truth risk: category assignments changed after invoice creation can make current `product.category` reporting misrepresent historical category revenue, even if line revenue itself is persisted correctly.
    - Required resolution: add invoice-line category snapshot fields, capture them at invoice creation time, and use them for category time-series grouping.
    - Historical handling: migrate/backfill reliable category snapshots where possible; otherwise group old rows as `Unknown/Legacy Category`.

- [ ] Profit grouping inspected.
  - `ReportService.getWeeklyReport` starts at previous-or-same Monday but passes `weekStart` to `getProfitReport`; this can include days before selected `from`.
  - `ReportService.getMonthlyReport` starts at first day of month but passes `monthStart` to `getProfitReport`; this can include days before selected `from`.
  - There is no yearly profit grouping endpoint in `ReportController`.
  - `ProfitReport.tsx` currently supports `daily | weekly | monthly` only.

- [ ] Shipping quote flow inspected.
  - `ShippingQuoteService.quote` validates required province/district/ward codes, then calls GHN.
  - Zone fallback is only used after GHN carrier failure.
  - Local override does not appear present in inspected `ShippingQuoteService`.
  - `ShippingQuoteResponse` already includes `source` and `zoneCode`.
  - Frontend `ShippingQuoteSource` type does not currently include `local_rule`.

- [ ] Blocker 2 inspected: local Mỏ Cày fee/ETA/config support.
  - Relevant files inspected:
    - `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingQuoteService.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingSettingsService.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingSettingsDto.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingZoneRuleDto.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/entity/ShippingSettingsRecord.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingQuoteRequest.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingQuoteResponse.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/controller/ShippingController.java`
    - `NhaDanShop/src/main/java/com/example/nhadanshop/service/GhnShippingService.java`
    - `NhaDanShop/src/main/resources/application.properties`
    - `nha-dan-pos-c091ee5b/src/pages/admin/ShippingSettings.tsx`
  - Finding: `ShippingZoneRuleDto` supports `zoneCode`, `label`, `baseFee`, `freeShipThreshold`, `etaDays`, and `provinceCodes` only.
  - Finding: `ShippingSettingsRecord` stores `zoneRulesJson` and `parcelDefaultsJson`; no separate local rule JSON or district/ward matcher field exists.
  - Finding: `ShippingSettingsService.ResolvedZoneRule` preserves only zone code, base fee, threshold, ETA, and province codes.
  - Finding: `ShippingQuoteService.pickZone` matches fallback zones by province code only and is called only after GHN carrier failure.
  - Finding: `ShippingQuoteService.quote` currently calls GHN directly after incomplete-address validation; no local pre-GHN override is present.
  - Finding: `AdminShippingSettings` only lets admins edit province codes, base fee, free threshold, and ETA. It cannot configure district/ward/name matchers for Mỏ Cày.
  - Finding: `application.properties` contains GHN credentials only; no existing local shipping rule properties were found.
  - Answer 1: existing shipping settings support fee and ETA for province-level zones, but do not safely support local district/ward Mỏ Cày matching.
    - Decision status: UNBLOCKED by final business decision for fee/ETA/config strategy.
    - Required path: extend existing shipping settings model/DTO/admin UI to support Admin-editable local shipping rules, not a province-only zone and not a controller hardcode.
    - Default Mỏ Cày rule must be stored/configured as `LOCAL_MO_CAY`, enabled, fee `0`, ETA `1 day`, with province/district/ward matchers.

### Placeholders for later findings

- [x] Verify invoice item entity fields for persisted category ID/name snapshot.
- [ ] Verify whether `SalesInvoice.totalAmount` includes VAT and shipping.
- [ ] Verify checkout/pending/invoice services preserve backend shipping quote snapshot.
- [ ] Verify existing backend integration test conventions for reports.
- [ ] Verify existing Selenium helper APIs for seeding invoices/receipts/orders.
- [ ] Verify old/new administrative address code data for Bến Tre/Vĩnh Long/Mỏ Cày.
- [x] Verify exact configured fee and ETA for local Mỏ Cày delivery with business/product owner: final decision is fee `0đ`, ETA `1 day`.

## 5. Implementation Plan

### Task 1: Invoice / Goods Receipt Future Date Hardening

#### Goal

Prevent future dates from being selected or retained in Invoice and Goods Receipt list filters only, while keeping today and quick filters working.

#### Proposed files/components/services to inspect or change

- `nha-dan-pos-c091ee5b/src/pages/admin/Invoices.tsx`
- `nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx`
- `nha-dan-pos-c091ee5b/src/components/shared/PeriodFilter.tsx`
- Selenium specs:
  - `admin-sales-invoices.spec.mjs`
  - `admin-inventory-receipt-ui.spec.mjs`

#### Implementation steps

- [ ] Keep `PeriodFilter.disableFutureDates` opt-in and do not change unrelated usages.
- [ ] Add page-level sanitization for Invoice `period` state before deriving `dateRange`.
- [ ] Clamp or reject custom `from/to` values strictly greater than local today.
- [ ] Ensure quick filters Today / This week / This month still resolve with today as upper bound.
- [ ] Apply the same page-level sanitization for Goods Receipt `period` state.
- [ ] Decide UX for manual future input: reject and keep previous value, or clamp to today with clear toast.
- [ ] Add stable selectors/test IDs only if required by Selenium automation.
- [ ] Confirm no API contract changes are necessary.
- [ ] Document that future query/state protection is local to these two pages.

#### Guardrails

- Do not modify global `DateInput`.
- Do not change date pickers for promotion/voucher/product/import/expiry flows.
- Do not alter Invoice/Goods Receipt backend contracts unless later proven necessary.
- Do not change invoice/receipt history or totals.
- Do not affect mobile layout.

#### Acceptance criteria

- [ ] Invoice filter cannot select a future date.
- [ ] Invoice filter cannot keep a manually entered future date.
- [ ] Goods Receipt filter cannot select a future date.
- [ ] Goods Receipt filter cannot keep a manually entered future date.
- [ ] Today remains selectable.
- [ ] Other date pickers outside Invoice/Goods Receipt behave exactly as before.

#### Business truth compliance notes

- Compliant because this only restricts invalid filter input.
- Must not mutate invoice/receipt records.
- Must not recompute historical totals.
- Must not change receipt lifecycle.

---

### Task 2A: Profit Grouping Clamp

#### Goal

Ensure Profit weekly/monthly buckets only include selected `from/to` dates. Profit yearly grouping is conditional and must not delay or block the weekly/monthly clamp fix.

#### Proposed files/components/services to inspect or change

- `NhaDanShop/src/main/java/com/example/nhadanshop/service/ReportService.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/controller/ReportController.java`
- `nha-dan-pos-c091ee5b/src/services/adminBackend.ts`
- `nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx`
- Backend profit report tests
- Selenium report specs

#### Implementation steps

- [ ] Update weekly profit loop to compute `effectiveStart = max(weekStart, from)`.
- [ ] Update weekly profit loop to compute `effectiveEnd = min(weekEnd, to)`.
- [ ] Pass effective bounds into `getProfitReport` / `getProfitReportForProducts`.
- [ ] Update monthly profit loop with equivalent effective month bounds.
- [ ] Treat weekly/monthly clamp as must-have and do not block it on yearly grouping.
- [ ] Weekly/monthly clamp can be implemented and shipped even if Profit yearly is deferred.
- [ ] Keep daily profit behavior unchanged.
- [ ] Add `getYearlyReport` only if it stays small, clean, and fits the existing architecture without broad refactor.
- [ ] Defer yearly Profit as follow-up if it requires broad refactor, has unclear business semantics, or requires too many API/UI/test changes.
- [ ] If yearly is added, add `GET /api/reports/profit/yearly`.
- [ ] If yearly is added, update `adminReports.profitSeries` group type to include `yearly`.
- [ ] If yearly is added, update `ProfitReport.tsx` selector and labels to include Year.
- [ ] Add backend tests for weekly/monthly clamp and yearly clamp if implemented.
- [ ] Ensure product-filtered profit uses the same clamp logic.

#### Guardrails

- Do not calculate profit in frontend.
- Do not use current product cost or current product price.
- Do not include VAT in revenue/profit.
- Do not include shipping in merchandise profit.
- Do not alter invoice item snapshots.
- Do not include cancelled invoices.

#### Acceptance criteria

- [ ] Profit weekly bucket starting before `from` only calculates from selected `from`.
- [ ] Profit monthly bucket starting before `from` only calculates from selected `from`.
- [ ] Weekly/monthly clamp is delivered and can ship even if yearly Profit is deferred.
- [ ] Profit yearly bucket, if added, only calculates within `from/to`.
- [ ] Profit daily/weekly/monthly totals do not include data outside `from/to`; yearly is included in this criterion only if implemented.
- [ ] Existing Profit report UI remains responsive and consistent.

#### Business truth compliance notes

- Must continue using persisted `lineNetRevenue` and `lineCOGS` / snapshot-derived line fields.
- Bucket-bound fix is compliant and should not change business definitions.
- Weekly/monthly clamp is must-have; yearly Profit is conditional and non-blocking.
- Any change that uses current catalog, batch cost, or product price is non-compliant.

---

### Task 2B: Revenue Total Grouping Verification

#### Goal

Verify Revenue total grouping respects selected `from/to`; fix only if an actual out-of-range bug remains.

#### Proposed files/components/services to inspect or change

- `NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/controller/RevenueController.java`
- `nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx`
- Backend revenue grouping tests
- Selenium report specs

#### Implementation steps

- [ ] Confirm current `buildWeeklyRowsFiltered` clamps bucket start/end.
- [ ] Confirm current `buildMonthlyRowsFiltered` clamps bucket start/end.
- [ ] Confirm current `buildYearlyRowsFiltered` clamps bucket start/end.
- [ ] Add or update tests proving daily/weekly/monthly/yearly respect `from/to`.
- [ ] Do not change Revenue total grouping if tests confirm current behavior.
- [ ] If a gap is found, use effectiveStart/effectiveEnd logic matching Profit.
- [ ] Separately document whether Revenue total source excludes VAT according to business truth as a follow-up risk.
- [ ] If `dailyRevenue` includes VAT/shipping, document it as a follow-up business decision, not part of this implementation.
- [ ] Do not change the Revenue total query from `totalAmount` to another definition unless a separate approved task is created.
- [ ] Do not touch product revenue totals.

#### Guardrails

- Do not change product revenue table behavior.
- Do not silently change Revenue total meaning.
- Do not include VAT in revenue/profit if business truth applies to this report.
- Do not derive revenue from current product prices.
- Do not change export unless intentionally aligned with backend data contract.

#### Acceptance criteria

- [ ] Revenue total grouping daily/weekly/monthly/yearly respects `from/to`.
- [ ] No regression to current Revenue total numbers except where a real out-of-range bug is fixed.
- [ ] Any discovered Revenue total business-definition mismatch is documented as a follow-up risk and does not block current grouping verification/fix.
- [ ] Revenue total semantic correction is out of scope for this implementation.

#### Business truth compliance notes

- Date clamp verification is compliant.
- Revenue semantic changes must comply with VAT exclusion and snapshot truth, but are out of scope for this implementation.
- Revenue total grouping verification/fix should not be blocked by unresolved `totalAmount` VAT/shipping semantics.

---

### Task 2C: Category Revenue Line/Area Time-Series

#### Goal

Replace/update “Doanh thu theo danh mục” chart with a multi-series line/area chart by period, backed by a new API that preserves existing category totals behavior.

#### Proposed files/components/services to inspect or change

- `NhaDanShop/src/main/java/com/example/nhadanshop/controller/RevenueController.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/service/RevenueService.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java`
- New DTO: category revenue series row
- `nha-dan-pos-c091ee5b/src/services/adminBackend.ts`
- `nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx`
- Category service/list endpoint for filter options
- Selenium report specs

#### Implementation steps

- [x] Verify whether invoice item stores historical category ID/name snapshots.
- [x] Finding: no persisted `categoryId`, `categoryName`, or `categoryCode` invoice-line snapshot fields were found in `SalesInvoiceItem`, invoice item DTOs, invoice creation, or migrations.
- [x] Finding: no persisted invoice-line product/variant name/code snapshot fields were verified; DTOs currently dereference current `Product` / `ProductVariant` relationships for display names/codes.
- [x] Finding: existing `SalesInvoiceRepository.revenueByCategory` groups by current `item.product.category.id/name` while aggregating persisted line revenue.
- [x] Final business decision: Task 2C is UNBLOCKED with Proper snapshot implementation.
- [ ] Add persisted invoice-line category snapshot fields, suggested names:
  - `categoryIdSnapshot`
  - `categoryNameSnapshot`
  - `categoryCodeSnapshot` if category code exists in the catalog model.
- [ ] Add database migration for the new invoice item category snapshot columns.
- [ ] Update invoice creation paths to capture category snapshot fields from the product category at invoice creation/materialization time.
- [ ] Ensure quote-backed invoice materialization preserves quote/invoice snapshot truth and does not recalculate catalog price.
- [ ] Backfill existing historical invoice items if reliable historical category can be inferred.
- [ ] If reliable backfill is not possible for some/all historical rows, group/display those rows as `Unknown/Legacy Category`.
- [ ] Category time-series query must group by persisted invoice-line category snapshot fields, not current `item.product.category`.
- [ ] Existing current category joins are not acceptable for historical category time-series.
- [ ] Do not silently use current `product.category` as historical truth.
- [ ] Add `GET /api/revenue/by-category-series`.
- [ ] Accept `from`, `to`, `period`, and optional `categoryIds`.
- [ ] Aggregate revenue as `sum(lineNetRevenue)` or approved persisted fallback only.
- [ ] Exclude cancelled invoices.
- [ ] Exclude VAT.
- [ ] Exclude shipping fee, shipping discount, and shipping net.
- [ ] Implement daily/weekly/monthly/yearly buckets with effectiveStart/effectiveEnd clamp.
- [ ] Preserve existing `GET /api/revenue/by-category`.
- [ ] Decide implementation scope for existing `GET /api/revenue/by-category`: either migrate it to snapshot fields in the same implementation or explicitly document it as legacy behavior until a follow-up update.
- [x] Final decision: when `categoryIds` is omitted, backend returns Top 10 categories by total category revenue in selected `from/to` plus one synthetic “Khác” series for all remaining categories.
- [ ] Compute Top 10 + “Khác” from persisted invoice-line category snapshot revenue, not current `product.category`.
- [ ] Ensure “Khác” revenue equals the sum of all non-top-10 category revenue in the same selected `from/to` range.
- [ ] When `categoryIds` is provided, backend returns only selected categories and does not add “Khác”.
- [ ] Frontend renders whatever category series the backend returns.
- [x] Final decision: category filter options must allow admin to select categories with zero revenue in the current selected range.
- [ ] Source category filter options from an existing admin category API if it can provide active/admin-visible categories suitable for reporting.
- [ ] If the existing admin category API is unsuitable, add a lightweight revenue report category options endpoint.
- [ ] Do not derive category filter options only from the currently rendered chart series.
- [ ] Admin must be able to filter a category first and then change date/groupBy to inspect trends, even if the category has zero revenue in the initial range.
- [ ] Category filter must support one or multiple categories.
- [ ] Add frontend adapter method for category series.
- [ ] Add category multi-select control separate from existing product filter.
- [ ] Update chart to multi-series line/area visualization.
- [ ] Update chart when `from`, `to`, `groupBy`, or category filter changes.
- [ ] Add empty state when no category revenue data exists.
- [ ] Ensure tooltip shows period label, category name, and VND revenue.
- [ ] Ensure desktop/mobile responsiveness and no overflow.
- [ ] Do not remove Revenue total chart.
- [ ] Do not modify product revenue table behavior.

#### Guardrails

- Do not use current product price or promotion data for old invoices.
- Do not use current `product.category` as historical category truth.
- Do not include shipping/VAT.
- Do not allocate free shipping into merchandise revenue.
- Do not break existing category totals/export.
- Do not fetch on hover.
- Do not repeatedly fetch unchanged data.
- Do not rename unrelated labels.
- Do not alter product table logic.

#### Acceptance criteria

- [ ] Category chart changes when switching Day / Week / Month / Year.
- [ ] Category chart respects `from/to`.
- [ ] Category chart shows one line per category.
- [ ] Category filter shows only selected categories.
- [ ] When no category filter is selected, default mode shows backend-provided Top 10 + “Khác” when more than 10 categories exist.
- [ ] When category filters are selected, backend returns only selected categories and does not add “Khác”.
- [ ] Category filter options include categories with zero revenue in the current selected range.
- [ ] Historical category correctness is preserved: invoices created when a product belonged to Category A still report Category A after the product is moved to Category B.
- [ ] Historical invoice items without reliable category snapshot/backfill appear under `Unknown/Legacy Category`.
- [ ] Revenue/product tables continue to work as before.
- [ ] No visual overflow on mobile.

#### Business truth compliance notes

- Category revenue must aggregate persisted invoice item `lineNetRevenue`.
- Category chart must not use current product price, current promotion, current loyalty, current recipe, or shipping.
- Historical category identity must be preserved through persisted invoice-line category snapshot fields.
- Current `product.category` must not be used as historical truth.

---

### Task 3: Local Shipping Override For Mỏ Cày

#### Goal

Return a configurable local Mỏ Cày shipping quote before GHN is called, while preserving GHN behavior for all non-local destinations.

#### Proposed files/components/services to inspect or change

- `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingQuoteService.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/service/ShippingSettingsService.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingSettingsDto.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingZoneRuleDto.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingQuoteResponse.java`
- `NhaDanShop/src/main/java/com/example/nhadanshop/dto/ShippingAddressDto.java`
- Frontend shipping source types in `nha-dan-pos-c091ee5b/src/services/types.ts`
- Storefront checkout shipping quote flow
- Quote/pending/invoice snapshot persistence services
- Backend shipping tests
- Storefront Selenium specs

#### Implementation steps

- [x] Identify existing persisted shipping settings/config pattern.
- [x] Finding: existing `ShippingSettingsDto` / `ShippingZoneRuleDto` / `ShippingSettingsRecord` can store zone `baseFee` and `etaDays`, but only with `provinceCodes` matchers.
- [x] Finding: existing settings cannot safely model Mỏ Cày district/ward-specific matching without extending the settings model/UI or adding a dedicated backend local rule config.
- [ ] Do not represent Mỏ Cày by a province-only `provinceCodes` zone unless business explicitly accepts applying the local fee to the entire province.
- [x] Final business decision: Task 3 is UNBLOCKED; fee `0đ`, ETA `1 day`, and Admin editability are required now.
- [ ] Extend shipping settings model/DTO/persistence to support local shipping rules.
- [ ] Extend Admin Shipping Settings UI so admins can view/edit local rules now.
- [ ] Define local rule fields: `enabled`, `zoneCode`, `label`, `fee`, `etaDays`, province codes/names, district codes/names, ward codes/names.
- [ ] Add default local Mỏ Cày rule:
  - `enabled = true`
  - `zoneCode = LOCAL_MO_CAY`
  - `label = Mỏ Cày local delivery`
  - `fee = 0`
  - `etaDays = 1`
  - matchers for old/new Mỏ Cày administrative names/codes where available.
- [ ] Persist the default rule in one approved settings/config source; do not duplicate the fee or matchers in multiple places.
- [ ] Admin Shipping Settings UI must allow editing enabled toggle, label, fee, ETA, province matchers, district matchers, and ward matchers.
- [ ] Add matching service/helper used by `ShippingQuoteService`.
- [ ] Match by province/district/ward codes first.
- [ ] Add normalized Vietnamese name fallback.
- [ ] Include old/current administrative names:
  - Bến Tre / Huyện Mỏ Cày Nam / Thị trấn Mỏ Cày
  - Vĩnh Long / Mỏ Cày where current address data uses updated naming
- [ ] Explicitly ignore street/house/raw address text for matching.
- [ ] Call local matching after incomplete-address validation and before GHN quote.
- [ ] If matched, return quoted response without calling GHN.
- [ ] Set `source = local_rule` if accepted by DTO/frontend.
- [ ] Set `zoneCode = LOCAL_MO_CAY`.
- [ ] Set fee from configured local rule, default `0`.
- [ ] Set ETA from configured local rule, default `1 day`.
- [ ] Keep `usedFallback = false` because this is not GHN failure fallback.
- [ ] Extend frontend `ShippingQuoteSource` to include `local_rule` if returned.
- [ ] Ensure checkout displays fee using existing shipping quote fields.
- [ ] Ensure order/pending/invoice persists shipping quote snapshot through existing path.
- [ ] Add tests proving GHN not called for local destination.
- [ ] Add tests proving GHN still called for non-local destination.
- [ ] Add tests proving free shipping discounts remain shipping bucket only.

#### Guardrails

- Do not remove GHN integration.
- Do not alter GHN behavior for non-local addresses.
- Do not use a province-only zone to represent Mỏ Cày unless business explicitly accepts applying the local rule to the entire province.
- Do not match using `street` or `rawAddress`.
- Do not trust client shipping snapshot for storefront.
- Do not recalculate shipping incorrectly when quote-backed pending/invoice is created.
- Do not affect merchandise revenue/profit.
- Do not hardcode local rules in controller.
- Do not hardcode the local fee in multiple places.
- Avoid DB migration unless existing config cannot support local rule storage.

#### Acceptance criteria

- [ ] Admin can view and edit the local Mỏ Cày shipping rule in Shipping Settings.
- [ ] Admin can configure enabled state, label, fee, ETA, and province/district/ward matchers.
- [ ] Default Mỏ Cày local destination returns configured local shipping fee `0đ`.
- [ ] Local quote response includes configured ETA `1 day`.
- [ ] GHN is not called for matched local destination.
- [ ] Non-local destination still uses GHN.
- [ ] Disabling the local Mỏ Cày rule makes a Mỏ Cày address fall back to the existing GHN flow.
- [ ] Checkout displays correct shipping fee.
- [ ] Created order stores correct shipping fee/source according to existing snapshot behavior.
- [ ] Existing shipping fallback behavior remains unchanged for non-local addresses.

#### Business truth compliance notes

- Compliant because backend remains shipping quote authority.
- Must preserve quote snapshot flow into pending/invoice.
- Must keep shipping as invoice-level bucket.
- Must not affect line revenue/profit, VAT, or free-shipping discount allocation.

## 6. API Contract Proposal

### New endpoint

`GET /api/revenue/by-category-series`

### Query params

- `from`: required ISO date, inclusive, `YYYY-MM-DD`.
- `to`: required ISO date, inclusive, `YYYY-MM-DD`.
- `period`: optional, defaults to `daily`.
  - Allowed: `daily`, `weekly`, `monthly`, `yearly`.
- `categoryIds`: optional comma-separated category IDs.
  - Example: `categoryIds=1,2,3`.
  - If omitted, endpoint should return default display categories.

### Suggested response fields

Each response row:

- `periodKey`
  - Stable key, e.g. `2026-04-01`, `2026-W15`, `2026-04`, `2026`.
- `periodLabel`
  - Display label, e.g. `01/04/2026`, `Tuần 1 (06/04/2026 - 12/04/2026)`, `Tháng 04/2026`, `Năm 2026`.
- `periodStart`
  - Effective bucket start, inclusive, ISO date.
- `periodEnd`
  - Effective bucket end, inclusive, ISO date.
- `categoryId`
  - Category ID or reserved synthetic value for “Khác”.
- `categoryName`
  - Category display name, fallback `Không phân loại`, or synthetic `Khác`.
- `revenue`
  - Merchandise category revenue in VND from persisted line net revenue.

### Business rules

- Respect selected `from/to`.
- Respect selected `period`.
- Clamp each bucket:
  - `effectiveStart = max(bucketStart, from)`
  - `effectiveEnd = min(bucketEnd, to)`
- Support optional `categoryIds`.
- If `categoryIds` is supplied, return only selected categories.
- If `categoryIds` is supplied, do not add `Khác`.
- If `categoryIds` is omitted, backend returns Top 10 categories by total category revenue in the selected `from/to` range and one synthetic `Khác` series for all remaining categories.
- `Khác` revenue must equal the sum of all non-top-10 category revenue in the same selected `from/to` range.
- Frontend renders whatever backend returns and does not compute Top 10 + `Khác` itself.
- Use persisted invoice item financial fields.
- Category revenue = `sum(lineNetRevenue)`.
- Category grouping must use persisted invoice-line category snapshot fields: `categoryIdSnapshot`, `categoryNameSnapshot`, and `categoryCodeSnapshot` if available.
- Current `product.category` may be wrong for historical invoices if category assignments changed and must not be used as historical truth.
- Existing code does not yet have persisted invoice-line category snapshot fields; implementation must add them before releasing this endpoint.
- Historical invoice items without reliable snapshot/backfill must be returned under `Unknown/Legacy Category` rather than current catalog category.
- Do not silently use current catalog category as historical truth.
- Exclude cancelled invoices.
- Exclude VAT.
- Exclude shipping fee, shipping discount, and shipping net.
- Do not recompute from current catalog price, current promotion, current loyalty, recipe, or product cost.
- Preserve historical category readability: use persisted category snapshot fields for snapshot-backed rows and `Unknown/Legacy Category` for rows without reliable snapshot/backfill.

### Backward compatibility notes

- Do not change existing `GET /api/revenue/by-category`.
- Do not change existing `GET /api/revenue/by-product`.
- Do not change product revenue table data flow.
- Existing exports should remain backed by current category totals unless export scope is explicitly expanded later.
- Existing `GET /api/revenue/by-category` should either be migrated to snapshot fields in the same implementation or explicitly documented as legacy current-category behavior until a follow-up task.
- Frontend should add a new adapter method rather than overloading existing `revenueByCategory`.
- Category filter options should come from an existing admin category API if it can provide active/admin-visible categories suitable for reporting, or from a lightweight revenue-category options endpoint if needed.
- Do not derive category filter options only from the currently rendered chart series.
- Categories with zero revenue in the selected range must still be selectable so admin can filter first and then change date/groupBy to inspect trends.
- Category filter must support one or multiple categories.

### Business truth compliance notes

- New endpoint is compliant only if it aggregates persisted invoice-line net revenue.
- New endpoint is compliant only if it groups by persisted invoice-line category snapshot fields or explicit `Unknown/Legacy Category` for rows without reliable snapshots.
- Current `product.category` must not be used as historical category truth.
- Endpoint must never allocate invoice-level shipping into categories.
- Endpoint must never include VAT in revenue/profit.

## 7. Selenium Automation Test Plan

### 1. Invoice future date disabled/rejected

#### Name

Invoice filter disables/rejects future date selection.

#### Purpose

Ensure Invoice date picker cannot select a future date.

#### Preconditions/test data

- Admin user available.
- Invoice page accessible.
- Local today known in browser environment.

#### Steps

- Log in as admin.
- Navigate to `/admin/invoices`.
- Open custom period filter.
- Inspect `from` and `to` date inputs.
- Attempt to select tomorrow via date picker or set value through browser script and trigger change.

#### Expected result

- Date input has `max` equal to local today.
- Future date is not retained.
- Invoice list query does not keep future `from` or `to`.
- Today remains selectable.

---

### 2. Invoice manual future date rejected

#### Name

Invoice manual future date input is rejected.

#### Purpose

Ensure typed/pasted future dates cannot remain in Invoice filter state.

#### Preconditions/test data

- Admin user available.
- Invoice page accessible.

#### Steps

- Log in as admin.
- Navigate to `/admin/invoices`.
- Open custom period filter.
- Type or inject tomorrow into `from`.
- Type or inject tomorrow into `to`.
- Blur or trigger change event.

#### Expected result

- Future value is rejected or clamped according to implemented UX.
- User sees clear feedback if rejection UX is chosen.
- Date range used for API does not include future date.
- Previous valid date or today remains displayed.

---

### 3. Goods Receipt future date disabled/rejected

#### Name

Goods Receipt filter disables/rejects future date selection.

#### Purpose

Ensure Goods Receipt date picker cannot select future dates.

#### Preconditions/test data

- Admin user available.
- Goods Receipt page accessible.

#### Steps

- Log in as admin.
- Navigate to `/admin/goods-receipts`.
- Open custom period filter.
- Inspect date input `max`.
- Attempt to select tomorrow.

#### Expected result

- Future date cannot be selected or retained.
- API request uses only today or earlier.
- Today remains selectable.

---

### 4. Goods Receipt manual future date rejected

#### Name

Goods Receipt manual future date input is rejected.

#### Purpose

Ensure manually typed future dates cannot remain in Goods Receipt filter state.

#### Preconditions/test data

- Admin user available.
- Goods Receipt page accessible.

#### Steps

- Log in as admin.
- Navigate to `/admin/goods-receipts`.
- Open custom period filter.
- Type or inject tomorrow into `from`.
- Type or inject tomorrow into `to`.
- Trigger change/blur.

#### Expected result

- Future value is rejected or clamped according to implemented UX.
- Date state and API query do not retain future values.
- Today remains selectable.

---

### 5. Date picker regression outside Invoice/Goods Receipt

#### Name

Other date pickers preserve existing behavior.

#### Purpose

Ensure scoped fix does not affect unrelated date/date-time pickers.

#### Preconditions/test data

- Admin user available.
- At least one page with legitimate future date input exists, such as product expiry/import/receipt creation/promotion date depending on current UI.

#### Steps

- Log in as admin.
- Navigate to an unrelated page with a future-capable date picker.
- Attempt to choose a valid future date where business flow allows it.
- Navigate to another report page using `DateInput`.
- Confirm behavior is unchanged from current expected behavior.

#### Expected result

- Invoice/Goods Receipt hardening does not globally alter unrelated date pickers.
- Future-capable fields remain usable where allowed.
- No responsive layout regression.

---

### 6. Profit weekly clamp

#### Name

Profit weekly grouping clamps first bucket to selected `from`.

#### Purpose

Ensure weekly Profit does not include days before selected start date.

#### Preconditions/test data

- Seed completed invoices with line snapshots:
  - One invoice before selected `from` but in same calendar week.
  - One invoice on/after selected `from`.
- Both use persisted `lineNetRevenue` and `lineCOGS`.
- Cancelled invoice optional to prove exclusion.

#### Steps

- Log in as admin.
- Navigate to `/admin/profit`.
- Select `from` mid-week.
- Select `to` within same or later week.
- Choose weekly grouping.
- Read first weekly bucket revenue/profit.

#### Expected result

- First weekly bucket `fromDate` equals selected `from`.
- Bucket excludes invoice before selected `from`.
- Profit = `sum(lineNetRevenue - lineCOGS)` for included completed invoices only.

---

### 7. Profit monthly clamp

#### Name

Profit monthly grouping clamps first bucket to selected `from`.

#### Purpose

Ensure monthly Profit does not include days before selected start date.

#### Preconditions/test data

- Seed completed invoices:
  - One invoice earlier in the same month before selected `from`.
  - One invoice on/after selected `from`.
- Persist line net revenue and COGS.

#### Steps

- Log in as admin.
- Navigate to `/admin/profit`.
- Select `from` mid-month.
- Select `to` later in same or later month.
- Choose monthly grouping.
- Read first monthly bucket revenue/profit.

#### Expected result

- First monthly bucket excludes days before `from`.
- Bucket start displayed or returned as selected `from`.
- Totals match persisted line snapshot sums only.

---

### 8. Profit yearly clamp, if yearly is implemented

#### Name

Profit yearly grouping clamps first bucket to selected `from` (conditional).

#### Purpose

Ensure yearly Profit does not include dates before selected start date.

#### Preconditions/test data

- Yearly Profit endpoint/UI implemented.
- Run this Selenium case only if yearly Profit is implemented; skip/mark conditional if yearly Profit is deferred.
- Seed completed invoices:
  - One invoice earlier in same year before selected `from`.
  - One invoice on/after selected `from`.

#### Steps

- Log in as admin.
- Navigate to `/admin/profit`.
- Select `from` mid-year.
- Select `to` later in same or next year.
- Choose yearly grouping.
- Read first yearly bucket.

#### Expected result

- First yearly bucket excludes earlier same-year invoice.
- Bucket respects `from/to`.
- Profit uses persisted line snapshots.

---

### 9. Revenue total grouping verification

#### Name

Revenue total buckets respect selected range.

#### Purpose

Verify Revenue daily/weekly/monthly/yearly grouping does not include out-of-range dates.

#### Preconditions/test data

- Seed completed invoices before and inside selected range.
- Include invoices around week/month/year boundaries.
- Ensure test data can distinguish out-of-range amount.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Set selected `from/to`.
- Switch Day / Week / Month / Year.
- Compare visible totals with backend expected values or API response.

#### Expected result

- No bucket includes invoices before `from` or after `to`.
- Any existing Revenue total semantic issue is documented separately and not silently changed by this test.

---

### 10. Category revenue line/area groupBy

#### Name

Category revenue chart updates by groupBy.

#### Purpose

Ensure category chart reflects Day / Week / Month / Year.

#### Preconditions/test data

- Completed invoices across multiple days/weeks/months/categories.
- Category revenue series endpoint implemented.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Observe category revenue chart.
- Switch groupBy from Day to Week to Month to Year.
- Capture chart X-axis and series changes.

#### Expected result

- X-axis bucket labels change according to groupBy.
- Category series values are recalculated for each period.
- Existing Revenue total chart remains visible.

---

### 11. Category revenue from/to

#### Name

Category revenue chart respects date range.

#### Purpose

Ensure category chart only includes selected range.

#### Preconditions/test data

- Category invoices before, inside, and after selected range.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Set `from/to` to include only middle period.
- Observe category chart and tooltip values.

#### Expected result

- Chart excludes out-of-range category revenue.
- Tooltip period labels match selected range buckets.
- Revenue values are formatted in VND.

---

### 12. Category filter single category

#### Name

Category chart filters to one category.

#### Purpose

Ensure single selected category shows only one series.

#### Preconditions/test data

- At least two categories with revenue in selected range.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Open category filter.
- Select one category.
- Observe chart.

#### Expected result

- Only selected category line/area appears.
- API request includes selected category ID.
- Backend response does not include synthetic `Khác` when `categoryIds` is provided.
- Product revenue table remains unchanged.

---

### 12A. Category filter includes zero-revenue category option

#### Name

Category filter includes categories with zero revenue in current range.

#### Purpose

Ensure category filter options are not derived only from currently rendered chart series and allow admins to select categories before changing date/groupBy.

#### Preconditions/test data

- Category Z exists and is active/admin-visible.
- Category Z has no invoice revenue in the initial selected date range.
- Category Z has revenue in another date range, or can remain zero to verify empty state.
- Category filter options source is existing admin category API or lightweight report category options endpoint.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Select a date range where Category Z has zero revenue.
- Open category filter.
- Select Category Z.
- Observe chart state.
- Change date range/groupBy to a period where Category Z has revenue if such data exists.

#### Expected result

- Category Z appears in filter options despite zero revenue in the initial range.
- Selecting Category Z sends its category ID in `categoryIds`.
- Backend returns only selected Category Z series and does not add `Khác`.
- Initial chart shows clear empty/zero state, not a missing option.
- After changing date range/groupBy, the same selected category can show data if revenue exists.

---

### 13. Category filter multiple categories

#### Name

Category chart filters to multiple categories.

#### Purpose

Ensure multi-select category filter shows selected category series only.

#### Preconditions/test data

- At least three categories with revenue in selected range.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Select two or more categories in category filter.
- Observe chart and legend.

#### Expected result

- Only selected category lines/areas appear.
- Backend response does not include synthetic `Khác` when `categoryIds` is provided.
- Tooltip distinguishes category names.
- No visual overflow on desktop/mobile.

---

### 14. Category default Top 10 + Khác

#### Name

Category chart default shows Top 10 plus Khác.

#### Purpose

Ensure default category chart groups remaining categories as “Khác”.

#### Preconditions/test data

- More than ten categories with completed invoice revenue in selected range.
- At least one lower-ranked category has positive revenue.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Ensure no category filter selected.
- Observe category chart legend/series.

#### Expected result

- Top 10 categories are shown individually.
- Remaining categories are grouped as “Khác”.
- “Khác” revenue equals sum of all non-top-10 category persisted invoice-line snapshot revenue in the same selected `from/to` range.
- No category data is fetched on hover.

---

### 14A. Category historical snapshot correctness

#### Name

Category time-series preserves invoice-time category after product category change.

#### Purpose

Ensure category revenue time-series uses persisted invoice-line category snapshots, not current `product.category`.

#### Preconditions/test data

- Product exists in Category A.
- Completed invoice is created while the product belongs to Category A.
- Product is then reassigned to Category B.
- Category revenue series endpoint and chart are implemented with snapshot fields.

#### Steps

- Log in as admin.
- Create or seed the invoice while product belongs to Category A.
- Reassign the product to Category B.
- Navigate to `/admin/revenue`.
- Select the invoice date range and groupBy.
- Inspect category chart/API response for the invoice period.

#### Expected result

- Revenue for the historical invoice appears under Category A.
- The same historical invoice does not move to Category B after product reassignment.
- Revenue value equals persisted `lineNetRevenue`.
- Shipping and VAT are not included.

---

### 14B. Category legacy invoice without snapshot

#### Name

Legacy invoice without category snapshot appears under Unknown/Legacy Category.

#### Purpose

Ensure old invoice items without reliable category snapshot/backfill are handled explicitly instead of silently using current catalog category.

#### Preconditions/test data

- Historical invoice item exists without category snapshot fields populated.
- Reliable category backfill is unavailable for that row.

#### Steps

- Log in as admin.
- Navigate to `/admin/revenue`.
- Select a range containing the legacy invoice.
- Observe category chart/API response.

#### Expected result

- Legacy revenue appears under `Unknown/Legacy Category`.
- Current product category is not used as historical truth.
- Tooltip and legend make the legacy bucket clear.

---

### 14C. Admin edits local Mỏ Cày shipping rule

#### Name

Admin Shipping Settings can edit local Mỏ Cày rule.

#### Purpose

Ensure Admin editability for the local shipping rule is implemented now.

#### Preconditions/test data

- Admin user available.
- Shipping Settings page available.
- Default local Mỏ Cày rule exists or is created by settings defaults/migration.

#### Steps

- Log in as admin.
- Navigate to Admin Shipping Settings.
- Locate the `LOCAL_MO_CAY` local shipping rule.
- Verify/edit enabled state, label, fee, ETA, province matchers, district matchers, and ward matchers.
- Save settings.
- Reload the page.

#### Expected result

- Rule is visible and editable.
- Admin can set fee to `0` and ETA to `1` day.
- Saved values persist after reload.
- No GHN settings for non-local quotes are broken.

---

### 15. Shipping local Mỏ Cày

#### Name

Local Mỏ Cày shipping quote bypasses GHN.

#### Purpose

Ensure local Mỏ Cày destination returns configured local fee without carrier call.

#### Preconditions/test data

- Local Mỏ Cày shipping rule configured.
- GHN call can be observed through mock, log, or test spy.
- Storefront or shipping quote API available.

#### Steps

- Submit shipping quote for matched Mỏ Cày address using codes.
- Repeat using normalized Vietnamese names fallback if codes are unavailable.
- Inspect response and GHN call count/log.

#### Expected result

- Response status is `quoted`.
- Fee equals local configured fee `0đ` by default.
- ETA equals configured ETA `1 day` by default.
- Source is `local_rule` or equivalent.
- Zone code is `LOCAL_MO_CAY` or configured local code.
- GHN is not called.

---

### 16. Shipping non-local GHN

#### Name

Non-local shipping quote still uses GHN.

#### Purpose

Ensure GHN behavior remains unchanged for non-local destinations.

#### Preconditions/test data

- GHN test/mocked destination available.
- Non-local address outside Mỏ Cày rule.

#### Steps

- Submit shipping quote for non-local address.
- Inspect response source and GHN call/log.

#### Expected result

- GHN is called.
- Response follows existing `carrier_api` or existing fallback behavior.
- Local rule is not applied.
- Checkout fee displays as before.

---

### 16A. Shipping disabled local Mỏ Cày rule falls back to GHN

#### Name

Disabled local Mỏ Cày rule does not bypass GHN.

#### Purpose

Ensure Admin can disable the local rule and restore normal GHN quote behavior for Mỏ Cày addresses.

#### Preconditions/test data

- Admin user available.
- Local Mỏ Cày rule exists in Shipping Settings.
- GHN quote flow available or mocked.

#### Steps

- Log in as admin.
- Navigate to Admin Shipping Settings.
- Disable the `LOCAL_MO_CAY` rule and save.
- Submit checkout/shipping quote for a Mỏ Cày address that normally matches the rule.
- Inspect quote response and GHN call/log.

#### Expected result

- Local rule is not applied while disabled.
- GHN is called for the Mỏ Cày address.
- Response follows existing GHN/fallback behavior.
- Re-enabling the rule restores local-rule behavior.

---

### 17. Order shipping snapshot

#### Name

Order stores local shipping quote snapshot.

#### Purpose

Ensure created order/pending/invoice stores backend local shipping quote snapshot and does not recalculate incorrectly.

#### Preconditions/test data

- Storefront checkout enabled.
- Local Mỏ Cày rule configured.
- Product available for checkout.
- Address matches local Mỏ Cày.

#### Steps

- Create storefront cart.
- Enter local Mỏ Cày shipping address.
- Trigger backend quote.
- Submit checkout using backend quote ID.
- Inspect pending/order/invoice detail or API response.

#### Expected result

- Checkout displays local shipping fee.
- Created order/pending/invoice snapshot stores same shipping fee/source.
- Merchandise revenue/profit is unchanged by shipping override.
- Free shipping, if applied, affects only shipping discount bucket.

## 8. Open Questions

1. Should Profit Year grouping be implemented now?
   - Status: conditional follow-up scope, not a blocker.
   - Option A: Implement now for parity with Revenue only if it stays small, clean, and fits the current architecture.
   - Option B: Defer and only clamp weekly/monthly.
   - Weekly/monthly clamp is must-have and must not be blocked by yearly grouping.
   - Weekly/monthly clamp can be implemented and shipped even if Profit yearly is deferred.
   - Recommendation: Implement yearly only if backend/frontend changes remain small, clean, and tests can cover it.
   - Defer yearly Profit if it requires broad refactor, unclear business semantics, or too many API/UI/test changes.

2. RESOLVED: What is the exact local shipping fee and ETA for Mỏ Cày?
   - Final business decision: fee = `0đ`, ETA = `1 day`.
   - Admin editability is required now.
   - Implementation must extend shipping settings DTO/model/admin UI to store local rules with district/ward/province matchers.

3. RESOLVED: Should “Khác” aggregation be done in backend or frontend?
   - Final decision: backend computes Top 10 + “Khác” when `categoryIds` is omitted.
   - Top 10 ranking and “Khác” use persisted invoice-line category snapshot revenue in the selected `from/to` range.
   - Frontend renders the backend response and does not compute Top 10 + “Khác”.
   - When `categoryIds` is provided, backend returns only selected categories and does not add `Khác`.

4. RESOLVED: Does invoice item persist category ID/name snapshots, and which category strategy is approved?
   - Code inspection answer: no persisted invoice-line `categoryId`, `categoryName`, or `categoryCode` snapshot fields were found.
   - No persisted invoice-line product/variant name/code snapshot fields were verified either; DTOs dereference current product/variant relationships.
   - Final business decision: Task 2C is UNBLOCKED with Proper snapshot implementation.
   - Implementation must add invoice-line category snapshot fields and use them for category time-series.
   - Existing historical rows must be backfilled if reliable; otherwise display/group as `Unknown/Legacy Category`.
   - Current `product.category` may be wrong for historical invoices if category assignments changed.
   - Do not silently use current catalog category as historical truth.

5. Does `SalesInvoice.totalAmount` include VAT and shipping?
   - Status: documented business-truth risk only; non-blocking for the current implementation.
   - If yes, current Revenue total query may conflict with “VAT excluded from revenue/profit.”
   - Current task only verifies/fixes Revenue total grouping clamp by `from/to`.
   - Revenue total semantic correction is out of scope for this implementation.
   - Do not change the Revenue total query from `totalAmount` to another definition unless a separate approved task is created.
   - Any Revenue semantic correction should be separately approved and documented as follow-up.

6. Should local shipping `source` be exactly `local_rule`?
   - Backend DTO allows string source.
   - Frontend union type must be extended if this exact source is used.

7. Which administrative code set is canonical for updated Mỏ Cày addresses?
   - Need current province/district/ward codes for Bến Tre/Vĩnh Long transition.
   - Matching should prefer codes and support normalized old/new names.

8. RESOLVED: Should local shipping rules be editable in Admin Shipping Settings?
   - Yes. Admin editability is required now.
   - Existing settings currently support zone rules and parcel defaults but not district/ward local matchers.
   - Implementation must extend settings model/DTO/UI rather than deferring Admin editability.

9. RESOLVED: Where should category filter options come from?
   - Prefer an existing admin category API if it can provide active/admin-visible categories suitable for reporting.
   - If existing admin category APIs are unsuitable, add a lightweight revenue report category options endpoint.
   - Category filter options must not be derived only from the currently rendered chart series.
   - Categories with zero revenue in the current selected range must still be selectable.
   - Admin must be able to filter a category first and then change date/groupBy to inspect trends.
   - Category filter must support one or multiple categories.

## 9. Progress Tracker

- [x] NhaDanBusinessTruth reviewed
- [x] Business truth impact analysis completed
- [x] Code inspection completed for Blocker 1 category historical snapshot
- [x] Code inspection completed for Blocker 2 local Mỏ Cày shipping config
- [x] Business decision received for Task 2C category strategy: Proper snapshot implementation
- [x] Business decision received for Task 2C default categories: backend Top 10 + `Khác`
- [x] Business decision received for Task 2C category filter options: include zero-revenue selectable categories
- [x] Profit yearly scope clarified: conditional and non-blocking for weekly/monthly clamp
- [x] Revenue total semantic question clarified: documented follow-up risk, non-blocking for current grouping work
- [x] Business decision received for Task 3 local shipping fee/ETA/config source: fee `0đ`, ETA `1 day`, Admin editable now
- [ ] Task 1 planned
- [x] Task 2 planned with final category snapshot decision
- [x] Task 3 planned with final local shipping settings/admin decision
- [x] API contract reviewed for category snapshot-backed series
- [x] Selenium plan reviewed with category snapshot and local shipping admin cases
- [ ] Ready for implementation

