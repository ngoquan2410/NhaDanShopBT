# Regression coverage matrix (Phase 2)

Single source of truth for **which layers** (Selenium E2E, HTTP/API MockMvc, BE service/integration) cover each storefront/admin surface. Paths are relative to the **repo root** `NhaDanShopBT/`.

## How to maintain (acceptance)

When you add or remove automation:

1. Find the row for the **FE route** (or API-only surface below).
2. Update **Selenium**, **API**, and **BE** cells with spec/class names (comma-separated if several).
3. Set **Seed** if the test relies on scripts, env, or deterministic prefixes (document the mechanism).
4. Set **Status** to `covered` only if that layer has a committed automated test that runs in CI/local by design; use `skipped` with reason if intentionally excluded; `manual` for QA-only; `blocker` when product/docs block automation.
5. Use **Note** for tags (`smoke`, `storefront-auth-suite`, slice IDs), mocks (e.g. GHN stub), or plan references.
6. Optionally reconcile results with `automation-output/automation-summary.json` after `RUN_AUTOMATION=1` runs (`nha-dan-pos-c091ee5b/automation-output`).

### Selenium scopes / tags (runner)

| `AUTOMATION_SCOPE` | Spec tag gate (ANY) |
|--------------------|---------------------|
| `smoke` (default) | `smoke` |
| `storefront` | `storefront` |
| `storefront-auth` | `storefront-auth-suite` |
| `admin` | `admin` |
| `admin-sales` | `admin-sales-suite` |
| `admin-ops` | `p5-catalog`, `p5-inventory`, … |
| `settings-integrations` | `p5-settings` |
| `full` / `regression` | *(no gate — all specs)* |
| `critical-watchlist` | Each `watchlist-*` gate tag (`watchlist-pos-invoice`, …, `watchlist-revenue-profit`) |

Also: `--tags=a,b` or `AUTOMATION_TAGS`; env `BASE_URL`, `API_BASE_URL`, optional `USER_USERNAME`/`USER_PASSWORD` for customer flows, optional `E2E_SIGNUP=1`.

## Status legend

| Status   | Meaning |
|----------|---------|
| covered  | Automated test exists in repo for that layer. |
| skipped  | Not automated; reason in Note (e.g. needs sandbox, out of scope). |
| manual   | Relies on manual verification only for now. |
| blocker  | Known defect or unclear rule; see plan blockers / Note. |

## Path shortcuts

- **CI gates (Phase 7):** `.github/workflows/ci-regression-gates.yml` — Gradle `compileJava`/`compileTestJava`/`test`, `npm run build`/`npm test`, và `RUN_AUTOMATION=1 npm run test:automation` (smoke mặc định; artifact `automation-output`).
- **FE app:** `nha-dan-pos-c091ee5b/`
- **Selenium specs:** `nha-dan-pos-c091ee5b/automation/selenium/specs/`
- **Selenium runner:** `nha-dan-pos-c091ee5b/automation/selenium/run-selenium.mjs` (`npm run test:automation` from FE package)
- **Selenium artifacts / summary:** `nha-dan-pos-c091ee5b/automation-output/` (`*.png`/HTML on failure, `automation-summary.json` always when gate runs suite)
- **BE:** `NhaDanShop/src/main/java/...`, tests under `NhaDanShop/src/test/java/...`

---

## Storefront & customer account

