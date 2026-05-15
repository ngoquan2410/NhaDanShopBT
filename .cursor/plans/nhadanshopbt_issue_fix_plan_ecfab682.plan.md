---
name: NhaDanShopBT Fix Plan V2 — Guarded Implementation Plan
overview: Guarded, slice-based implementation plan. Prior read-only audit confirmed most FE baseline items (global Sonner, UserFormDrawer onSave, DateInput/local today, storefront nav + URL q, receipt blocked copy/gating, revenue debounced backend picker, stock adjustment advisory). Remaining work centers on formal baseline re-verify (Slice A), diagnosis-first RevenueReport product picker + `/api/products` search contract standardization (Slice B — RBCT and variant-aware parent-product search only when evidence proves backend predicate is root cause), **Slice B2 — backend-owned search/filter normalization across admin/POS/pickers/lists (remove first-N + client-side filter debt)**, ADMIN-only roles API + FE role truth, stock adjustment sourceBatchId FE/BE validation alignment, storefront paginated backend search (remove first-200 client filter), local date defaults cleanup, receipt deleteBlockReason/void mapping hardening, and deferred reviews + WebSocket chat. No application code is changed by editing this plan file.
todos:
  - id: slice-a-verify-baseline
    content: Verify FE baseline (Sonner, UserFormDrawer, DateInput, receipts gating, nav/q, RevenueReport picker, StockAdjustment advisory); stop if any item missing
    status: completed
  - id: slice-b-variant-search
    content: Audit Revenue product picker and product/catalog search contract; prove RBCT failure path; standardize /api/products search as variant-aware parent-product search only if backend predicate is root cause; preserve report, promotion, transaction, storefront, and stock semantics
    status: pending
  - id: slice-b2-backend-search-normalization
    content: Full grep audit + audit table; mandatory B2 Selenium/API matrix (every caseResult in plan, no false PASS); automation-summary.json schema; isolated SLICEB2 fixtures; PASS only with network evidence; DEBT/SKIPPED/OUT_OF_SCOPE documented; split B2.1/2.2 if needed; no UI redesign; no semantics/auth/public leak regressions
    status: pending
  - id: slice-c-roles-api
    content: GET /api/admin/roles (ADMIN-only); UserFormDrawer from backend; fix staff→ROLE_USER; ROLE_STAFF from DB/migration
    status: pending
  - id: slice-d-stock-source-batch
    content: FE batch select + sourceBatchId; BE validates variant ownership + remainingQty; reversal/allocation invariants
    status: pending
  - id: slice-e-storefront-paginated-search
    content: Public catalog paginated search; q drives backend; remove size=200 client-only filter; stale guard
    status: pending
  - id: slice-f-date-local-defaults
    content: Replace toISOString().slice(0,10) defaults with localDate helpers; do not alter backend instant semantics
    status: pending
  - id: slice-g-receipt-delete-void-hardening
    content: deleteBlockReason consistency; downstream_consumption vs void; no history/invoice rewrite
    status: pending
  - id: slice-h-defer-reviews
    content: Future slice — product reviews/comments; plan only
    status: pending
  - id: slice-i-defer-websocket-chat
    content: Future slice — WebSocket/STOMP chat; plan only
    status: pending
isProject: false
---

# NhaDanShopBT Fix Plan V2 — Guarded Implementation Plan

## 0. Confirmation

- This document is **plan-only**. It describes intended work, guards, tests, and stop conditions; it is not an implementation.
- **Editing this plan file must not change application source code**, migrations, configs, or dependencies. This revision updates planning text only.
- **Implementation must wait for explicit owner approval** of the next slice. Do not code, migrate, or merge without that approval.

---

## 1. Current Baseline Summary

### What is already fixed or verified in the current repo (read-only audit)

