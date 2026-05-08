# Full Selenium regression report — Report sau khi done

## Final status: **GREEN**

**Latest full run:** `AUTOMATION_SCOPE=full` → exit **0**; **27 passed**, **0 failed**, **0 skipped**.

**Truth source:** [`nha-dan-pos-c091ee5b/automation-output/automation-summary.json`](../../nha-dan-pos-c091ee5b/automation-output/automation-summary.json) → `generatedAt`: **2026-05-05T07:13:16.979Z**.

### Backend gate

`CriticalWatchlistGateMvcIntegrationTest` (Gradle `:NhaDanShop:test` single-class) → exit **0** (session — H2 in-memory suite).

---

## Regression session 2026-05-05 (gap-close stabilization + evidence)

### Preconditions

Same as documented runs below: **PostgreSQL 5432**, **`SPRING_PROFILES_ACTIVE=local`**, **`NhaDanShop/src/main/resources/application-local.properties`** with DB + GHN (guest quote parity), **`CORS_ALLOWED_ORIGINS`** including **5174**, **Vite preview** on **127.0.0.1:5174** proxying `/api` → **8080**.

### Commands run & exit codes

| Scope / gate | Exit | Passed / Failed / Skipped | Log / notes |
|----------------|-----|---------------------------|-------------|
| `CriticalWatchlistGateMvcIntegrationTest` | **0** | Gradle single test | Maven-style: `:test --tests "...CriticalWatchlist..."` |
| `AUTOMATION_SCOPE=critical-watchlist` (+ `ADMIN_USERNAME`/`PASSWORD`) | **0** | 14 / 0 / 0 | `selenium-gap-close-watchlist-2.log` (repo root) |
| `AUTOMATION_SCOPE=admin-ops` | **0** | 12 / 0 / 0 | `selenium-gap-close-admin-ops-2.log` |
| `AUTOMATION_SCOPE=full` | **0** | **27 / 0 / 0** | `selenium-gap-close-full-2.log` |

**PowerShell (full suite — unchanged operator recipe):**

```powershell
Set-Location C:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b
$env:CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174'
$env:RUN_AUTOMATION = '1'
$env:AUTOMATION_SCOPE = 'full'
$env:BASE_URL = 'http://127.0.0.1:5174'
$env:API_BASE_URL = 'http://127.0.0.1:5174'
$env:HEADLESS = '1'
npm run test:automation -- --run
```

Watchlist/admin-ops with **default empty admin** (`admin-ops`, `critical-watchlist`) **require** `$env:ADMIN_USERNAME='admin'; $env:ADMIN_PASSWORD='admin123'` unless using `full` (defaults **`admin` / `admin123`**).

### Spec inventory

Discoverable **`*.spec.mjs`** modules under `automation/selenium/specs/`: **27** (fixtures-bootstrap + smoke + gap-close suites).

---

## Stability fixes bundled in this report cycle

| Area | Change |
|------|--------|
| Receipt duplicate `PATCH .../void` | Selenium aligns with **MV(C) gate**: second void **without** `Idempotency-Key` → **409 CONFLICT**, not necessarily 2xx. |
| Stock adjustment UI +2 | Controlled React qty: **`Ctrl+A` + `DELETE` + `sendKeys`**; strict wait until URL leaves `/create`. |
| OOS assertion | Matches BE: **`POST /api/sales/quote`** may succeed; **`POST /api/invoices`** must fail on oversell. |
| Catalog row / ellipsis | Products filter: deep-link **`/admin/products?q=...`** to avoid flaky controlled search input typing. |
| Full + `AUTOMATION_NO_SKIP` | `pickSellableVariantScan(..., { minAvail: 2 })` for **`admin-sales-pos-invoice`** to avoid pointless skip-turned-fail when first eligible row had **sellable quantity 1**. |

---

## Artifacts & session logs

| Item | Path |
|------|------|
| Summary JSON | `nha-dan-pos-c091ee5b/automation-output/automation-summary.json` |
| Session transcripts | `C:\Work\NhaDanShopBT\selenium-gap-close-watchlist-2.log`, `selenium-gap-close-admin-ops-2.log`, `selenium-gap-close-full-2.log` |
| Backend log (when using background bootRun) | `C:\Work\NhaDanShopBT\selenium-verify-be-local.log` |

---

## Files touched (this cycle)

- `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-inventory-receipt-ui.spec.mjs`
- `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-inventory-stock-adjustment-ui.spec.mjs`
- `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-inventory-expiry-batch.spec.mjs`
- `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-ops-catalog.spec.mjs`
- `nha-dan-pos-c091ee5b/automation/selenium/specs/admin-sales-pos-invoice.spec.mjs`
- `nha-dan-pos-c091ee5b/automation/selenium/helpers/adminSales.mjs`
- `docs/regression-coverage-matrix.md`
- `docs/test-reports/full-selenium-regression-report.md` (this file)

---

## CI

- Workflow: [`.github/workflows/ci-regression-gates.yml`](../../.github/workflows/ci-regression-gates.yml).
- Full-stack Selenium in CI requires the same GHN-backed **`local`** (or secrets) parity as guest quote paths.

---

## Residual risks & notes

- **`[admin-sales] Drawer title not matched`** during invoices spec is a **console notice** — spec **passed**.
- Receipt void **idempotent replay** remains **`200`** only when callers repeat **`PATCH /void`** with the **same idempotency key**; bare duplicate void is intentionally **409**.