| Module | FE route | Chức năng (summary) | API prefix / endpoints | BE domain | Selenium (file / scenario) | API test | BE test | Seed | Status (Se / API / BE) | Note |
|--------|----------|----------------------|-------------------------|-----------|---------------------------|----------|---------|------|-------------------------|------|
| Storefront | `/` | Home, hero, listings hook | `GET /api/products`, `GET /api/categories`, … | Catalog | `smoke-storefront.spec.mjs`; `storefront-auth.spec.mjs` | — | `Slice5CatalogIntegrationTest` | Runtime API | covered / skipped / covered | API layer not dedicated MockMvc for home; catalog covered in BE slice. |
| Storefront | `/products` | Product grid | `/api/products` | Catalog | `storefront-auth.spec.mjs` | — | `Slice5CatalogIntegrationTest` | Backend catalog | partial / skipped / covered | Needs stock for downstream cart row. |
| Storefront | `/products/:id` | Product detail, add cart | `/api/products/{id}` | Catalog | `storefront-auth.spec.mjs` | — | `Slice5CatalogIntegrationTest` | SKU with `stock > 0` | partial / skipped / partial | Selenium skips add-to-cart if no inventory. |
| Storefront | `/combos` | Combo browse | `GET /api/combos/active` | Combos | `storefront-auth.spec.mjs` | — | `Crit007ComboVirtualStockIntegrationTest` | Backend combos | partial / skipped / covered | Asserts combos page + optional add when API returns SKUs with stock UI. |
| Storefront | `/cart` | Cart UX | promotions client | Commerce | `storefront-auth.spec.mjs` | — | `Slice7CommercialFlowIntegrationTest` | — | partial / skipped / covered | |
| Storefront | `/checkout` | Checkout, `POST /api/sales/quote`, GHN-ish ship quote | `/api/shipping/quote`, `/api/sales/quote`, `/api/addresses/*` | Checkout, shipping | `storefront-auth.spec.mjs` (`AddressSelect` manual path covers Goong-down UX) | `Slice8bStoreShippingMvcIntegrationTest` | `Slice7CommercialFlowIntegrationTest`, `Slice6cQuotePaymentIntegrationTest` | Live BE + SKU | partial / covered / covered | Pending if ship/quote flaky in env; screenshots on Selenium failure. |
| Storefront | `/pending-payment`, `/pending-payment/:id` | Pending payment UX | `/api/pending-orders`, `/api/store/payment-settings`, `/api/vietqr/generate` | Pending orders | `storefront-auth.spec.mjs` (after COD-style submit) | — | `PaymentEventIntegrationTest`, `PendingOrderService` paths | Order from checkout | partial / skipped / covered | Requires successful checkout funnel. |
| Storefront | `/account` | Profile, orders, points | `/api/account/*`, loyalty surface | Account, loyalty | `storefront-auth.spec.mjs` (**needs** `USER_USERNAME`/`USER_PASSWORD` non-admin) | `AuthAccountMvcIntegrationTest` | `Slice8AccountContractTest`, `Slice8LoyaltyIntegrationTest`, `Slice8CustomerBindingIntegrationTest` | Env user | partial / covered / covered | Loyalty banner covered only with customer env vars. |
| Auth | `/login` | Login, `next` deep-link | `/api/auth/login` | Auth | `smoke-admin-login.spec.mjs` (`ADMIN_*`), `storefront-auth.spec.mjs` (`USER_*`) | `AuthAccountMvcIntegrationTest` | `Slice8AuthContractTest` | Env creds — H2 for BE tests | partial / covered / covered | OTP/TOTP ⇒ Selenium skips when backend demands second factor. |
| Auth | `/signup` | Register + weak-password guard | `/api/auth/signup` | Auth | `storefront-auth.spec.mjs`; optional creation when `E2E_SIGNUP=1` | `AuthAccountMvcIntegrationTest` | `Slice8AuthContractTest` | H2 / deterministic username | partial / covered / covered | Strong signup opt-in avoids DB spam. |
| Auth | `/forgot-password` | Forgot password UX | `/api/auth/forgot-password` | Auth | `storefront-auth.spec.mjs` | — | `Slice8AuthContractTest` | — | partial / skipped / covered | UI posts stub username; asserts page flow. |
| Auth | `/reset-password` | Reset password form | `/api/auth/reset-password` | Auth | `storefront-auth.spec.mjs` | — | `Slice8AuthContractTest` | fixture token query | partial / skipped / covered | Validates form render with dummy token query string. |

---

## Admin (guarded under `/admin`)