- **Global Sonner / toast:** [`nha-dan-pos-c091ee5b/src/components/ui/sonner.tsx`](nha-dan-pos-c091ee5b/src/components/ui/sonner.tsx) — top-right, `expand={false}`, `visibleToasts={3}`; single `<Sonner />` in [`App.tsx`](nha-dan-pos-c091ee5b/src/App.tsx); **no** `window.history.pushState` monkey-patch found.
- **UserFormDrawer `onSave`:** [`UserFormDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx) destructures `onSave` and invokes it from submit (props + submit path verified).
- **DateInput + local date helper:** [`DateInput.tsx`](nha-dan-pos-c091ee5b/src/components/shared/DateInput.tsx) uses [`localDate.ts`](nha-dan-pos-c091ee5b/src/lib/localDate.ts) for `max` / local today bounds.
- **Storefront search baseline (partial):** [`StorefrontNav.tsx`](nha-dan-pos-c091ee5b/src/components/layout/StorefrontNav.tsx) navigates to `/products?q=...`; [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx) reads `q` via `URLSearchParams` — **but** catalog load is still first-page limited (see Remains).
- **RevenueReport backend-search baseline:** [`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx) uses debounced backend `productService.list` (e.g. 250ms, page size 20) for the product picker.
- **Receipt blocked UX / gating:** [`GoodsReceipts.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx) and [`GoodsReceiptDetailDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/GoodsReceiptDetailDrawer.tsx) gate downstream messaging on `deleteBlockReason === "downstream_consumption"`; [`ReceiptDeleteBlockedDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptDeleteBlockedDialog.tsx) uses “Phiếu nhập/lô...” copy (no spaces around slash).
- **StockAdjustment advisory panel:** [`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx) shows advisory; backend already accepts [`sourceBatchId`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/StockAdjustmentRequest.java) in [`StockAdjustmentService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) — FE payload wiring remains (Slice D).

### What remains

- **RevenueReport product picker / RBCT search contract (diagnosis required):** Owner-provided fact — **RBCT exists as both product code and variant code**; other pages can find RBCT; **only** Revenue UI → “Lọc theo sản phẩm” fails. Therefore the failure is **not** adequately explained by “variant fields missing from backend search” alone. Slice B must **prove** the failure path (FE vs adapter vs backend vs filters vs session) before changing [`ProductRepository.searchProducts`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java) or any consumer.
- **Roles endpoint + FE real roles:** No `GET /api/admin/roles`; [`UserFormDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx) documents hardcoded options; [`adminUsers.save`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts) maps staff → **`ROLE_USER`** (incorrect vs `ROLE_STAFF`).
- **Stock adjustment `sourceBatchId`:** FE POST omits `sourceBatchId`; need FE batch selection + submit, BE validation of ownership and `remainingQty` for negative lines, reversal/allocation invariants (Slice D).
- **Storefront first-200 search scalability:** [`publicCatalog.ts`](nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts) loads `page=0&size=200`; [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx) filters client-side — products beyond that window are invisible to search (**Slice E**; aligns with B2 core rule for public catalog).
- **Widespread first-N + local filter debt (owner-verified):** Many admin/POS flows still preload fixed pages (`size=50`/`100`/`200`/`500`/`1000`) then filter in the browser — records outside the first window are invisible (e.g. AdminTopbar, Admin Products, POS, promotion pickers, production recipe pickers, stock adjustments list, invoices/pending orders patterns). **Slice B2** audits and moves these to backend-owned `search`/filter + pagination per field classification; **do not** conflate with Slice B’s narrow RBCT/Revenue diagnosis scope.
- **Remaining local date defaults:** `new Date().toISOString().slice(0, 10)` still in e.g. [`ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx), [`InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx), [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx), [`Invoices.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Invoices.tsx), [`ReceiptImportPreviewDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptImportPreviewDialog.tsx), [`lib/promotions.ts`](nha-dan-pos-c091ee5b/src/lib/promotions.ts) — can skew “today” vs `DateInput` max in UTC+7 evening.
- **Receipt `deleteBlockReason` hardening (if needed):** BE delete/void rules exist ([`ReceiptDeleteEligibility`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java), [`InventoryReceiptService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)); ensure API/UI mapping never shows downstream copy for non-downstream reasons (Slice G).
- **Reviews:** deferred feature slice (Slice H).
- **WebSocket chat:** deferred; no `spring-boot-starter-websocket` in [`build.gradle`](NhaDanShop/build.gradle) today (Slice I).

### Top risks

- **Role truth drift** — staff saved as `ROLE_USER`, JWT/admin boundaries wrong.
- **Stock / batch mutation correctness** — wrong batch, insufficient qty, broken reversal invariant.
- **Query / performance regressions** — N+1, query-in-loop, unbounded loads, duplicate rows breaking pagination counts.
- **Receipt void vs delete semantics** — hard delete vs void, downstream consumption, history/invoice integrity.
- **Storefront search completeness** — client-only filter over partial catalog misses real inventory.

---

## 2. Global Guardlist

### 2.1 Business Logic Truth Guardlist

- **Backend is the production source of truth** for inventory, receipts, invoices, roles, and pricing used in mutations and reports.
- **Active production screens use backend adapters**, not cloud/local mocks as SoT.
- **`ProductBatch.remainingQty` is canonical stock truth** for physical batch-level inventory.
- **`ProductVariant.stockQty` is projection / compatibility only**; must stay consistent with batch sums after confirm/reverse.
- **FE must never direct-write `stockQty` or `remainingQty`**; all stock mutations go through **controlled backend mutation paths** only.
- **Confirm / reverse preserves:** `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)` (for affected variants) per service rules.
- **Receipt with downstream consumption must not be hard-deleted** in a way that destroys required history or allocations.
- **Receipt void is not delete** — void preserves receipt row, batch rows, invoice allocation, and movement history per existing service semantics; void only affects **remaining** receipt-owned batch quantity where applicable.
- **UI/API must distinguish `downstream_consumption`** from other delete-block reasons — no false “downstream” messaging.
- **Negative stock adjustment with `sourceBatchId` deducts the exact selected batch**; unsourced negative adjustment must **not** silently misuse “sales sellable” predicates for batch selection where business rules forbid it.
- **Reversal uses allocation trace** as implemented in backend services — do not invent FE-side reversal logic.
- **Revenue / profit reports use persisted invoice line snapshots** — do not recompute historical revenue/profit from **current** catalog prices or live product rows.
- **ADMIN / STAFF / CUSTOMER role truth must not be weakened** — Staff must **not** be mapped to `ROLE_USER` for “staff”; Customer must **not** gain admin access.
- **UI must not hide real runtime/business errors or fake success** — surface clean business messages from backend responses.

### 2.2 Performance / Query Guardlist

- **No N+1 queries** on list/search/report endpoints after changes.
- **No DB query inside loops** over unbounded collections; **no repository/service call per item** when a batch fetch is possible.
- **No unbounded `findAll()`** for production list/search/report APIs.
- **No full-table load + Java filtering** for production search/list/report APIs.
- **No client-side filtering after loading only the first page** when total data can exceed one page (storefront catalog search).
- **No per-row frontend API calls** for standard lists (e.g. one request per table row).
- **No broad `JOIN FETCH` of collections on paginated queries** if it duplicates parent rows — prefer EXISTS/subselect or two-phase fetch patterns already used (e.g. variants by product id list).
- **No recursive/lazy entity serialization** surprises in API responses.
- **No huge unbounded frontend state payload** (e.g. entire catalog in memory).
- **No WebSocket large payload broadcast** (future chat slice).
- **No report totals computed from partial frontend pages** — totals from backend or full export semantics only.
- **Every changed backend query must specify (in slice plans or PR notes):**
  - query shape (JPQL/SQL outline)
  - pagination yes/no
  - sorting yes/no
  - DB vs memory filtering
  - expected SQL/query count per request (order of magnitude)
  - N+1 risk
  - query-in-loop risk
  - full-table-load risk
  - index needs (if any)
  - SQL log / Hibernate statistics verification steps

### 2.3 Security / Role Guardlist

- **ADMIN-only** admin roles endpoint (`GET /api/admin/roles` or equivalent path).
- **STAFF must remain separate from `ROLE_USER`** in persistence and JWT authorities.
- **CUSTOMER / `ROLE_USER` must not access admin** routes or admin APIs.
- **Staff must not gain unauthorized admin scopes** via guard broadening or mapper bugs.
- **Role dropdown source is roles table via backend endpoint** — no stale hardcoded role lists for assignable admin users (except owner-approved temporary fallback, explicitly documented).
- **Do not expose roles in admin UI** beyond owner-approved assignable set; **no route guard broadening** without explicit approval.

### 2.4 UI / Error Handling Guardlist

- **Show clean business messages** (including localized copy where used today).
- **Do not swallow backend errors** or replace with generic success.
- **Do not fake success** on failed mutations.
- **Do not show downstream receipt warning** for non-`downstream_consumption` reasons.
- **Date UI uses local date helpers** only for UI date/date-time values and local “today” defaults — **do not alter backend timestamp semantics** or promotion validity instants accidentally.
- **Legacy `toaster.tsx` / `useToast`:** must not be mounted alongside global Sonner in a way that duplicates toasts (verify in Slice A).

---

## 3. Slice Plans

*Every slice uses the subsection template below. Each test lists: **setup data**, **action**, **expected result**, **invariant to verify**.*

### Slice A — Verify completed FE baseline, no rework

- **Scope:** Confirm no regression on already-implemented baseline: global Sonner, `UserFormDrawer` submit, `DateInput` local max/today, receipt downstream gating/copy, storefront nav + URL `q`, RevenueReport debounced backend product picker, StockAdjustment advisory. **No code changes** unless verification discovers a missing baseline item.
- **Explicit Out of Scope:** Implementing variant search, roles API, stock batch wiring, storefront pagination, date default refactors, receipt BE changes — those are Slices B–G.
- **Business Logic Truth Guardlist:** N/A for verification-only slice (no behavior change intended) — re-validate that production paths still use backend adapters and no mock SoT regressed.
- **Performance / Query Guardlist:** N/A — no new queries.
- **Files likely changed:** None if verification passes; otherwise only files proven missing baseline (list explicitly in implementation PR).
- **API/DTO changes:** None.
- **DB migration/index changes:** None.
- **Implementation approach:** Checklist + grep + optional Vitest/smoke: confirm single Sonner mount, no `pushState` patch, receipt gating strictly `deleteBlockReason === "downstream_consumption"`, nav → `/products?q=...`, `Products` reads `q` from `URLSearchParams`, RevenueReport picker still debounced backend list.
- **Acceptance Criteria:**
  - Sonner has **no** `window.history.pushState` monkey patch.
  - **Only** intended global toaster mounted (e.g. single `<Sonner />` in `App`).
  - `visibleToasts` max **3** and `expand` **false**.
  - `onSave` is destructured and used in `UserFormDrawer` submit.
  - `DateInput` uses local date helper for `max` / today.
  - `GoodsReceipts` and `GoodsReceiptDetailDrawer` show downstream message **only** when `deleteBlockReason === "downstream_consumption"`.
  - Exact blocked dialog text uses **“Phiếu nhập/lô...”** (confirmed style).
  - `StorefrontNav` navigates to `/products?q=...`.
  - `Products` reads `q` from `URLSearchParams`.
  - **No file edits** in this slice unless verification finds a gap.
- **Integration Test Plan:** N/A — no backend change; **FE smoke/manual** or existing component tests if already present.
- **Regression Test Plan:** Quick pass: open admin users drawer, open goods receipts list/detail, open storefront products with `?q=`, open RevenueReport picker — **no console errors**, toasts behave.
- **Performance Validation Plan:** N/A.
- **Manual QA Checklist:** Toast clutter (max 3); one-shot user save; date max = local today evening (VN); receipt blocked dialog only on downstream; search URL sync.
- **Rollback Plan:** N/A (no deployable code change if verification-only).
- **Stop Conditions:** **If any baseline item is missing, stop** and report the **exact missing item** and file/line evidence **before** planning implementation for that item.

---

### Slice B — Diagnose and standardize product/catalog search contract for Revenue picker + variant-aware search

#### Mandatory business logic truth (non-regression) requirements

Slice B **must** state that implementation is **not** allowed to change any of the following semantics:

1. **Revenue / profit truth**
   - Revenue/profit reports must continue to use **persisted invoice line snapshots**.
   - Do **not** recompute historical revenue/profit from current `Product` / `ProductVariant` / catalog data.
   - RevenueReport may find a **parent product** by variant code/name, but the selected filter remains **`productId` / `productIds`** unless the owner separately approves variant-level reporting.
   - Product search changes must **not** alter report aggregation, totals, export semantics, VAT, shipping, COGS, discount allocation, or invoice snapshot usage.

2. **Promotion truth**
   - Promotion **PRODUCT** scope remains **product-level**.
   - Finding a parent product by variant code/name does **not** mean promotion becomes variant-level.
   - Do **not** change promotion evaluation, quote, voucher, loyalty, or gift logic.

3. **Stock / batch truth**
   - `ProductBatch.remainingQty` remains **stock truth**.
   - `ProductVariant.stockQty` remains **projection/compatibility** only.
   - Search changes must **not** mutate stock.
   - Search changes must **not** alter FEFO, `sourceBatchId`, receipt void, stock adjustment, invoice allocation, or batch selection.
   - POS / receipt / stock adjustment flows must **not** start defaulting to arbitrary variants as a side effect of search changes.

4. **Storefront visibility truth**
   - Public search must **not** expose inactive products, inactive variants, non-sellable variants, raw/admin-only variants, archived products, or admin-only inventory data.
   - If `/api/products` is shared by public/admin flows, Slice B must **preserve** or **explicitly document** separate visibility predicates.

5. **Auth / role truth**
   - Search changes must **not** broaden admin/customer/staff access.
   - Do **not** change security guards or route permissions in Slice B.

6. **API contract truth**
   - Preserve `Page<ProductResponse>` unless the owner explicitly approves an additive/backward-compatible DTO change.
   - Matching variant fields may return the **parent `Product` once** for parent-selection screens.
   - Do **not** change product-level selection screens into variant-level selection screens.
   - Do **not** change transaction screens without explicit approval.

7. **Performance truth**
   - No full-table Java filtering for production search.
   - No client-side filtering after loading only the first page as a **new** pattern.
   - No N+1.
   - No query-in-loop.
   - No `JOIN FETCH` collection on paginated `Product` query.
   - Data query and count query must be **aligned**.

#### Scope (diagnosis-first)

- First **diagnose** why RevenueReport product picker cannot find RBCT even though RBCT is both product code and variant code.
- Classify the failure as **A)** FE/adapter/runtime in RevenueReport picker, **B)** backend `/api/products` search contract, **C)** active/filter/database/session mismatch, or **D)** mixed product/variant search contracts across pages.
- Inspect FE request path, adapter mapping, backend endpoint, repository predicate, active/`includeInactive`/category/`productType` filters, direct API behavior, and possible swallowed errors.
- Compare other pages where RBCT works and document whether they use backend search, client-side filtering, product-only filtering, product+variant filtering, variant selection, or batch selection.
- If direct `GET /api/products?search=RBCT&page=0&size=20&sort=name,asc` **already** returns the parent product before fix, fix FE/adapter/render/stale/error handling **only**.
- If direct backend search does **not** return RBCT and repository predicate/filter is root cause, update backend search to be **variant-aware** (parent `Product` once).
- If data/filter/session mismatch is found, **stop** and report evidence before broad code changes.
- **Do not** change revenue math, invoice snapshots, promotion scope, stock mutation, storefront visibility, or transaction selection semantics.

#### Core Search Rules

- **Selection result = `productId` does NOT mean search only product fields.**
- **If `/api/products?search=RBCT` already returns the product, stop backend work and fix FE path only.**
- **Search target** and **selection result** are different:
  - **Search target** = fields matched by the user keyword.
  - **Selection result** = object/id selected by that screen.
- A **product-level** screen may still need **variant-aware search** to find the parent product.
- A **transaction** screen must **not** silently default to an arbitrary variant when business requires variant or batch selection.
- **Default catalog search** should be variant-aware unless a screen **explicitly** documents product-only semantics.
- Matching a variant may return the **parent `Product`** when the screen is **product-parent selection**.
- Matching a variant must return/select a **variant** when the screen is a transaction flow requiring **variant identity**.
- Matching a batch/scan code must **not** be weakened into product/variant guessing.

#### Current BE search contract to verify

- **Current expected path:**
  - FE `productService.list({ query })`
  - [`BackendProductAdapter`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendProductAdapter.ts) (and [`HybridProductAdapter`](nha-dan-pos-c091ee5b/src/services/adapters/HybridProductAdapter.ts) if in path)
  - `GET /api/products?search=...`
  - [`ProductController.list(...)`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java)
  - [`ProductService.search(...)`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java)
  - [`ProductRepository.searchProducts(...)`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java)
- **Current suspected** backend repository predicate matches only:
  - `Product.name`
  - `Product.code`
- **Current suspected missing** backend predicate:
  - `ProductVariant.variantCode`
  - `ProductVariant.variantName`
- Because the owner says **RBCT exists as BOTH product code and variant code**, a **missing variant predicate alone does NOT fully explain** the Revenue picker failure.
- Therefore Slice B must **first** verify direct API behavior:
  - `GET /api/products?search=RBCT&page=0&size=20&sort=name,asc`
- If this direct API returns the RBCT **parent product** before any fix, **do not** change backend search for the Revenue bug; fix FE/adapter/render/stale/error handling instead.
- If this direct API does **not** return RBCT, diagnose filters/data first:
  - actual `product.code`
  - actual `product.name`
  - `product.active`
  - `product.productType`
  - `variant.variantCode`
  - `variant.variantName`
  - `variant.active`
  - `variant.isSellable`
  - category filter
  - `includeInactive` / default active behavior
  - backend/database/session mismatch
  - auth/`adminFetch` swallowed error

#### Search semantic classes

##### PRODUCT_PARENT_SELECTION

- Search may match product fields **and** variant fields.
- Selected result is parent **`productId`**.
- Used by RevenueReport, ProfitReport, product-level promotion pickers, admin catalog navigation.
- **Guard:** Do not silently convert to variant-level behavior. Revenue/profit still use invoice snapshots. Promotion PRODUCT scope remains product-level.

##### VARIANT_SELECTION_REQUIRED

- Search/selection must identify a **specific** variant.
- Used by POS item selection, goods receipt lines, stock adjustment lines, inventory reports, production recipe components/output, combo components.
- **Guard:** Do not choose default/first variant unless existing behavior is explicitly preserved and documented as debt. Transaction flows eventually need variant-level picker/search.

##### BATCH_SELECTION_REQUIRED

- Search/scan/selection must identify an **exact** batch.
- Used by exact-batch POS sale, stock adjustment `sourceBatchId`, receipt/batch handling.
- **Guard:** Product/variant search is insufficient. Do not weaken batch truth.

##### PUBLIC_CATALOG_SEARCH

- Search may match product and variant fields.
- Must only expose **active + sellable** product/variant data.
- **Guard:** Do not leak inactive, non-sellable, raw/admin-only variants.

##### ADMIN_CATALOG_SEARCH

- Search may include inactive/non-sellable depending on admin/`includeInactive` context.
- **Guard:** Preserve `includeInactive` and historical/master data visibility semantics.

##### MASTER_DATA_EDIT / MASTER_DATA_IMPORT_VALIDATION

- Product form/import validation must distinguish **product code uniqueness** and **variant code uniqueness**.
- **Guard:** Not the same as catalog search. Do not confuse product master edit with transaction search.

#### FE page classification — product vs variant vs batch search

| Page / Component | Current search path to audit | Correct business selection semantic | Search should match | Slice B impact |
|---|---|---|---|---|
| `RevenueReport.tsx` | Backend `productService.list({ query })` → `/api/products?search` | `PRODUCT_PARENT_SELECTION` | product code/name + variant code/name; result parent `productId` | Must diagnose/fix RBCT here; report remains `productId` filter |
| `ProfitReport.tsx` | Product list then local/filter path to verify | `PRODUCT_PARENT_SELECTION` | product + variant; result parent `productId` | Debt/follow-up unless same service fix helps |
| Admin `Products.tsx` | Product list and local search/filter to verify | `ADMIN_CATALOG_SEARCH` | product + variant; result parent product row | Debt/follow-up; do not break `includeInactive` |
| `AdminTopbar.tsx` | Local/global product search path to verify | `GLOBAL_NAV_TO_PRODUCT_PARENT` | product + variant | Classify; likely incomplete if first-page limited |
| Storefront `Products.tsx` + `publicCatalog.ts` | `/products?q` plus public catalog load/filter to verify | `PUBLIC_CATALOG_SEARCH` | product + variant, but active + sellable only | Slice E owns full fix; Slice B must not leak inactive/non-sellable |
| `POS.tsx` grid/search | Product grid/search + scan path to verify | `VARIANT_SELECTION_REQUIRED`; `BATCH_SELECTION_REQUIRED` for scan | variant; batch when scanned | Do not default arbitrary variant as new behavior; document debt |
| `POS.tsx` barcode/scan | `fetchPosScan` / `/api/pos/scan/{code}` | `VARIANT_SELECTION_REQUIRED` or `BATCH_SELECTION_REQUIRED` | variant code/barcode or `BATCH:{id}` | Contrast only; do not change in Slice B |
| `GoodsReceiptCreate.tsx` | Manual catalog add/import search to verify | `VARIANT_SELECTION_REQUIRED` | product + variant, selected `variantId` | Debt if first-N client filter; do not change receipt semantics |
| `StockAdjustmentCreate.tsx` | Inventory projection search to verify | `VARIANT_SELECTION_REQUIRED`; source reasons need `BATCH_SELECTION_REQUIRED` | variant + batch/`sourceBatchId` | Slice D owns batch wiring; do not change here |
| `InventoryReport.tsx` | Inventory report/projection search to verify | `VARIANT_LEVEL_REPORT_SEARCH` | product + variant | Must remain variant-aware |
| `ProductionRecipeFormPage.tsx` | Product then variant select to verify | `VARIANT_SELECTION_REQUIRED` | variant-aware parent finding or direct variant picker | Debt/follow-up |
| `Combos.tsx` | Product + variant component selection to verify | `VARIANT_SELECTION_REQUIRED` | variant-aware | Debt/follow-up; do not default arbitrary variant |
| `ProductPicker.tsx` / `ProductQuantityList.tsx` promotion pickers | Product picker search to verify | `PRODUCT_PARENT_SELECTION` for promotion PRODUCT scope | product + variant; result `productId` | Do not change promotion PRODUCT scope into variant-level |
| `ProductImportReview.tsx` | Import review/dedup search to verify | `MASTER_DATA_IMPORT_VALIDATION` | product + variant code/name validation | Separate validation debt |
| Product create/edit forms | Master data form fields | `MASTER_DATA_EDIT` | not a catalog search; validate product and variant codes separately | Out of Slice B unless directly broken |

#### Search consumer audit required before coding

Slice B must **explicitly require** auditing these FE/BE paths **before** implementation.

**FE:**

- [`nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx)
- [`nha-dan-pos-c091ee5b/src/components/layout/AdminTopbar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminTopbar.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx)
- [`nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts`](nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts)
- [`nha-dan-pos-c091ee5b/src/pages/admin/POS.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/POS.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/ProductionRecipeFormPage.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProductionRecipeFormPage.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/Combos.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Combos.tsx)
- [`nha-dan-pos-c091ee5b/src/components/shared/ProductPicker.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ProductPicker.tsx)
- [`nha-dan-pos-c091ee5b/src/components/shared/ProductQuantityList.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ProductQuantityList.tsx)
- [`nha-dan-pos-c091ee5b/src/pages/admin/ProductImportReview.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProductImportReview.tsx)
- Product/promotion picker components if paths differ in current repo.

**FE services/adapters:**

- [`nha-dan-pos-c091ee5b/src/services/index.ts`](nha-dan-pos-c091ee5b/src/services/index.ts)
- [`nha-dan-pos-c091ee5b/src/services/adapters/HybridProductAdapter.ts`](nha-dan-pos-c091ee5b/src/services/adapters/HybridProductAdapter.ts)
- [`nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendProductAdapter.ts`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendProductAdapter.ts)

**BE:**

- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java)
- [`NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java)
- Variant repository/service paths if used by product search.
- POS scan endpoint/service if relevant for **contrast only**.