| Module | FE route | Chức năng | API prefix | BE domain | Selenium | API test | BE test | Seed | Status (Se / API / BE) | Note |
|--------|----------|-----------|------------|-----------|----------|----------|---------|------|-------------------------|------|
| Admin shell | `/admin` (guard) | Redirect unauthenticated | — | Security | `smoke-admin-guard.spec.mjs` | — | — | — | covered / skipped / skipped | Asserts `/login` + `next=`. |
| Admin shell | `/admin` + customer session | Non-admin redirect `/account` | — | Access | `storefront-auth.spec.mjs` (requires `USER_*` non-admin) | — | — | Env customer | partial / skipped / skipped | Mirrors `resolvePostLoginPath` + `AdminAuthGuard`. |
| Admin shell | `/admin` (login) | Authenticated shell | `/api/auth/login` | Auth | `smoke-admin-login.spec.mjs` | `AuthAccountMvcIntegrationTest` | — | Env credentials | partial / covered / skipped | **skipped** if `ADMIN_USERNAME`/`ADMIN_PASSWORD` unset. |
| Dashboard | `/admin` | Revenue/profit cards, stock/expiry/pending badges | `/api/revenue`, `/api/reports`, `/api/inventory/projections`, `/api/pending-orders` | Reporting | `admin-sales-dashboard.spec.mjs` (**watchlist-inventory-truth** parity) | `Slice8BMvcIntegrationTest` | `RevenueCanonicalQueryIntegrationTest`, `Slice7CommercialReportingIntegrationTest`, `ProfitReportVatExclusionIntegrationTest` | Live BE projections | partial / covered / covered | |
| Categories | `/admin/categories` | CRUD categories | `/api/categories` | Catalog | — | — | `Slice5CatalogIntegrationTest` | — | skipped / skipped / covered | |
| Products | `/admin/products`, `/admin/products/new`, `/admin/products/:id` | Product CRUD | `/api/products`, `/api/images` | Catalog | **`admin-ops-catalog.spec.mjs`** (search row + ellipsis **Thao tác** → **Xem chi tiết**); **`admin-soft-delete-archive-ui.spec.mjs`** (deactivate không stocked vs stocked guard) | `ProductCreateResponseMvcIntegrationTest` | `Slice5CatalogIntegrationTest`, `ExcelImportServiceSlice5IntegrationTest` | H2 | covered / covered / covered | Ảnh upload chưa assert binary thật trong Se. |
| Combos | `/admin/combos` | Combo admin | `/api/combos` | Combos | — | — | `Crit007ComboVirtualStockIntegrationTest` | — | skipped / skipped / covered | |
| POS | `/admin/pos` | Scan, qty, quote, invoice, snapshots | `/api/pos`, `/api/sales`, `/api/invoices` | POS, commercial | `admin-sales-pos-invoice.spec.mjs`; **`admin-sales-batch-pos.spec.mjs`** (`BATCH:{id}`…); **`admin-sales-commercial.spec.mjs`** (quote→invoice promo+voucher+manual+VAT snapshot + COGS/profit parity + cancel); `admin-sales-unmatched-vietqr.spec.mjs` | `CriticalWatchlistGateMvcIntegrationTest`; `Slice8BMvcIntegrationTest`; `Slice6bPosTraceabilityIntegrationTest` | `Slice6cQuotePaymentIntegrationTest`, `Slice7CommercialFlowIntegrationTest` | Live BE SKU + batch rows | **covered**/ covered / covered | Shipping/reward storefront depth vẫn ưu tiên Slice7/Pending specs. |
| Invoices | `/admin/invoices` | Invoice list/detail | `/api/invoices` | Sales | **`admin-sales-commercial.spec.mjs`** + `admin-sales-invoices.spec.mjs`; `admin-sales-pos-invoice.spec.mjs` (**watchlist-invoice-lifecycle**) | `CriticalWatchlistGateMvcIntegrationTest`; `Slice8BMvcIntegrationTest` | `InvoiceBatchAllocationIntegrationTest`, `Slice7CommercialFlowIntegrationTest` | H2 | partial / covered / covered | Pending payment confirm idempotency: `watchlist-pending-to-invoice`. |
| Pending orders | `/admin/pending-orders` | Pending queue | `/api/pending-orders` | Pending | `admin-sales-pending.spec.mjs`; **`watchlist-pending-to-invoice.spec.mjs`** (confirm→invoice UX) | `CriticalWatchlistGateMvcIntegrationTest`; `Slice8BMvcIntegrationTest` | `PaymentEventIntegrationTest` | Anonymous quote seed | partial / covered / covered | Pending confirm Idempotency-Key replay (Mvc gate). |
| Unmatched payments | `/admin/unmatched-payments` | Reconciliation UI | `/api/payment-events` | Payments | `admin-sales-unmatched-vietqr.spec.mjs` (page shell) | `AdminSalesMvcIntegrationTest` (`GET /api/payment-events/recent` admin-only) | `PaymentEventIntegrationTest`, `Crit008IdempotencyIntegrationTest` | — | partial / covered / covered | Casso ingest idempotency: `AdminSalesMvcIntegrationTest` MockMvc webhook duplicate POST. |
| Promotions | `/admin/promotions` | Promotions | `/api/promotions` | Commercial | **`admin-ops-commercial.spec.mjs`** (**Tạo khuyến mãi** + drawer surface + evaluate 400 hygiene) | — | `Slice7CommercialFlowIntegrationTest` | — | **partial**/ skipped / partial | Full archive matrix chủ yếu BE/API. |
| Vouchers | `/admin/vouchers` | Vouchers | `/api/vouchers` | Commercial | **`admin-ops-commercial.spec.mjs`** (**Thêm voucher** drawer có title *Thêm voucher mới* + `admin-soft-delete-archive-ui` POST/toggle inactive) | — | `Slice7CommercialFlowIntegrationTest` | — | **partial**/ skipped / partial | |
| Customers | `/admin/customers` | Customers | `/api/customers` | CRM | **`admin-soft-delete-archive-ui.spec.mjs`** (API create + UI list chứa tên sau seed); **`admin-ops-directory.spec.mjs`** (drawer khách shell) | — | `Slice8CustomerBindingIntegrationTest` | — | **partial**/ skipped / covered | |
| Suppliers | `/admin/suppliers` | Suppliers | `/api/suppliers` | Suppliers | **`admin-ops-directory.spec.mjs`** (Thêm → **Thêm mới** lưu NCC vào backend + assertion text trên listing) | — | — | — | **partial**/ skipped / skipped | Supplier MockMvc backlog vẫn optional. |
| Goods receipts | `/admin/goods-receipts`, `/create` | Nhập kho | `/api/receipts` | Inventory | **`admin-inventory-receipt-ui.spec.mjs`** (UI create line + nhà cung cấp combo + BATCH + duplicate void PATCH + DELETE voided rejection + drawer delete-block banner khi đã bán); `watchlist-receipts-adjustments.spec.mjs`; `admin-ops-inventory.spec.mjs` | — | **`CriticalWatchlistGateMvcIntegrationTest`**, `ReceiptDeletionLockingIntegrationTest` | `E2E-*`, `ensureSupplier`, `sellVariantOneFefo` | **covered**/ skipped / covered | Matrix `covered`: UI không chỉ shell — projection `onHand`/variant.stockQty invariant. |
| Stock adjustments | `/admin/stock-adjustments`, `/create` | Điều chỉnh tồn | `/api/stock-adjustments` | Inventory | **`admin-inventory-stock-adjustment-ui.spec.mjs`** (**UI `/create`** search + Δ+ confirm; API draft invariant; oversized source-batch confirm fail; consumed positive reverse fail; drawer reverse duplicate reject) | — | **`CriticalWatchlistGateMvcIntegrationTest`**, `StockAdjustmentServiceSlice5bIntegrationTest` | — | **covered**/ skipped / covered | Missing-trace legacy FEFO: chủ yếu BE/stateful data. |
| Inventory report | `/admin/inventory-report` | Projections | `/api/inventory/projections` | Inventory | **`admin-reports-export-ui.spec.mjs`** (**GET `/api/reports/inventory/this-month` closingStock**) + các spec inventory khác | — | `Slice8BMvcIntegrationTest` | — | **partial**/ partial / covered | Excel + API closing row; storefront sellable combos vẫn BE-heavy. |
| Production | `/admin/production`, `/admin/production/recipes/new` | Recipes & orders | `/api/production-recipes`, `/api/production-orders` | Production | **`admin-production-gap.spec.mjs`** (void restore raw + **`downstream consumed output batch → void HTTP fail`**) | — | `ProductionSlice6IntegrationTest`; **`Crit007ComboVirtualStockIntegrationTest`** | — | **covered**/ skipped / covered | |
| Revenue report | `/admin/revenue` | Revenue drilldown | `/api/revenue`, `/api/reports` | Reporting | **`admin-reports-export-ui.spec.mjs`** probes + **`GET /api/revenue/total` DTO parity** (`rows[]`, `totalAmount`) | **`CriticalWatchlistGateMvcIntegrationTest`** | `RevenueCanonicalQueryIntegrationTest`, `Slice7CommercialReportingIntegrationTest` | H2 | **partial**/ covered / covered | Cancel exclusion vẫn gate BE. |
| Profit report | `/admin/profit` | Profit drilldown | `/api/revenue`, `/api/reports` | Reporting | `admin-ops-reports.spec.mjs`; **`admin-reports-export-ui.spec.mjs`** | `Slice8BMvcIntegrationTest` | **`ProfitReportVatExclusionIntegrationTest`**, `Crit007ComboVirtualStockIntegrationTest` | H2 | partial / covered / covered | `/api/reports/profit/export` probe. |
| Users | `/admin/users` | Users | `/api/admin/users` | IAM | `admin-ops-directory.spec.mjs` (page shell) | — | — | — | partial / skipped / skipped | |
| Security | `/admin/security` | Roles/settings | `/api/admin/users`, `/api/store` | IAM | `admin-ops-directory.spec.mjs` | — | — | — | partial / skipped / skipped | |
| Store settings | `/admin/store-settings` | Branding, policy | `/api/store` | Settings | **`admin-ops-settings.spec.mjs`** (+ modal session expired `nhadan:session-expired`) | `Slice8bStoreShippingMvcIntegrationTest` | — | H2 | partial / covered / skipped | GHN/Goong stub paths trong cùng spec. |
| Shipping settings | `/admin/shipping-settings` | Zones, GHN | `/api/shipping`, `/api/store` | Shipping | **`admin-ops-settings.spec.mjs`** | `Slice8bStoreShippingMvcIntegrationTest` | `ShippingSettingsService` via MVC | H2 + Mockito | partial / covered / partial | Third-party GHN prod skipped — stub trong MVC/BE. |
| GHN logs | `/admin/ghn-quote-logs` | Quote audit | `/api/admin/ghn-quote-logs` | Shipping | **`admin-ops-settings.spec.mjs`** | — | — | — | partial / skipped / skipped | Shell load only. |
| Goong test | `/admin/goong-test` | Address dev UI | `/api/address-autocomplete`, `/api/address-place-detail`, `/api/addresses/*` | Address | **`admin-ops-settings.spec.mjs`** | — | — | — | partial / skipped / skipped | Third-party; manual or stubbed only. |

---

## API-only / webhook surfaces (no single FE route)

| Module | FE route | Chức năng | API prefix | BE domain | Selenium | API test | BE test | Seed | Status | Note |
|--------|----------|-----------|------------|-----------|----------|----------|---------|------|--------|------|
| Webhooks | — | Casso webhook | `/api/webhooks/casso` | Payments | — | `AdminSalesMvcIntegrationTest` (duplicate body ACCEPTED replay) | `PaymentEventIntegrationTest`, `Crit008IdempotencyIntegrationTest` | `casso.webhook-secure-token` in props | skipped / covered / covered | Uses `secure-token` header in test props. |
| VietQR | — | QR generation | `/api/vietqr/generate` | Payments | `admin-sales-unmatched-vietqr.spec.mjs` (POS dialog via store settings or error) | `AdminSalesMvcIntegrationTest` | — | Store payment-settings seed in MockMvc test | partial / covered / skipped | Anonymous override denied (403 preferred; RFC7807 envelope may surface as HTTP 500 in test env — assertion documents both). |
| Batches | — | Batch/expiry API | `/api/batches` | Inventory | — | — | `BatchExpiryCorrectionIntegrationTest`, `InvoiceBatchAllocationIntegrationTest` | — | skipped / skipped / covered | |
| Loyalty API | — | Points rules + `GET /api/loyalty/settings` storefront | `/api/loyalty` | Loyalty | `storefront-auth.spec.mjs` (public GET) | `Slice8BMvcIntegrationTest` (when exercised) | `Slice8LoyaltyIntegrationTest` | H2 | partial / partial / covered | Authenticated totals via `/api/account/*` when `USER_*` set. |
| Debug | — | Dev diagnostics | `/debug` | Ops | — | — | — | — | skipped / skipped / skipped | Non-production. |