For **each** consumer, document:

- file path
- API/service used
- backend search vs client-side filtering
- product-only vs product+variant vs variant/batch
- selection semantic class
- whether Slice B changes it
- whether it is safe now or deferred debt

#### Decision table for implementation

| Finding | Required action |
|---|---|
| Direct `/api/products?search=RBCT` returns RBCT parent product, but Revenue picker is empty | Do **not** change backend search for this bug; fix FE/adapter/render/stale/error path only |
| Direct `/api/products?search=RBCT` does **not** return RBCT and DB confirms product/variant should match | Diagnose filters first, then fix backend search contract if repository predicate/filter is root cause |
| RBCT product/variant data is absent or different in actual DB | **Stop** and report data mismatch; do not broad-rewrite search |
| Product is inactive and default endpoint excludes inactive | Preserve `includeInactive`/default active semantics; report whether Revenue picker should include inactive |
| Category/`productType` filter excludes product | Preserve filters; fix caller only if wrong filter is sent |
| Revenue picker uses different backend/session/database | **Stop** and report environment/session mismatch |
| Auth/`adminFetch` error is swallowed and shown as empty result | Fix FE error handling/path, not backend predicate |
| Backend search fix would change report calculations | **Stop**; report semantics must remain snapshot-based |
| Backend search fix would change promotion PRODUCT scope | **Stop**; promotion remains product-level unless owner approves variant-level promotion |
| Backend search fix would change POS/receipt/stock adjustment selection semantics | **Stop**; transaction variant/batch selection is separate |
| Backend query duplicates products or breaks `totalElements` | **Stop** and use EXISTS/subquery with **aligned** count query |
| Backend fix requires DTO/API breaking change | **Stop** unless owner explicitly approves |

#### Diagnosis paths

##### PATH A — FE / adapter / runtime bug

**Use if:**

- Direct backend `/api/products?search=RBCT&page=0&size=20&sort=name,asc` returns the expected parent product **before** fix,
- but RevenueReport picker still does not show it.

**Allowed fixes:**

- RevenueReport picker request param
- adapter query/search mapping
- response mapping
- stale debounce response
- swallowed error converted into empty result
- render/display/selection state bug

**Guard:** Do **NOT** change `ProductRepository` for the Revenue bug in Path A. Only change backend search separately if Slice B evidence proves a **wider** contract issue and changes are safe.

##### PATH B — Backend search contract bug

**Use if:**

- Direct backend `/api/products?search=RBCT&page=0&size=20&sort=name,asc` does **not** return the expected parent product,
- DB confirms product/variant should match,
- and repository predicate/filter is confirmed root cause.

**Allowed fix:**

- Make `/api/products?search=...` **variant-aware** while still returning parent `Product` **once**.

##### PATH C — Data / filter / session mismatch

**Use if:**

- actual DB `product.code` is not RBCT,
- actual `variant.variantCode` is not RBCT,
- `product.active` / `includeInactive` filter excludes it,
- category/`productType` filter excludes it,
- Revenue picker points to different backend/database/session,
- auth/`adminFetch` error is swallowed.

**Required action:** **Stop** and report evidence before broad search rewrite.

#### Implementation and acceptance

- **Explicit Out of Scope:** Changing invoice snapshot schema; changing RevenueReport aggregation math, VAT, shipping, COGS, discount allocation; changing promotion PRODUCT scope to variant-level; changing stock mutation, FEFO, receipt void, batch allocation; broadening auth; weakening public active/sellable guards; storefront pagination slice (Slice E) except **documenting** shared `/api/products` predicate impact. Transaction screens (POS, receipt, stock adjustment) — **no** semantic change in Slice B.
- **Business logic truth guardlist:** Align with **Mandatory business logic truth** above and §2.1 (backend SoT; batch truth; snapshots; roles). **Product** is master catalog/group; **ProductVariant** is the real transaction unit for sale/import/stock/batch/quote/invoice/production; **product-level stock is not canonical**; `ProductBatch.remainingQty` is stock truth; `ProductVariant.stockQty` is projection/compatibility only.
- **Performance / query guardlist:** §2.2; for Path B only — see **Path B implementation requirements** below. No full-table Java filter; no N+1; no query-in-loop; data/count predicates aligned; no `JOIN FETCH` collection on paginated product query.
- **Files likely changed (evidence-dependent):** Path A — RevenueReport, adapters, services index; Path B — [`ProductRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java), possibly [`ProductService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java) (helpers only), tests; Path C — **documentation/evidence** first, code only after proven root cause.
- **API/DTO changes:** Preserve `Page<ProductResponse>`; backward-compatible additive fields **only** with owner approval.
- **DB migration/index changes:** **None** in this slice unless owner explicitly approves after `EXPLAIN`.
- **Path B implementation requirements (only when Path B is proven):** Match `product.code`, `product.name`, `variant.variantCode`, `variant.variantName`; return parent `Product` **once**; preserve `Page<ProductResponse>`, pagination, sorting, category filter, `productType` filter, `includeInactive`/default active behavior; use EXISTS/subquery or equivalent; keep **data** query and **count** query predicates **aligned**; no `JOIN FETCH` collection on paginated query; **no** duplicate parent products; no full-table Java filtering; no N+1; no DTO/API breaking change; no DB migration/index unless owner approves after `EXPLAIN`.
- **Acceptance criteria:**
  - Revenue picker finds RBCT.
  - Direct `/api/products?search=RBCT&page=0&size=20&sort=name,asc` behavior is **documented before and after** fix.
  - Actual RBCT DB/API proof recorded: `product.id`, `product.code`, `product.name`, `product.active`, `product.productType`, `variant.id`, `variant.variantCode`, `variant.variantName`, `variant.active`, `variant.isSellable`.
  - **If backend fixed:** productCode search works; productName search works; variantCode search works; variantName search works; multiple matching variants return parent **once**; `totalElements` correct; pagination metadata correct; `includeInactive`/default active behavior unchanged; category/`productType` filters preserved.
  - **If FE fixed:** RevenueReport sends correct search param; backend response contains product; picker renders product; selecting product sends `productId`/`productIds` to report APIs; stale/debounce/error state cannot hide valid backend result.
  - Report snapshot semantics untouched; promotion scope semantics untouched; transaction variant/batch selection semantics untouched; storefront public active/sellable visibility untouched; auth/role access untouched; stock/batch mutation untouched; no duplicate parent products; no N+1 introduced; no full-table Java filtering; no query-in-loop; query/count predicate aligned; other search consumers classified; follow-up debts documented for pages that need variant/batch search but are out of Slice B; **Slice B stops after evidence and does not proceed to Slice C** (next slice awaits owner approval per §7).
- **Integration / test plan:**

  **Path A — FE/adapter/runtime bug**

  - Network/manual or automated test proving RevenueReport request URL includes expected `search=RBCT`.
  - Mock/API/manual proof backend response includes RBCT product.
  - UI test/manual proof picker renders RBCT product.
  - Selection proof report request sends `productId`/`productIds`.
  - Error handling proof: backend/API errors are surfaced, not silently converted to empty search results.
  - Debounce/stale proof: older empty response cannot overwrite newer valid response.
  - Report calculation unchanged.

  **Path B — backend search contract bug**

  - Backend integration test: productCode `RBCT` search returns parent product.
  - Backend integration test: variantCode `RBCT` search returns parent product.
  - Backend integration test: variantName search returns parent product.
  - Backend integration test: product name/code existing behavior still works.
  - Backend integration test: multiple matching variants return one parent product.
  - Backend integration test: count query matches unique parent product count.
  - Backend integration test: pagination metadata correct.
  - Backend integration test: `includeInactive`/default active behavior unchanged.
  - Backend integration test: category/`productType` filters preserved if current endpoint supports them.
  - Regression assertion: report/revenue code not modified, or existing report tests still pass if touched by dependency.
  - No promotion, stock, storefront visibility, auth, or transaction-selection semantics changed.

  **Path C — data/filter/session mismatch**

  - Evidence-only report: actual DB RBCT rows or absence; direct API result; active/`includeInactive`/category/`productType` filter state; frontend request URL/backend base URL/session/auth state.
  - No broad code change unless root cause is proven and safe.