---

## Quick index: Java tests by package

Use this when mapping new BE/API coverage without scrolling the tables.

| Relative path | Focus |
|---------------|-------|
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/CriticalWatchlistGateMvcIntegrationTest.java` | **Watchlist GATE** MockMvc — POS anon 403/401; inactive variant; ROLE_USER forbidden invoice POST/PATCH; quote qty=0 BAD_REQUEST; insufficient stock BAD_REQUEST; `Idempotency-Key` invoice create dedupe stock; invoice cancel replay CONFLICT; receipt void replay; pending confirm replay; stock adjustment reverse replay; `/api/revenue/total` ignores cancelled invoices |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/ProductCreateResponseMvcIntegrationTest.java` | Product create response contract |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Slice8BMvcIntegrationTest.java` | POS scan, receipts, reports, loyalty mock |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/AdminSalesMvcIntegrationTest.java` | `/api/payment-events/*` admin gate, `/api/vietqr/generate`, webhook Casso dup |
| `NhaDanShop/src/test/java/com/example/nhadanshop/service/*IntegrationTest.java` | Domain regression (invoice, stock, production, payment, …) |
| `NhaDanShop/src/test/java/com/example/nhadanshop/service/Slice8AuthContractTest.java` | Auth/forgot/reset contracts |
| `NhaDanShop/src/test/java/com/example/nhadanshop/service/Slice8AccountContractTest.java` | Account DTO contracts |
| `NhaDanShop/src/test/java/com/example/nhadanshop/repository/*IntegrationTest.java` | SQL/report correctness |

## Selenium inventory (current)

| File | Tags | Status |
|------|------|--------|
| `helpers/e2eFixtures.mjs` | *(import)* | fixtures — `E2E-*` receipt/product/category helpers |
| `helpers/assertions.mjs` | *(import)* | `assertXlsxMagicFromGet` + waits |
| `smoke-storefront.spec.mjs` | smoke, storefront | covered |
| `smoke-admin-guard.spec.mjs` | smoke, admin | covered |
| `smoke-admin-login.spec.mjs` | smoke, admin | covered when env set; else **skipped** |
| `storefront-auth.spec.mjs` | storefront, storefront-auth-suite | partial without inventory/`USER_*` |
| `fixtures-bootstrap.spec.mjs` | fixtures-bootstrap | full/regression seed |
| `admin-sales-dashboard.spec.mjs` | admin, admin-sales-suite, watchlist-inventory-truth | covered |
| `admin-sales-pos-invoice.spec.mjs` | admin, admin-sales-suite, watchlist-pos-invoice | covered khi có SKU |
| **`admin-sales-batch-pos.spec.mjs`** | admin, admin-sales-suite, watchlist-pos-invoice | BATCH:{id} + cancel restore |
| `admin-sales-pending.spec.mjs` | admin, admin-sales-suite | partial |
| `admin-sales-invoices.spec.mjs` | admin, admin-sales-suite | partial |
| `admin-sales-unmatched-vietqr.spec.mjs` | admin, admin-sales-suite | partial |
| `watchlist-pending-to-invoice.spec.mjs` | watchlist-pending-to-invoice | covered |
| `watchlist-receipts-adjustments.spec.mjs` | watchlist-receipts-adjustments | API-heavy baseline |
| **`admin-inventory-receipt-ui.spec.mjs`** | watchlist-receipts-adjustments, watchlist-inventory-truth | UI create + list/detail + BATCH + void + dup void + delete-block |
| **`admin-inventory-stock-adjustment-ui.spec.mjs`** | watchlist-receipts-adjustments, watchlist-inventory-truth | UI create + confirm + API edge + reverse/dup |
| **`admin-inventory-expiry-batch.spec.mjs`** | watchlist-pos-invoice, watchlist-inventory-truth | Expired/unsellable guards; OOS **quote → invoice** rejects; FEFO batch delta + report shell |
| **`admin-soft-delete-archive-ui.spec.mjs`** | p5-catalog, p5-commercial, p5-directory | Product guards + voucher toggle + customer visibility + projection no-op |
| **`admin-production-gap.spec.mjs`** | watchlist-combo-production | void restore + downstream void reject |
| **`admin-reports-export-ui.spec.mjs`** | watchlist-revenue-profit, watchlist-inventory-truth | Excel + `/api/reports/inventory/this-month` + `/api/revenue/total` |
| **`admin-sales-commercial.spec.mjs`** | admin-sales-suite, watchlist-pos-invoice, watchlist-revenue-profit | Quote→invoice promo/voucher/manual/VAT + invoices UI |
| `admin-ops-catalog.spec.mjs` | p5-catalog | search + action menu |
| `admin-ops-directory.spec.mjs` | p5-directory | customers shell + supplier CRUD |
| `admin-ops-commercial.spec.mjs` | p5-commercial | promo drawer + voucher drawer + evaluate 400 |
| `admin-ops-settings.spec.mjs` | p5-settings | + session-expired modal |
| `admin-ops-inventory.spec.mjs` | p5-inventory | shells |
| `admin-ops-production.spec.mjs` | p5-production, watchlist-combo-production | smoke |
| `admin-ops-reports.spec.mjs` | p5-reports, watchlist-revenue-profit | smoke |