- **Regression test plan:** Admin product list loads; RevenueReport product picker works; storefront catalog predicate **unchanged** by Slice B unless shared endpoint change is **explicitly** safe for public (document visibility); product create/edit flows untouched; promotion/transaction paths unchanged.
- **Performance validation plan:** **Query shape** JPQL/SQL outline; **why** EXISTS/subquery avoids duplicate `Product` rows; **why** count query matches data query; **expected SQL count** per request; N+1 risk assessment; query-in-loop risk assessment; full-table-load risk assessment; **index needs:** none for correctness; optional future only if `EXPLAIN` shows production-volume issue **and** owner approves.
- **Manual QA checklist:** Type RBCT in Revenue picker; verify parent appears; capture direct API before/after; scroll pages; verify no duplicates visually vs total count when Path B applies.
- **Rollback plan:** Revert only the commits for the **proven** path (FE adapter vs repository predicate + count query).
- **Stop conditions:**
  - If direct `/api/products?search=RBCT` already returns product but Revenue picker fails, **stop backend work** and fix FE path only.
  - If RBCT data/filter/session mismatch exists, **stop** and report exact evidence.
  - If changing `/api/products` would alter report totals, promotion scope, transaction selection, storefront visibility, auth, or stock mutation, **stop**.
  - If backend query duplicates parent `Product`s or breaks `totalElements`, **stop** and switch to EXISTS/subquery.
  - If DTO/API breaking change is needed, **stop** unless owner approves.
  - If implementation would turn product-level Revenue/Promotion filters into variant-level filters, **stop**.
  - If implementation would make POS/receipt/stock adjustment default to arbitrary variant, **stop**.
  - **Do not proceed to Slice C** without closing Slice B with documented evidence and owner approval for the next slice.
  - **Slice B2** (broader first-N / local-filter removal) is a **separate** approved slice after B; do not fold B2 scope into B’s narrow RBCT/Revenue proof unless owner explicitly collapses them.

---

### Slice B2 — Backend-owned search/filter normalization; remove first-N client-side search debt

#### Why this slice exists

Owner manually verified that **most search fields still preload fixed pages and filter locally**, which **drops data** when matching rows sit outside the first N:

- **AdminTopbar** loads e.g. `/api/products?page=0&size=50` then applies local search; **RBCT not found** when outside window.
- **Admin Products** loads e.g. `/api/products?page=0&size=1000` then local filter.
- **POS** loads e.g. `/api/products?page=0&size=200` then local filter.
- **Promotion picker** loads e.g. `/api/products?page=0&size=200` then local filter.
- **Production recipe / product pickers** load e.g. `/api/products?page=0&size=500` or recipe pages then local filter.
- **Stock adjustments list** loads e.g. `/api/stock-adjustments?page=0&size=500` then local filter.
- **Invoices / pending orders** use large page loads and local filter patterns.

**Wrong pattern:** `GET /api/products?page=0&size=500` then FE filters keyword over loaded rows.

**Correct pattern:** `GET /api/products?search=<q>&page=0&size=20` — **backend filters the full dataset first**, then paginates.

**Same rule for entity list search** (not only products): e.g. `GET /api/invoices?search=<q>&page=0&size=20`, `GET /api/pending-orders?search=<q>&page=0&size=20`, `GET /api/stock-adjustments?search=<q>&page=0&size=20`, and analogous list endpoints — **server filters the full dataset first**, then paginates. Using `size=100` / `size=500` **without** `search=` on the wire and then filtering in the browser is **wrong** when the user expects global search.

#### Mandatory business logic truth (non-regression) — same family as Slice B

Slice B2 **must not** change:

- **Backend is production source of truth** for authoritative lists and search.
- **`ProductVariant` is the transaction unit** for sale/stock/batch flows; **`Product` is the parent/group** for product-scoped features.
- **Search target ≠ selection result:** **selection `productId` does not mean** search may only match product fields — parent screens may **search** product **and** variant fields but must still **select** `productId` / `productIds` where product scope applies.
- Variant transaction screens must **search and select** `variantId` where the business requires it.
- **Batch-sensitive flows** must **search/select `sourceBatchId` in Slice D**, not in B2.
- **Reports** still use **persisted invoice line snapshots** — no recomputing history from live catalog.
- **Promotion PRODUCT scope** remains **product-level**; pickers may find parent via variant match but still persist **productId** for promotion scope.
- **Search changes must not mutate stock** and must **not** alter stock mutation, invoice, payment, or pending-order semantics.
- **Do not weaken** public/storefront **active/sellable** visibility.
- **Do not broaden** auth/role access.

#### Scope

1. **Audit all FE search/filter inputs** that behave as “search” (user expects global match, not only within loaded page).
2. **Classify each** into:
   - **A. PRODUCT_PARENT_SEARCH** — user finds a **parent product**; selection is **`productId`**; search may match variant fields server-side; result is still one product row.
   - **B. VARIANT_SEARCH_REQUIRED** — transaction/picker needs **`variantId`**; must not fake with product-only selection where business requires a variant.
   - **C. BATCH_SEARCH_REQUIRED** — must resolve **`sourceBatchId`** / batch-scoped choice — **out of B2**; **Slice D** (and related batch flows).
   - **D. ENTITY_LIST_SEARCH** — invoices, pending orders, stock adjustments, receipts, customers, suppliers, production recipes list, etc.; **backend `search` (and existing status/date filters)** replaces “load 500 then filter.”
   - **E. STATIC_SMALL_LOOKUP** — only **genuinely small/static** sets may load all: roles, enums, small settings; **categories** only if owner accepts as bounded.
3. **Replace** production search fields that **preload first-N** with **backend-owned** search/filter + pagination **without redesigning UI** (same controls; wire to API).
4. **Do not implement** stock adjustment **batch picker** behavior in B2 beyond classification — mark **Slice D**.
5. **No silent omission:** every screen/component in this slice’s audit list and every **mandatory `caseResult`** in §B2 matrix must appear in the final B2 report with an explicit status (**PASS**, **DEBT**, **STATIC_SMALL_ACCEPTED**, **SKIPPED_WITH_REASON**, **OUT_OF_SCOPE_NON_SEARCH_FIRST_N**, **FAIL**). Cursor/agents **must not** claim **global PASS** if any mandatory case is missing, skipped without `SKIPPED_WITH_REASON`, or falsely marked **PASS** while the UI still filters locally after a first-N load.

#### Audit list (must inspect)

Every row: note **classification (A–E or extended labels below)**, **current API + page size**, **local filter?**, **intended selection id**, and the **mandatory `caseResult` id** (see matrix).

**Baseline screens (already in B2 scope)**

- [`AdminTopbar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminTopbar.tsx) → `admin_topbar_search_backend`
- **Admin Products** list page → `admin_products_search_backend`
- [`POS.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/POS.tsx) — product grid/search → `pos_search_classified_no_semantic_regression`; **customer picker** → `pos_customer_picker_search_classified` (separate case; do not conflate)
- Promotion: **product pickers** — `MultiPicker`, `ProductPicker`, `ProductQuantityList`, related promotion forms → `promotion_product_picker_backend_product_scope`
- [`ProductionRecipeFormPage.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProductionRecipeFormPage.tsx) — output → `production_recipe_output_search_backend`; components → `production_recipe_component_search_backend`
- **Combos** (e.g. `/admin/combos`) → `combo_component_search_backend`
- [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx) — line item variant search → `goods_receipt_create_variant_search_backend`; **supplier picker** → `goods_receipt_supplier_picker_search_classified`
- [`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx) → **`revenue_report_picker_backend_regression`** (Slice B baseline: debounced backend `search`; **`FAIL`** if regression to first-N local filter)
- [`ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx) → `profit_report_picker_backend`
- **Storefront** [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx) / [`publicCatalog.ts`](nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts) → `storefront_search_backend_or_slice_e_debt`
- [`ProductDetail.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/ProductDetail.tsx) — related products / first-N catalog dependency → `storefront_product_detail_related_products_classified`
- [`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx) — variant selector → `stock_adjustment_create_variant_search_classified` (**batch** → Slice D only)
- **Stock adjustments** list page → `stock_adjustments_list_search_backend`
- [`InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx) → `inventory_report_search_classified`
- **Goods receipts** list + create (list search if present)
- **Invoices** list → `invoices_list_search_backend`
- **Pending orders** list → `pending_orders_list_search_backend`
- **Customers** list → `customers_list_search_backend`
- **Suppliers** list → `suppliers_list_search_backend`
- **Production recipes** list → `production_recipes_list_search_backend`
- [`AdminSidebar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminSidebar.tsx) — pending-order badge / `pageSize: 500` load → `admin_sidebar_pending_order_badge_classified`
- **Any** additional search/filter surfaced by mandatory grep (below) → new row in audit table + new or mapped `caseResult`; **missing row = FAIL**

**Source-audit additions (explicit; no silent omission)**

1. **UsersManagement** — [`UsersManagement.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UsersManagement.tsx). **Current behavior:** `DataTableToolbar` search over users; `adminUsers.list()` → `/api/admin/users?page=0&size=100`; **local** filter by username/fullName. **Classification:** `ENTITY_LIST_SEARCH` / `ADMIN_USER_LIST`. **Slice overlap:** likely **Slice C** (roles/users). **B2:** classify + automate `users_management_search_classified`; either backend `search` + pagination or **DEBT** with `followUpSlice: "Slice C"` — **never omit**.
2. **Categories** — [`Categories.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Categories.tsx). **Current:** `DataTableToolbar` search over loaded categories. **Classification:** `STATIC_SMALL_LOOKUP` unless owner demands server category search. **B2:** `categories_search_static_small_classified` → **STATIC_SMALL_ACCEPTED** (with reason) or **DEBT** if not genuinely bounded — **never omit**.
3. **Vouchers** — [`Vouchers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Vouchers.tsx). **Current:** debounced backend `fetchAdminVoucherPage({ search, status, page, size, sort })`. **Classification:** `ENTITY_LIST_SEARCH`. **B2:** `vouchers_list_search_backend` — **expected PASS / control** proving backend-owned search already exists.
4. **UnmatchedPayments** — [`UnmatchedPayments.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx). **Current:** main list `paymentEvents.listUnmatchedPaymentEventsPage({ search, page, pageSize })`; link dialog `pendingOrders.list({ query, pageSize: 20 })`. **Classification:** `ENTITY_LIST_SEARCH` / `PAYMENT_EVENT_SEARCH` + `PENDING_ORDER_LOOKUP`. **B2:** `unmatched_payments_search_backend` and `unmatched_payment_link_dialog_pending_order_search_backend`.
5. **GhnQuoteLogs** — [`GhnQuoteLogs.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GhnQuoteLogs.tsx). **Current:** search input filters **loaded rows locally**. **Classification:** `OPS_LOG_SEARCH` / `ENTITY_LIST_SEARCH`. **B2:** `ghn_quote_logs_search_classified` — **DEBT** if backend `search` missing.
6. **POS customer picker** — same [`POS.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/POS.tsx). **Current:** `SearchableCombobox` filters `customers` from `adminCustomers.list()` **locally**. **Classification:** `CUSTOMER_LOOKUP` / `ENTITY_LOOKUP`. **B2:** `pos_customer_picker_search_classified` — separate from product grid.
7. **GoodsReceiptCreate supplier picker** — same [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx). **Current:** supplier `SearchableCombobox` filters loaded options **locally**. **Classification:** `SUPPLIER_LOOKUP`. **B2:** `goods_receipt_supplier_picker_search_classified`.
8. **Storefront ProductDetail related products** — [`ProductDetail.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/ProductDetail.tsx). **Current:** `listPublicProducts()` for related products; **not** a search field but **first-N catalog** dependency. **Classification:** `OUT_OF_SCOPE_NON_SEARCH_FIRST_N` or Slice E debt. **B2:** `storefront_product_detail_related_products_classified` — do **not** claim B2 fixed unless implementation changes it.
9. **AdminSidebar pending-order badge/load** — [`AdminSidebar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminSidebar.tsx). **Current:** `pendingOrders.list({ page: 1, pageSize: 500 })` for badge/count. **Classification:** `OUT_OF_SCOPE_NON_SEARCH_FIRST_N` / `BADGE_COUNT_PERF_DEBT`. **B2:** `admin_sidebar_pending_order_badge_classified` — document; optional counts API follow-up; **not** a search input.

**Mandatory source-code audit (grep); final B2 report must list every hit**

- `DataTableToolbar`
- `placeholder="Tìm` (and other search placeholders as discovered)
- `SearchableCombobox`
- `CommandInput`
- `.filter(` paired with search/query state (manual review required)
- `productService.list({ ... pageSize: 50/100/200/500/1000 })` (and equivalent API clients)
- Entity list calls with `size=100` / `size=500` / `pageSize: 100` / `pageSize: 500`

**Final B2 report gate:** must include **all** baseline screens, **all** source-audit additions above, **all** grep-discovered search/filter consumers, and **every** mandatory `caseResult` below. **Missing any explicit screen or mandatory `caseResult` = FAIL** for slice acceptance.

#### Required API contract decisions

**A. Product parent search**

- Use **existing** (extend only if already planned in Slice B Path B):  
  `GET /api/products?search=<q>&page=0&size=20&sort=name,asc`  
  (page sizes **8 / 20 / 50** per UI; **never** rely on `size=1000` as fake full catalog for search.)

**B. Variant search**

- When a **transaction picker** must return **`variantId`**, add a **paginated** backend endpoint if none exists, e.g.:  
  `GET /api/products/variants/search?search=<q>&page=0&size=20&activeOnly=true&forSaleOnly=false`  
- **Response fields (minimum):** `variantId`, `variantCode`, `variantName`, `productId`, `productCode`, `productName`, `active`, `isSellable`, `sellUnit`, `importUnit`.  
- **FE:** debounce **250ms**, **abort** stale requests; **no** load-500-then-filter.

**C. Entity list search**

- Each list API should expose **`search=`** (and keep **existing** filters: status, date range, pagination, sort): add params **only where missing**, backward-compatible:
  - `/api/invoices?search=...`
  - `/api/pending-orders?search=...`
  - `/api/stock-adjustments?search=...`
  - `/api/production-recipes?search=...`
  - `/api/receipts?search=...` (or project’s actual receipts path)
  - `/api/customers?search=...`
  - `/api/suppliers?search=...`
- **Backend:** filter **before** pagination; **count** query aligned with data query.

**D. Static small lookup**

- **Only** roles, enums, tiny settings, **maybe** categories (if bounded) — **full load** acceptable; **not** products, variants, invoices, etc.

#### Performance guardlist (B2-specific emphasis)

- **No** full-table Java filtering for production search/list.
- **No** FE local filtering after first-N load **for user-facing “search”** fields.
- **No** unbounded `findAll` / `size=MAX` for search/list APIs.
- **No** query-in-loop; **no** per-row FE API calls for standard lists.
- **Backend filters before pagination**; **data** and **count** predicates aligned.
- **FE:** debounce **250ms**; **AbortController** or equivalent for stale responses.
- **Small page sizes:** **8 / 20 / 50** depending on UI density.

#### Acceptance criteria

- **Mandatory `caseResult` completeness:** Every **`caseResult`** listed under **“B2 Selenium / API Acceptance Matrix — Mandatory”** exists in [`automation-summary.json`](nha-dan-pos-c091ee5b/automation-output/automation-summary.json) (or project-agreed automation output path) with a valid **`status`**. **Missing any mandatory `caseResult` = FAIL.** No silent omissions; **API debt does not excuse missing automation** — it forces **`DEBT`** (or **`SKIPPED_WITH_REASON`**) with network/classification evidence, not omission.
- **`PASS` only when proven:** A screen may be **`PASS`** only if **backend-owned** `search=` / equivalent server-side filter is **observed** (network evidence) or the case is **genuinely** **`STATIC_SMALL_ACCEPTED`** / **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`** per rules below. **Claiming `PASS` while the UI only filters locally over first-N loaded rows = FAIL** (false PASS).
- **`DEBT` is allowed** only when explicitly out of B2 sub-scope or blocked on backend, with **`reason`** + **`followUpSlice`** (or follow-up plan) documented — not as a substitute for missing `caseResult` rows.
- **`STATIC_SMALL_ACCEPTED`** only for **genuinely bounded/static** data with owner-accepted reason (e.g. categories if accepted).
- **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`** only when **no search field** exists but a first-N preload smell exists; **follow-up** documented (e.g. badge count, related products).
- **`SKIPPED_WITH_REASON`** requires **route**, **file/component**, and **reason** (e.g. unstable upload fixture for import review).
- **Product/report/promotion semantics:** AdminTopbar **RBCT** / fixture token hits backend `search=` + small page; Admin Products **no** `size=1000` fake full-catalog search; recipe/promotion/pickers per matrix; **no** variant-level promotion; report filters remain **productId/productIds** where required; **no** report total / snapshot semantics change.
- **POS:** product search per matrix (`DEBT` allowed with reason); **customer picker** separate case — no conflation.
- **Entity lists:** per-matrix; backend `search=` or documented **`DEBT`** with evidence — not silent PASS on local-only filter.
- **No** stock mutation, invoice, payment, pending-order semantics change; **no** public active/sellable weakening; **no** auth broadening.
- **FE build** passes (`npm run build` / project equivalent).
- **Backend tests** for any **new** endpoint or **`search` param** added during B2 implementation.

#### Test plan

1. **Static grep / audit (mandatory artifact)**
   - All `productService.list` / `/api/products` call sites with `pageSize` **50 / 100 / 200 / 500 / 1000**.
   - Entity list fetches with **size=100 / 500** / `pageSize: 100` / `pageSize: 500` + local string filter.
   - **Plus** the mandatory grep patterns in **Audit list** (`DataTableToolbar`, `SearchableCombobox`, `CommandInput`, `placeholder="Tìm`, `.filter(` + query state, etc.).
   - Output: **source-code audit table** mapping each hit → screen → classification → `caseResult` id.
2. **Unit / component tests** where the repo already has patterns (supplementary only; **does not replace** matrix).
3. **Selenium / API:** **full mandatory matrix** below — **not** a “representative” subset. Every impacted consumer must have a row; statuses **`PASS` | `DEBT` | `STATIC_SMALL_ACCEPTED` | `SKIPPED_WITH_REASON` | `OUT_OF_SCOPE_NON_SEARCH_FIRST_N` | `FAIL`** only.
4. **Backend tests**
   - New **variant search** endpoint (if added): pagination, predicates, visibility flags, **no** N+1.
   - New **`search` params** on entity controllers: match behavior, count alignment, auth unchanged.

### B2 Selenium / API Acceptance Matrix — Mandatory

B2 implementation must **create or update** Selenium/API automation so **every** impacted search/filter consumer has an explicit named **`caseResult`**. **Representative / sample-only coverage is insufficient** for owner acceptance.

**Execution environment**

- Tests run against **local full stack**: backend **local** profile (e.g. `application-local`) + Vite frontend.
- **Real browser** interactions where UI exists.
- **Capture network requests** where possible; assert backend `search=` vs local-only filter after first-N load.
- **Do not** silently skip any impacted screen; use **`SKIPPED_WITH_REASON`** with full metadata if unsafe or unavailable.
- **Do not** submit stock mutations or irreversible business events in search-only tests.

**Status vocabulary (required)**

- **`PASS`:** Tested; meets B2 backend-owned search/filter rule **or** approved bounded static rule; **network evidence** recorded for backend-driven cases.
- **`DEBT`:** Tested/classified; still first-N + local filter or missing backend `search`; explicitly deferred with **`reason`** and **`followUpSlice`** when applicable.
- **`STATIC_SMALL_ACCEPTED`:** Genuinely bounded/static dataset; local load accepted; **`reason`** required.
- **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`:** **No** search input; first-N preload smell; **follow-up** documented (e.g. counts API, Slice E).
- **`SKIPPED_WITH_REASON`:** Route/component unavailable or no safe fixture; **`reason`** + path required.
- **`FAIL`:** Hard assertion failed; mandatory case **omitted**; **false PASS** (local filter claimed as PASS); business truth regression; severe console errors on route (per hard fail list).

**Global PASS rule:** Final automation report **must not** claim **global PASS** unless **every** mandatory `caseResult` has one of the non-`FAIL` statuses above **and** all **hard blockers** pass. **`FAIL` on any mandatory row fails the slice.**

**Mandatory API/fixture setup**

- Isolated test data prefix: **`SLICEB2_<timestamp>`**.
- Product/variant fixtures **missed by naive first-N** loading (e.g. sort late in alphabet: `ZZZ_SLICEB2_RBCT_<timestamp>`).
- Where UI uses `size=50`, ensure fixture is **outside first 50** (or document impossibility + rely on **direct API + classification** without claiming **`PASS`** for that screen unless backend `search` network is observed).
- Where mass creation for `size=200/500` is heavy, document why; use **network evidence + route classification** — **do not** mark **`PASS`** unless backend-search network is observed.
- **Product-parent** screens: fixture supports **productCode** and **variantCode** search.
- **Variant** screens: **variantCode ≠ productCode** where needed to prove variant-aware behavior.
- **Public/storefront:** include active/sellable vs inactive/non-sellable fixtures **if** public-facing; **leak = FAIL**.

**Mandatory `caseResult` rows (each must appear in `automation-summary.json`)**

1. **`admin_topbar_search_backend`** — Route: `/admin` (layout with [`AdminTopbar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminTopbar.tsx)). Action: type RBCT/fixture token. **`PASS`:** `GET /api/products?search=<q>` (or equivalent) with small page; result appears; **not** only initial `page=0&size=50` preload + local filter. Else **`DEBT`** / **`FAIL`** per implementation target.
2. **`admin_products_search_backend`** — `/admin/products`. Fixture token. **`PASS`:** `/api/products?search=<q>&page=0&size=...`; row outside naive first page findable; **no** `size=1000` as fake full catalog for search. Local-only filter → **`DEBT`** or **`FAIL`** if B2 claims fix.
3. **`profit_report_picker_backend`** — `/admin/profit`. Product filter; search fixture. **`PASS`:** backend product search; selection **`productId`/`productIds` only**; profit semantics unchanged. Local-only picker → **`DEBT`**.
4. **`promotion_product_picker_backend_product_scope`** — `/admin/promotions` create/edit. **`PASS`:** backend product search (or owner-approved async search); selection **`productId`/`productIds`**; **no** variant-level promotion. First-200 local → **`DEBT`**.
5. **`production_recipe_output_search_backend`** — Recipe create/edit. **`PASS`:** no first-500 local discovery; backend product/variant search; output stores **productId + variantId** per existing semantics. Missing variant endpoint → **`DEBT`** unless implemented.
6. **`production_recipe_component_search_backend`** — Same. Component token. **`PASS`:** backend product/variant search; **`variantId`** where required. First-500 local → **`DEBT`**.
7. **`combo_component_search_backend`** — `/admin/combos`. **`PASS`:** backend product/variant search; **productId + variantId** preserved. First-100 local → **`DEBT`**.
8. **`goods_receipt_create_variant_search_backend`** — Goods receipt create. **`PASS`:** backend search; line **`variantId`**; **no** receipt submit/stock mutation in test. First-500 local → **`DEBT`**.
9. **`pos_search_classified_no_semantic_regression`** — `/admin/pos`. Product search. If B2 fixes: backend search + **no** arbitrary default variant regression. If not in B2: **`DEBT`** with reason. Wrong default variant → **`FAIL`**.
10. **`pos_customer_picker_search_classified`** — `/admin/pos`. Customer picker. Fixed → backend customer search. Still local over `adminCustomers.list()` → **`DEBT`** with reason. **Distinct** from product search.
11. **`storefront_search_backend_or_slice_e_debt`** — `/products?q=<token>`. B2 touches storefront → backend search + visibility preserved. Left to Slice E → **`DEBT`** with reason. Inactive/non-sellable leaked → **`FAIL`**.
12. **`storefront_product_detail_related_products_classified`** — Storefront product detail. Classify `listPublicProducts` / first-N related block. Not a search field → **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`** or Slice E **`DEBT`**. Do not claim B2 fix unless changed.
13. **`stock_adjustments_list_search_backend`** — Stock adjustments list. **`PASS`:** `/api/stock-adjustments?search=<q>` + pagination; **no** `size=500` local-only search. API missing → **`DEBT`** + network proof of current behavior.
14. **`stock_adjustment_create_variant_search_classified`** — Stock adjustment create. Classify variant selector; **batch/`sourceBatchId` → Slice D**; **no** stock POST in test. Batch **`DEBT`** for D, not **`FAIL`** for B2 unless B2 falsely claims batch fix.
15. **`invoices_list_search_backend`** — Invoices. **`PASS`:** `/api/invoices?search=<q>` or equivalent. First-100 local-only → **`DEBT`** + evidence.
16. **`pending_orders_list_search_backend`** — Pending orders. **`PASS`:** `/api/pending-orders?search=<q>` or equivalent. Else **`DEBT`**.
17. **`production_recipes_list_search_backend`** — Production recipes list. **`PASS`:** `/api/production-recipes?search=<q>`. Else **`DEBT`**.
18. **`customers_list_search_backend`** — Customers. **`PASS`:** `/api/customers?search=<q>`. Else **`DEBT`**.
19. **`suppliers_list_search_backend`** — Suppliers. **`PASS`:** `/api/suppliers?search=<q>`. Else **`DEBT`**.
20. **`goods_receipt_supplier_picker_search_classified`** — Goods receipt create; supplier combobox. Backend supplier search vs local → **`PASS`** / **`DEBT`**. Separate from variant line search.
21. **`inventory_report_search_classified`** — Inventory report. Backend search if exists; else local row filter → **`DEBT`** if B2 owns. **No** stock/report semantic change.
22. **`users_management_search_classified`** — [`UsersManagement.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UsersManagement.tsx). **`PASS`:** `/api/admin/users?search=<q>` or equivalent. Still `size=100` + local → **`DEBT`**; may set **`followUpSlice: "Slice C"`**. Auth unchanged.
23. **`categories_search_static_small_classified`** — [`Categories.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Categories.tsx). **`STATIC_SMALL_ACCEPTED`** with reason **or** **`DEBT`** if not bounded.
24. **`vouchers_list_search_backend`** — [`Vouchers.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Vouchers.tsx). **`PASS`:** `fetchAdminVoucherPage({ search, ... })` observed; filters preserved.
25. **`unmatched_payments_search_backend`** — [`UnmatchedPayments.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx). **`PASS`:** backend unmatched payment event search.
26. **`unmatched_payment_link_dialog_pending_order_search_backend`** — Same page; link dialog. **`PASS`:** `pendingOrders.list` with query + small page from backend; **no** payment/pending semantic change.
27. **`ghn_quote_logs_search_classified`** — [`GhnQuoteLogs.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GhnQuoteLogs.tsx). Backend search vs local → **`PASS`** / **`DEBT`**.
28. **`product_import_review_search_classified`** — [`ProductImportReview.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ProductImportReview.tsx) (or actual import-review entry). No stable upload fixture → **`SKIPPED_WITH_REASON`** with path + reason.
29. **`admin_sidebar_pending_order_badge_classified`** — [`AdminSidebar.tsx`](nha-dan-pos-c091ee5b/src/components/layout/AdminSidebar.tsx). Classify `pendingOrders.list({ page: 1, pageSize: 500 })`. **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`** + counts-API follow-up unless changed.
30. **`revenue_report_picker_backend_regression`** — [`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx) (“Lọc theo sản phẩm”). **`PASS`:** debounced backend product list with **`search=`** on the wire (Slice B contract); selection remains **`productId`/`productIds`**; report snapshot semantics unchanged. **`FAIL`** if picker reverts to first-N local-only filter or RBCT/fixture invisible when API returns it. **`DEBT`** only with explicit owner note tying remainder to **Slice B** closure (must not leave row blank).

**Hard fail conditions (`FAIL` / slice rejection)**

- Public page exposes **inactive/non-sellable** product or variant against policy.
- Report request sends **`variantId`** where **`productId`/`productIds`** is required for product-scoped report filter.
- Promotion **PRODUCT** scope becomes **variant-level** selection.
- **Stock mutation** during a search-only test.
- Any search field **`PASS`** but only local filter over first-N load (**false PASS**).
- Any **mandatory `caseResult` omitted** from automation summary.
- Any **explicit audit screen** missing from final report.
- **Severe** browser console errors on tested route (per project threshold — document in run).
- **Auth/role access broadened**.
- Invoice/report/payment/pending **semantics** altered.

**Required automation output shape**

- [`automation-summary.json`](nha-dan-pos-c091ee5b/automation-output/automation-summary.json) (or agreed path) includes **every** mandatory `caseResult`.
- Each entry includes at minimum: **`case`**, **`status`**, **`route`**, **`file`** or **`component`**, **`searchToken`** (if applicable), **`networkEvidence`** or **`reason`**, **`selectionSemantic`**, **`currentBehavior`**, **`changedByB2`** (boolean), **`followUpSlice`** when **`DEBT`** or **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`**.
- Final human-readable report sections: **hard `PASS`**, **`DEBT`**, **`STATIC_SMALL_ACCEPTED`**, **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`**, **`SKIPPED_WITH_REASON`**, **`FAIL`**.

**Required commands (future B2 implementation; not run during plan edit)**

- Start backend: local profile / `application-local` (project-equivalent).
- Start or reuse Vite frontend.
- Run **B2-tagged** Selenium spec / npm script (define in implementation PR).
- `npm run build` (FE).
- Backend `./gradlew test` / `integrationTest` for new endpoints/params.
- **Do not** proceed to Slice **C / D / E** inside B2 closure until B2 matrix + report are accepted.

#### Stop conditions

- If a change would **alter** report totals, promotion **PRODUCT** scope, stock mutation, **POS selection semantics**, receipt semantics, invoice semantics, or **public** visibility → **stop**.
- If **audit surface** exceeds one safe implementation pass → **stop** and **split** B2 into **B2.1 / B2.2 / B2.3** with separate matrix ownership (each split still must not omit `caseResult` rows for its scope).
- If backend entity API **lacks** `search` → **classify** and plan backend work; **do not** fake global search with larger `size` only.
- If a screen requires **batch/`sourceBatchId`** selection fix → **stop**; **Slice D**.
- If **variant search** endpoint required → add **endpoint + tests only**; **no** business semantic change beyond search loading.
- If **any** automation `caseResult` is **omitted** or **false PASS** is detected → **B2 acceptance fails**; do not close the slice.
- If a **variant picker** requires a new endpoint → implement **endpoint + tests only**; **no** UI semantic change beyond **how search results are loaded**.
- **Do not** proceed into **Slice C**, **D**, or **E** **inside** B2 — **close B2** with audit table + full matrix + owner approval first.

#### Future B2 implementation output requirements (report artifact)

The B2 closure report **must** include:

- **Source-code audit table** (every grep hit + classification + `caseResult`).
- **Every grep finding** listed or explicitly cross-referenced (no orphan hits).
- **Every mandatory `caseResult`** with final status.
- **Per-screen** summary: **`PASS` / `DEBT` / `STATIC_SMALL_ACCEPTED` / `OUT_OF_SCOPE_NON_SEARCH_FIRST_N` / `SKIPPED_WITH_REASON` / `FAIL`**.
- **`networkEvidence`** for **every `PASS`** (backend search observed).
- **`followUpSlice`** (or plan) for **every `DEBT`** and applicable **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`**.
- **Confirmation** that **no business truth** from §Mandatory business logic was violated.

#### Explicit out of scope

- **UI redesign** (layout/theme/component structure).
- **Stock adjustment `sourceBatchId` picker** implementation — **Slice D**.
- **Storefront** full pagination product list UX — **Slice E** owns primary UX; B2 matrix may still **`DEBT`** or classify related-product **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`**.
- Changing **invoice snapshot** reporting math, **payment** flows, or **promotion evaluation** logic.
- **Claiming** B2 “fixed” badge-count or related-products **`OUT_OF_SCOPE`** rows without code changes — those rows require honest **`OUT_OF_SCOPE_NON_SEARCH_FIRST_N`** / **`DEBT`**, not **`PASS`**.

---

### Slice C — Roles endpoint + real UserFormDrawer roles

- **Scope:** Add **`GET /api/admin/roles`** from `roles` table; **ADMIN-only**. Verify **`ROLE_STAFF`** exists in DB; [`V36__role_staff_customer_compat.sql`](NhaDanShop/src/main/resources/db/migration/V36__role_staff_customer_compat.sql) seeds — if production DB lacks row, plan operational migration/seed (no new migration file in this plan edit). **FE:** `UserFormDrawer` loads options from endpoint; save sends **actual role code** (`ROLE_STAFF`, `ROLE_ADMIN`, …). **Fix** `staff` → `ROLE_USER` mapping in [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts); fix `mapUser` conflation of `ROLE_STAFF` vs `ROLE_USER`. **Do not** expose CUSTOMER / `ROLE_USER` in assignable list unless **owner decides** (§6).
- **Explicit Out of Scope:** Customer self-signup role changes; broad security config rewrites without approval.
- **Business Logic Truth Guardlist:** JWT authorities match DB; staff ≠ customer; admin routes unchanged except **intended** role endpoint; **no** fake success on 403/401.
- **Performance / Query Guardlist:** One **small** query for all roles; **FE must not** fetch roles per user row — cache in drawer/session module; no N+1.
- **Files likely changed:** BE: new controller method or `UserController` extension, [`RoleRepository`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/RoleRepository.java), DTO; FE: [`UserFormDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx), [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts), [`UsersManagement.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UsersManagement.tsx), types/tests.
- **API/DTO changes:** New **read-only** list e.g. `{ id, name, label }` where `label` from `description` or controlled map (no dedicated label column today).
- **DB migration/index changes:** **None** if `ROLE_STAFF` present; otherwise operational migration verification only.
- **Implementation approach:** `findAll` or filtered “assignable” query; Spring Security **ADMIN** only; FE Select bound to authority strings from API; remove hardcoded two-option model.
- **Acceptance Criteria:**
  - `GET /api/admin/roles` as **ADMIN** → 200 with at least **`ROLE_ADMIN`** and **`ROLE_STAFF`** + labels.
  - Same as **STAFF** / **CUSTOMER** / anonymous → **401/403**; **no** role enumeration leak.
  - `UserFormDrawer` options from backend.
  - Creating staff sends **`ROLE_STAFF`**; creating admin sends **`ROLE_ADMIN`**.
  - Staff user **does not** become **`ROLE_USER`**.
  - Customer **cannot** access admin.
  - Existing admin user list still loads.
- **Integration Test Plan:**
  1. **Setup:** Authenticated ADMIN. **Action:** GET roles. **Expected:** 200, roles from table. **Invariant:** codes match DB seeds.
  2. **Setup:** STAFF / CUSTOMER / anonymous. **Action:** GET roles. **Expected:** 401/403. **Invariant:** empty or error body — **no** sensitive role list.
  3. **Setup:** Create user payload `ROLE_STAFF`. **Action:** save. **Expected:** persisted `ROLE_STAFF`. **Invariant:** **not** `ROLE_USER`.
  4. **Setup:** Staff session/JWT. **Action:** decode authorities. **Expected:** staff authority. **Invariant:** admin/customer scopes not wrongly broadened.
  5. **Setup:** Customer account. **Action:** call admin API / hit admin route. **Expected:** blocked. **Invariant:** no data leak.
- **Regression Test Plan:** Admin create/edit user; admin login; staff POS access; customer storefront account; **no** accidental route guard broadening.
- **Performance Validation Plan:** Single query; FE cached roles; grep confirms **no** per-row roles fetch in user table.
- **Manual QA Checklist:** Create staff, log in as staff, verify POS/admin boundaries per product policy.
- **Rollback Plan:** Revert endpoint + FE to prior mapping (temporary — **role bug returns**; avoid leaving production in half state).
- **Stop Conditions:**
  - If owner has **not** decided whether admin may create **CUSTOMER** users, **restrict** to ADMIN/STAFF only and **document** until decided.
  - If **`ROLE_STAFF` missing** in DB and migration path unclear, **stop** before coding migration.

---

### Slice D — Stock adjustment `sourceBatchId` FE + BE validation

- **Scope:** **FE** shows **real batches** for selected variant (from [`getInventoryProjection(variantId)`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendInventoryAdapter.ts) or equivalent — **one call per variant**, not per batch row); admin selects **`sourceBatchId`**; POST includes it. **BE** validates `sourceBatchId` **belongs to variant**, validates **remainingQty** for **negative** adjustment, deducts **exact** batch; preserves **unsourced** allocation behavior where allowed; **reversal** restores exact allocation per service. **No** direct FE stock writes.
- **Explicit Out of Scope:** Redesigning all of `listInventoryProjections` full-catalog load (noted **perf debt** — separate bounded-search story); changing receipt void semantics.
- **Business Logic Truth Guardlist:** All bullets in §2.1 for batch truth, FEFO vs explicit batch, reversal trace; **no** `stockQty`/`remainingQty` FE writes.
- **Performance / Query Guardlist:** **One** projection request per **selected** variant line; **no** API per batch row; validation uses **PK + variant relation**; **no** full inventory scan; **no** repository call inside per-line loop beyond batched IDs; SQL log / stats for confirm endpoint bounded.
- **Files likely changed:** FE: [`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx), adapter/normalize; BE: only if validation gap found in [`StockAdjustmentService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) or DTO ([`InventoryProjectionBatchResponse`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionBatchResponse.java) optional fields).
- **API/DTO changes:** **Uses existing** `sourceBatchId` on request items; optional **additive** batch display fields (status, receipt ref) if required for UX — owner approval.
- **DB migration/index changes:** None expected.
- **Implementation approach:** Line state `sourceBatchId`; batch dropdown from projection `byBatch`; warning copy when multi-batch and unset (owner wording); BE re-verify negative path locks and `assertReasonAllowsDiff` compatibility.
- **Acceptance Criteria:**
  - Selecting variant shows **real** remaining batches with **id/code**, **remainingQty**, **expiry/HSD** if present.
  - Admin selects **one** source batch; payload includes `sourceBatchId`.
  - **Negative** adjustment reduces **selected batch only**; other batches unchanged.
  - **Insufficient** selected batch qty → clean **400/409**; **wrong variant** batch → **400/409**; **no** mutation.
  - **Reversal** restores **exact** batch allocation; **`ProductVariant.stockQty == SUM(batch.remainingQty)`** after confirm/reverse for affected variant.
  - **No** FE direct `stockQty`/`remainingQty` writes.
- **Integration Test Plan:**
  1. **Setup:** Variant V, Batch A=10, Batch B=20. **Action:** adjustment **-3** with `sourceBatchId=A`. **Expected:** A=7, B=20. **Invariant:** variant projection = **27**.
  2. **Setup:** `sourceBatchId` for **different** variant. **Action:** submit. **Expected:** **400/409**. **Invariant:** **no** stock change.
  3. **Setup:** Selected batch **qty 1**, adjustment **-5**. **Action:** submit. **Expected:** **400/409**. **Invariant:** **no** stock change.
  4. **Setup:** Confirmed sourced negative adjustment. **Action:** reverse. **Expected:** batch quantities restored per trace. **Invariant:** sum invariant holds.
  5. **Setup:** Unsourced adjustment allowed today. **Action:** submit **without** `sourceBatchId`. **Expected:** **current** behavior. **Invariant:** no regression.
  6. **Setup:** **Positive** adjustment with `sourceBatchId`. **Action:** submit. **Expected:** **Rejected or ignored** per **explicit** rule documented in PR (owner decision). **Invariant:** documented safe semantics.
- **Regression Test Plan:** Unsourced adjustments (if allowed); reason enums **Hàng hỏng / Sai phiếu nhập / Mất hàng / Hết hạn** rules unchanged except new source-batch enforcement; receipt void; sales FEFO; inventory projection = batch sum.
- **Performance Validation Plan:** Network: **one** projection GET per variant selection; SQL: confirm path uses row locks as today — **no** query-in-loop.
- **Manual QA Checklist:** Multi-batch variant; single-batch variant; reversal flow; error toasts readable.
- **Rollback Plan:** FE stops sending `sourceBatchId` (server treats null as today); revert BE validation changes if any.
- **Stop Conditions:**
  - If **FE cannot** determine eligible batches from projection DTO, **stop** and plan **DTO extension** before guessing.
  - If validation would **change core stock mutation semantics**, **stop** for owner approval.

---

### Slice E — Storefront paginated search / remove first-200 client filtering

- **Scope:** Replace [`publicCatalog.ts`](nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts) **`size=200`** single fetch + [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx) client filter with **backend-paginated** `GET /api/products` using **`search`**, **`page`**, **`size`**, and **`categoryId`** as supported by [`ProductController.list`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductController.java). Preserve **active + sellable** storefront predicate as today (FE and/or BE per current contract); **no mock fallback**; **no** full catalog client load.
- **Explicit Out of Scope:** Cart/checkout redesign; changing Slice B admin search if public uses different service method — **align predicates** explicitly in implementation PR.
- **Business Logic Truth Guardlist:** Storefront remains **non-admin**; **no** mock SoT; sellable/active rules **not** weakened.
- **Performance / Query Guardlist:** **Bounded** page requests; **no** `size=200` as fake full load; **no** per-row API; debounce + **stale-response guard** (`AbortController` or request id); backend **paginated** SQL.
- **Files likely changed:** FE: [`publicCatalog.ts`](nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts), [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx), maybe adapter; BE: only if predicate must move server-side (owner decision §6).
- **API/DTO changes:** Use **existing** query params; no breaking change expected.
- **DB migration/index changes:** None; optional shared index with Slice B.
- **Implementation approach:** Drive `q` from URL; debounced fetch; category + search combination per controller contract; if Slice B **Path B** makes `/api/products` variant-aware, storefront search may benefit — **still** must preserve public active/sellable predicates (Slice B guards; Slice E owns pagination UX).
- **Acceptance Criteria:**
  - Storefront uses backend query with **search/page/size** (and category if applicable).
  - **`q` in URL** drives backend search.
  - Products **beyond first 200** are findable.
  - **Category + search** combine per **documented** contract in PR.
  - **Empty** query loads **paginated** catalog.
  - **No** per-row API calls; **no** frontend full-table filtering of paged data.
- **Integration / FE Tests:**
  1. **Setup:** `?q=foo` in URL. **Action:** open Products. **Expected:** request includes search param. **Invariant:** UI state matches `q`.
  2. **Setup:** Fast typing. **Action:** type query quickly. **Expected:** stale responses ignored. **Invariant:** final UI = latest `q`.
  3. **Setup:** Product past first 200 with variant code (if `/api/products` variant-aware after Slice B Path B). **Action:** search variant code. **Expected:** found via backend. **Invariant:** not limited to first page client filter.
  4. **Setup:** Category + `q`. **Action:** apply both. **Expected:** matches planned contract. **Invariant:** no hidden client-only rows.
- **Regression Test Plan:** Home/catalog loads; product detail navigation; active/sellable filter; cart/checkout unaffected.
- **Performance Validation Plan:** Network tab: **no** giant single fetch; **no** unbounded client cache of entire catalog.
- **Manual QA Checklist:** Large fixture DB; search rare term; combine category chip + search.
- **Rollback Plan:** Revert FE catalog fetch to prior pattern (technical debt returns — avoid except emergency).
- **Stop Conditions:** If **public endpoint lacks sellable predicate** and owner mandates **backend-only** sellable filtering, **stop** and plan **explicit** backend predicate before FE-only assumptions.

---

### Slice F — Date UTC drift cleanup follow-up

- **Scope:** Replace remaining **`toISOString().slice(0,10)`** defaults in admin pages with [`localDate.ts`](nha-dan-pos-c091ee5b/src/lib/localDate.ts) helpers for **UI** date defaults only. **Do not** change backend **Instant** serialization or promotion deadline semantics.
- **Explicit Out of Scope:** Changing server timezone config; altering DB stored timestamps.
- **Business Logic Truth Guardlist:** Report boundaries and promotion validity **unchanged** in meaning; only **client default display** alignment.
- **Performance / Query Guardlist:** N/A.
- **Files likely changed:** [`ProfitReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/ProfitReport.tsx), [`InventoryReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/InventoryReport.tsx), [`GoodsReceiptCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceiptCreate.tsx), [`Invoices.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/Invoices.tsx), [`ReceiptImportPreviewDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptImportPreviewDialog.tsx), promotion UI under [`lib/promotions.ts`](nha-dan-pos-c091ee5b/src/lib/promotions.ts) / related pages — **audit each** usage.
- **API/DTO changes:** None.
- **DB migration/index changes:** None.
- **Implementation approach:** Central imports from `localDate`; **per-field** review: if string is **API payload instant**, do not swap helper blindly.
- **Acceptance Criteria:**
  - Listed screens’ **date defaults** use local helper where they feed **DateInput** / local “today”.
  - **Date picker “today”** selectable in **VN** timezone evening scenarios.
  - Future disabled/enabled behavior **unchanged** from product intent.
  - **Expiry/HSD** `allowFuture` still works.
- **Integration / Regression Tests:**
  1. **Setup:** Browser/system **UTC+7** late evening. **Action:** open affected forms. **Expected:** “today” is **local** date. **Invariant:** min/max logic unchanged vs spec.
  2. **Setup:** HSD field `allowFuture`. **Action:** pick future date. **Expected:** allowed where business permits. **Invariant:** expiry semantics unchanged.
  3. **Setup:** Report date filters. **Action:** submit. **Expected:** intended **local** range sent. **Invariant:** server interprets same as before.
  4. **Setup:** Promotion validity form. **Action:** inspect default. **Expected:** only UI default changes if appropriate. **Invariant:** backend instant serialization **unchanged**.
- **Performance Validation Plan:** N/A — explain why (UI-only string defaults).
- **Manual QA Checklist:** Compare clock near midnight UTC vs VN; receipts/invoices reports boundaries.
- **Rollback Plan:** Revert FE default string changes.
- **Stop Conditions:** If a `toISOString` usage is **backend instant serialization**, **do not** change it in this slice.

---

### Slice G — Receipt delete/void mapping hardening

- **Scope:** **`deleteBlockReason`** consistency end-to-end; **downstream consumption** remains blocked for delete; **void** remains **separate** action; **no** change to void/delete **core** semantics without owner approval — UX/API mapping only if gaps found. Align FE with BE [`ReceiptDeleteEligibility`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java) / [`InventoryReceiptService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java) responses.
- **Explicit Out of Scope:** Rewriting historical invoice allocations; new void algorithms.
- **Business Logic Truth Guardlist:** §2.1 receipt/void/delete bullets; **void ≠ delete**; **no** invoice allocation rewrite on blocked delete.
- **Performance / Query Guardlist:** Receipt list uses **batched** batch fetch ([`mapReceiptPage`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java) pattern); detail avoids **per-line** batch storm; delete/void validation scoped to **receipt-owned** batches.
- **Files likely changed:** FE: [`GoodsReceipts.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx), [`GoodsReceiptDetailDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/GoodsReceiptDetailDrawer.tsx), [`ReceiptDeleteBlockedDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptDeleteBlockedDialog.tsx), [`BackendGoodsReceiptAdapter`](nha-dan-pos-c091ee5b/src/services/adapters/backend/BackendGoodsReceiptAdapter.ts); BE: only if DTO lacks discriminated reason — prefer **additive** fields.
- **API/DTO changes:** Prefer **document** existing `deleteBlockReason` values; add enum/contract doc in PR if missing.
- **DB migration/index changes:** None.
- **Implementation approach:** Map `canDelete=false` + downstream to **`downstream_consumption`** only; voided receipt distinct messaging; surface **409** `detail` on delete if FE ever calls delete when shielded.
- **Acceptance Criteria:**
  - `canDelete=false` + downstream consumption → `deleteBlockReason=**downstream_consumption**`.
  - **Voided** receipt distinguishable from downstream consumption in UI copy.
  - **Other** reasons **do not** show false downstream message.
  - **Delete** remains blocked when rule says so; **void** does **not** delete history.
  - **No** invoice allocation rewritten on failed delete/void attempt.
- **Integration Test Plan:**
  1. **Setup:** Untouched receipt. **Action:** delete (if allowed). **Expected:** success path per policy. **Invariant:** no downstream flag.
  2. **Setup:** Partially consumed receipt. **Action:** delete. **Expected:** blocked, `downstream_consumption`. **Invariant:** stock/history unchanged.
  3. **Setup:** Fully consumed receipt. **Action:** delete. **Expected:** blocked, `downstream_consumption`. **Invariant:** allocations remain.
  4. **Setup:** Partially consumed. **Action:** void. **Expected:** only **remaining** receipt-owned qty affected. **Invariant:** sold allocation intact.
  5. **Setup:** Fully consumed. **Action:** void. **Expected:** **metadata-only** or service-defined behavior — **document** actual BE contract. **Invariant:** stock unchanged if that is current BE rule.
  6. **Setup:** Voided receipt. **Action:** delete. **Expected:** blocked. **Invariant:** void history preserved.
  7. **Setup:** Invoice allocation from receipt batch. **Action:** after delete/void attempts, inspect allocation. **Expected:** intact on blocked paths. **Invariant:** **no** history rewrite.
- **Regression Test Plan:** Receipt list/detail loads; existing receipt void tests pass; batch sum invariant; movement history preserved.
- **Performance Validation Plan:** Confirm list/detail still **no N+1** batch fetches (stats/SQL).
- **Manual QA Checklist:** Operator sees correct blocked reason; void vs delete education copy still accurate.
- **Rollback Plan:** Revert FE mapping commits; BE unchanged if untouched.
- **Stop Conditions:** If implementation would **rewrite historical invoice allocation**, **stop**.

---

### Slice H — Product reviews/comments future slice

- **Scope:** **Plan only** — DB (`product_reviews` or equivalent), **public/customer/admin** APIs, **moderation**, **verified purchase** (indexed lookup), **pagination**, **indexes**, **abuse/rate limits** — **no** stock/price/revenue/report side effects.
- **Explicit Out of Scope:** Implementation in this release.
- **Business Logic Truth Guardlist:** Reviews **must not** affect invoice snapshots, stock, promotion engine, price, or revenue aggregates.
- **Performance / Query Guardlist:** Paginated lists; summary via SQL aggregate or bounded cache; verified purchase **one indexed query per submit**, not per row in list loop; **no N+1** on read paths.
- **Files likely changed (future):** New entities, repositories, controllers, FE pages — **TBD**.
- **API/DTO changes (future):** Paginated read/write DTOs — **TBD**.
- **DB migration/index changes (future):** Table + indexes on `product_id`, `status`, `created_at`, `customer_id`/`user_id`, optional `invoice_id` — **TBD**.
- **Implementation approach:** **Defer** until Slices A–G stable and owner signs requirements.
- **Acceptance Criteria:**
  - Reviews **do not** affect invoice snapshots, stock, promotion, price, revenue.
  - **Public** reviews paginated; **admin** moderation paginated.
  - **Verified purchase** checked via **indexed** query.
  - **No N+1** on list endpoints.
- **Integration / Regression Tests (future):** Customer creates review; **duplicate** policy enforced; admin approve/reject/hide; product rating summary; unauthorized write blocked; **invoice/report unchanged** under load.
- **Performance Validation Plan:** List queries paginated; verified purchase indexed; **no** per-review purchase query in loop.
- **Manual QA Checklist (future):** Abuse scenarios, long text, rate limit.
- **Rollback Plan:** Feature flag off / drop endpoints.
- **Stop Conditions:** Owner must decide **duplicate policy** and **default moderation state** before implementation.

---

### Slice I — WebSocket live chat future slice

- **Scope:** **Plan only** — **WebSocket/STOMP** ( **not SSE** ); DB **conversation/message** SoT; **persist then broadcast**; **REST paginated backfill**; **auth/subscription authorization**; **guest** policy; **rate limit / message length**; **admin/staff/customer isolation**.
- **Explicit Out of Scope:** Implementation now; SSE transport.
- **Business Logic Truth Guardlist:** Chat **cannot** mutate orders, payments, invoices, or stock.
- **Performance / Query Guardlist:** Compact WS events; **no** full conversation broadcast; **no** `SELECT * FROM conversations` on each message; indexed message/conversation queries; capped payloads.
- **Files likely changed (future):** `spring-boot-starter-websocket`, STOMP config, security handshake, new tables, FE widget — **TBD**.
- **API/DTO changes (future):** REST history + WS event schema — **TBD**.
- **DB migration/index changes (future):** `chat_conversations`, `chat_messages`, indexes — **TBD**.
- **Implementation approach:** Add dependency + `/ws`; JWT channel interceptors; message insert in transaction then broker send; FE reconnect + REST `afterId` backfill.
- **Acceptance Criteria:**
  - **No SSE** as primary transport.
  - **No** local-state-only fake chat — **DB SoT**.
  - Messages **persisted before broadcast**.
  - Reconnect uses **REST backfill**.
  - Customer **cannot** subscribe to admin topics; users **cannot** read unrelated conversations.
  - Chat **cannot** mutate orders/payments/invoices/stock.
- **Integration / Regression Tests (future):** WS auth handshake; persist-then-broadcast ordering; reconnect backfill; unauthorized subscription blocked; admin conversation list paginated; **existing auth** unaffected.
- **Performance Validation Plan:** Compact events; bounded queries; indexes for conversation/message lookup.
- **Manual QA Checklist (future):** Multi-tab, reconnect, proxy stress.
- **Rollback Plan:** Disable WS endpoint; rely on REST only.
- **Stop Conditions:**
  - If **proxy/deployment cannot** support WebSocket upgrade, **stop** before coding.
  - If **auth model cannot** safely authorize subscriptions, **stop**.

---

## 4. Cross-Slice Regression Matrix

| Area | Risk | Guard | Test / verification |
|------|------|-------|----------------------|
| Payment / pending-order / confirm / invoice authority | Unauthorized confirm or wrong actor on money paths | Do not broaden guards; role truth Slice C; adapters not mocks | Existing payment/pending-order integration tests + manual staff/customer tries |
| Stock invariant | `stockQty` ≠ sum(batches) after adjustment | §2.1 batch truth; Slice D reversals | Integration: confirm/reverse adjustment; sum batch `remainingQty` vs variant projection |
| Receipt delete/void | Data loss or wrong operator messaging | §2.1 void≠delete; Slice G mapping | Matrix: delete blocked/consumed; void partial/full; allocations intact |
| Report snapshot truth | Historical revenue from current prices | §2.1 snapshots; Slice B must not touch aggregates | Revenue report with old invoice lines; change catalog price; report unchanged |
| Role access guard | Customer in admin; staff as ROLE_USER | §2.3; Slice C endpoint + save mapping | Security tests 401/403; JWT authority inspection |
| Storefront active/sellable predicate | Inactive or non-sellable leaked | Preserve predicate; Slice E backend contract explicit | Public list only sellable/active SKUs; edge-case manual |
| No fake data / mock production paths | Mock SoT in prod build | §2.1 adapters | Build/env review; smoke on real backend |
| No N+1 / query-in-loop / per-row API | Latency, DB load, inconsistent pages | §2.2; per-slice performance plans | Hibernate stats/SQL logs; network waterfall on lists |
| Search contract drift | Product-only search hides variants, or variant-aware search accidentally changes product/transaction semantics; first-N + local filter hides rows | Separate **search target** from **selection result**; classify each consumer (Slice B tables; **Slice B2** full FE audit) | RBCT direct API proof, Revenue picker proof, B2 grep audit + Selenium/API search-impact, no report/promotion/stock semantic changes |

---

## 5. Test Execution Plan

Group execution **after owner approves** each slice; use repo scripts when present, else **project-equivalent command**.

- **FE typecheck / build**
  - **Command (project-equivalent):** from `nha-dan-pos-c091ee5b`: `npm run build` or `npm run typecheck` if defined in [`package.json`](nha-dan-pos-c091ee5b/package.json) — **confirm script name** before CI.
- **BE compile**
  - **Command (project-equivalent):** from `NhaDanShop`: `./gradlew compileJava` (Windows: `gradlew.bat compileJava`).
- **Unit tests**
  - **FE:** `npm test` or `npx vitest run` per [`package.json`](nha-dan-pos-c091ee5b/package.json).
  - **BE:** `./gradlew test` scoped by `--tests "…"` when iterating a slice.
- **Integration tests**
  - **BE:** `./gradlew integrationTest` or `./gradlew test --tests "*IntegrationTest*"` per Gradle config; add/run Slice B/**B2**/C/D/G cases as specified in §3.
  - **FE:** Vitest integration/component patterns already in repo (e.g. `*.test.tsx`) — **project-equivalent command** as above.
- **Regression tests**
  - Full **FE** test suite + **BE** `test` / `integrationTest` (whichever project uses for API tests); manual cross-slice checks from §4.
- **Manual QA**
  - Scenarios in each slice **Manual QA Checklist**; large-catalog DB for Slice E; VN timezone evening for Slice F.
- **Performance SQL / Hibernate validation**
  - Enable SQL logging / Hibernate statistics in **test** or **local** profile; capture **query count** per request for Slice B (Path B only if backend contract changes), **B2** new variant search + entity `search` params, D confirm path, E list, G list/detail; document **EXPLAIN** for variant-aware `/api/products` if Path B proceeds.

---

## 6. Owner Decisions Required

Only **real** decisions needed before coding:

- Should **admin user creation** expose only **ADMIN/STAFF** or also **CUSTOMER** / `ROLE_USER`?
- Should **`sourceBatchId` be mandatory** or **strongly warned** for damage/wrong receipt/lost/expired when **multiple** batches exist?
- Should storefront **active + sellable** predicate move **fully** to backend (Slice E predicate alignment)?
- Is **index migration** approved for **`variantCode` / `variantName`** if `EXPLAIN` shows sequential scans at production volume?
- **Reviews:** duplicate policy + default moderation state.
- **WebSocket:** guest support, retention, and **proxy/WebSocket** config on deployment.

---

## 7. Final Recommendation

- **Exact implementation order:** **A** (formal baseline verify) → **B** (diagnosis-first Revenue picker + `/api/products` search contract — **business-impact-aware**, not “just add variant predicate”; unblocks RBCT **via proven path** and may help E **only if** backend contract evolves) → **B2** (broad **backend-owned** search/filter; remove first-N + local filter across admin/POS/pickers/entity lists per classification; **defer batch picker to D**) → **C** (roles — high security value) → **D** (stock `sourceBatchId`) → **E** (storefront pagination/search) → **F** (date defaults) → **G** (receipt mapping hardening) → **H/I deferred**.
- **First slice to approve for coding after plan acceptance:** **Slice B** *if* Slice A on-site re-verify passes — **after** RBCT direct-API + picker evidence is captured; **Slice B2** follows **B** to generalize search normalization without mixing in Slice C/D work; **Slice C** should follow quickly given role risk — owner may prioritize **C before B** if RBCT diagnosis can wait; **default technical order** remains **B → B2 → C** for coupling (B narrows **Revenue/catalog contract**; B2 applies the **core search rule** everywhere else; strict non-regression guards).
- **Slices to defer:** **H** (reviews), **I** (WebSocket chat); optional DTO polish for search match display.
- **Highest risks:** **Role truth drift** (Slice C); **batch mutation correctness** (Slice D); **search contract / pagination duplicates** (Slice B — prove path before coding; **B2** — avoid regressions while removing first-N debt); **storefront completeness** (Slice E).
- **Stop-before-coding warnings:** Do not ship **half** of Slice C (endpoint without FE save fix); do not **JOIN FETCH** variants on paged product query; do not change **invoice snapshot** semantics; do not **rewrite allocations** on receipts; **do not** change backend `/api/products` for Revenue RBCT if direct API already returns the product (**Path A**).

**ABSOLUTE STOP:** **Do not implement** until the owner **explicitly approves** the **next** slice.

---

## Appendix — Retained audit references (condensed)

The following **confirmed findings** from the prior read-only audit remain authoritative for file-level pointers (not exhaustive):

- **Issue 1 (toast):** Global Sonner config + single provider; `UserFormDrawer` uses `onSave`; legacy toaster not mounted in `App`.
- **Issue 2 (dates):** `DateInput` uses `localDate`; remaining **`toISOString().slice(0,10)`** defaults listed in §1 **Remains**.
- **Issue 3 (RBCT):** **Diagnosis required** — RBCT is both product and variant code; other pages find it; only Revenue “Lọc theo sản phẩm” fails. Prove **FE vs adapter vs `/api/products` vs filters/session** (`GET /api/products?search=RBCT&page=0&size=20&sort=name,asc` first); **ProductRepository** may still lack variant predicates for **other** consumers, but that alone does not explain Revenue-only failure.
- **Issue 3b (first-N local search):** AdminTopbar, Admin Products, POS, promotion/production pickers, stock-adjustments list, invoices/pending patterns — **Slice B2**; core rule: **backend `search` + paginate**, not `size=500` + browser filter.
- **Issue 4 (storefront):** `size=200` + client filter — **Slice E**.
- **Issue 5 (roles):** Hardcoded drawer + **`ROLE_USER`** staff mapping — **Slice C**.
- **Issue 6 (stock adj):** BE supports `sourceBatchId`; FE omits — **Slice D**; full `listProjections` load = perf debt, separate story.
- **Issue 7 (receipt):** BE eligibility + void exist; FE gating — **Slice G** for mapping/error surfacing hardening.
- **Issues 8–9:** **Slices H–I** deferred.

---

**Plan file integrity:** This markdown file is the **sole** artifact edited in the Slice **B** diagnosis-first / search-contract correction pass and the Slice **B2** normalization addition; **no application source files** were modified; **no new files** were created under `.cursor/plans` (this file updated in place only).