## Scenario-level traceability (gap-close plans)

| Scenario | Locked assertion / outcome | Selenium | API | BE | Skip / blocker |
|----------|------------------------------|----------|-----|-----|----------------|
| Receipt list/detail | ReceiptNo visible; drawer opens | `admin-inventory-receipt-ui` | GET receipts | Receipt MVC/tests | — |
| Receipt create UI | catalog line + supplier combo + save | `admin-inventory-receipt-ui` | POST receipts | Receipt MVC | — |
| BATCH label `BATCH:{id}` | Canonical POS payload | `admin-inventory-receipt-ui` | GET `/api/batches/receipt/{id}` | Batch DTO | — |
| Receipt void UI | status `voided`; batch remaining → ~0 | `admin-inventory-receipt-ui` | GET receipt | Void service | — |
| Adjustment DRAFT no stock move | projection unchanged pre-confirm | `admin-inventory-stock-adjustment-ui` | POST draft | SA service | — |
| Source-batch negative | receipt batch −Δ exact | `admin-inventory-stock-adjustment-ui` | POST+confirm | SA service | FE không có sourceBatch picker |
| Reverse + duplicate reverse | metadata + 2nd POST !ok | `admin-inventory-stock-adjustment-ui` | POST reverse | Gate/idempotency | Nếu idempotency replay 200 → điều chỉnh assert |
| Expired batch quote | POS quote fails explicit batchId | `admin-inventory-expiry-batch` | POST quote | Quote validation | — |
| Projection physical vs sellable | sum `byBatch.qty` vs POS gate | `admin-inventory-expiry-batch` | GET projections | Projection svc | — |
| POS BATCH sale + cancel restore | batch remaining parity | `admin-sales-batch-pos` | invoices/batches | Invoice allocation | — |
| Soft deactivate stocked product | PATCH rejected | `admin-soft-delete-archive-ui` | PATCH product | StockedCatalogGuard | — |
| Downstream output void reject | HTTP !ok after POS sale | `admin-production-gap` | production-orders void | ProductionOrderService | — |
| OOS oversell | POS quote may return; `POST /api/invoices` fails | `admin-inventory-expiry-batch` | POST quote+invoice | InvoiceService | Mirrors watchlist gate |
| Commercial quote→invoice parity | pricingBreakdown + COGS + cancel stock | `admin-sales-commercial` | quote+invoice | InvoiceService | Promo BE validation errors ⇒ fix DTO seed |
| Session expired modal | `nhadan:session-expired` → login `next` | `admin-ops-settings` | — | — | — |
| Catalog category dropdown | `<select>` có option thật | `admin-ops-catalog` | GET categories | Slice5 | Không có danh mục active → fail có ý |

---

*Last updated (gap-close #2 — **2026-05-05**): **27** `*.spec.mjs`; `CriticalWatchlistGateMvcIntegrationTest` **exit 0**; Selenium **`critical-watchlist` / `admin-ops` / `full`** đều **exit 0** trên stack Postgres + Boot `local` + preview **5174** (xem [`docs/test-reports/full-selenium-regression-report.md`](test-reports/full-selenium-regression-report.md)). `ERR_CONNECTION_REFUSED` nếu chỉ chạy npm mà không bật preview/BE.*

