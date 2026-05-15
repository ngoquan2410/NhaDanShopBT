---
name: NhaDanShopBT Remaining Fix
overview: The repo’s frontend baseline (toast, UserFormDrawer onSave, DateInput/localDate, receipt blocked UX, RevenueReport backend product search, StockAdjustment advisory UI, storefront `/products?q=`) is largely present under `nha-dan-pos-c091ee5b/`. Remaining work centers on extending backend product search to variant fields (RBCT), adding an ADMIN-only roles list and fixing staff role persistence (today staff is saved as `ROLE_USER`), wiring real `sourceBatchId` in stock adjustment UX while reusing existing BE allocation logic, and tightening tests/performance checks. Receipt delete/void mapping already appears consistent.
todos:
  - id: slice-verify-fe
    content: "Slice 1: Manual/optional CI verification of FE baseline + receipt gating (no code unless copy tweak)."
    status: pending
  - id: slice-product-search
    content: "Slice 2: Extend ProductRepository.searchProducts with EXISTS variantCode/variantName; add RBCT integration test."
    status: pending
  - id: slice-roles
    content: "Slice 3: Add GET /api/admin/roles; fix adminUsers ROLE_STAFF mapping; wire UserFormDrawer + security tests."
    status: pending
  - id: slice-stock-adj
    content: "Slice 4: StockAdjustmentCreate batch UI + sourceBatchId payload; BE validation/message polish; integration tests."
    status: pending
  - id: slice-receipt-tests
    content: "Slice 5: Receipt deleteBlockReason matrix tests; code changes only if gaps found."
    status: pending
isProject: false
---

# NhaDanShopBT Remaining Fix Plan — PLAN ONLY

## 0. Confirmation

- Confirm no files were edited as part of this response.
- Confirm no migrations were created as part of this response.
- Confirm no implementation was performed as part of this response.
- Read-only inspection used: workspace file reads and searches (`Glob`, `Grep`, `Read`, semantic codebase search). No terminal commands were run.

## 1. Executive Summary

**Baseline assessment:** The active frontend app lives under [`nha-dan-pos-c091ee5b/`](nha-dan-pos-c091ee5b/) (not a root-level `src/`). Backend is under [`NhaDanShop/`](NhaDanShop/). The UI items you listed are present in that tree: global [`sonner.tsx`](nha-dan-pos-c091ee5b/src/components/ui/sonner.tsx) (no `history.pushState` patch; compact top-right; variant styling on root; neutral close), [`UserFormDrawer`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx) destructures `onSave` and calls it in `submit`, [`DateInput`](nha-dan-pos-c091ee5b/src/components/shared/DateInput.tsx) + [`localDate.ts`](nha-dan-pos-c091ee5b/src/lib/localDate.ts) avoid UTC `toISOString` for “today”, receipt blocked UX and gating exist ([`GoodsReceipts.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx), [`GoodsReceiptDetailDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/GoodsReceiptDetailDrawer.tsx), [`ReceiptDeleteBlockedDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptDeleteBlockedDialog.tsx) with the required Vietnamese sentence), [`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx) uses debounced `productService.list` against the backend, [`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx) has the advisory panel and explicit TODO to wire `sourceBatchId`, storefront [`StorefrontNav.tsx`](nha-dan-pos-c091ee5b/src/components/layout/StorefrontNav.tsx) navigates to `/products?q=...` and [`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx) reads `q` from the URL (catalog is still loaded once then filtered client-side — acceptable as “baseline” but not backend-owned search).

**Top 3 risks**

1. **Staff users are currently persisted with `ROLE_USER` from the admin UI** — [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts) maps non-admin to `"ROLE_USER"`, which violates your stated role truth (`ROLE_STAFF` for staff) and can blur admin vs storefront authority. This must be fixed together with the roles endpoint.
2. **Product search excludes variant fields** — [`ProductRepository.searchProducts`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java) only matches `p.name` / `p.code`, so RBCT-style `variantCode` will not surface in the Revenue picker until the query is extended.
3. **Stock adjustment page scales poorly** — it caches `GET /api/inventory/projections` (full list) for search ([`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx)). Batch selection should move to **one call per selected variant** (`GET /api/inventory/projections/{variantId}` already exists in [`InventoryProjectionController`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryProjectionController.java)) to match your performance rules.

**Recommended implementation order:** (1) Roles endpoint + fix `adminUsers.save` / `mapUser` for `ROLE_STAFF` (security truth). (2) Product search variant predicate + integration test for RBCT. (3) Stock adjustment `sourceBatchId` FE wiring + reason enum alignment + validation UX. (4) Receipt DTO mapping verification (likely no code; tests only). (5) Performance/query verification pass on each changed endpoint.

**Already done:** FE UI fixes above; backend already accepts `sourceBatchId` on [`StockAdjustmentRequest.ItemRequest`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/StockAdjustmentRequest.java) and applies exact-batch deduction on confirm ([`StockAdjustmentService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) with `assertSourceBatchStatusAllowedForExplicitNegative`); receipt eligibility uses [`ReceiptDeleteEligibility`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java) consistently in list + detail ([`InventoryReceiptService.mapReceiptPage`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)).

**Remains:** Variant-aware product search; admin roles API + FE integration; stop mapping staff → `ROLE_USER`; stock adjustment batch UI + payload; test/perf matrix; optional small UX copy alignment on goods receipt mobile banner vs dialog.

## 2. Business Truth Constraints

Summarize as required:

- **Backend source of truth:** All production mutations and authoritative reads go through backend APIs; FE adapters normalize only.
- **Batch/stock truth:** `ProductBatch.remainingQty` is canonical; `ProductVariant.stockQty` is projection; mutations go through controlled services (e.g. `StockMutationService`).
- **Receipt delete/void truth:** No hard delete when downstream consumption; void is lifecycle preservation; voided receipts are not hard-deletable; delete vs void remain distinct; no rewriting allocation history.
- **Stock adjustment `sourceBatchId` truth:** When provided for negative deltas, deduct that exact batch after status checks; unsourced negative keeps existing FEFO / “adjustable physical” behavior; reversals use allocation trace ([`StockAdjustmentService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)).
- **Revenue/report snapshot truth:** Revenue filters by `productIds` only; do not recompute historical amounts from current catalog.
- **Role truth:** Admin UI must assign `ROLE_ADMIN` / `ROLE_STAFF` from the `roles` table; **do not** assign storefront customer roles to admin-created staff; staff must not be `ROLE_USER`.
- **Search/pagination truth:** Product list/search stays paginated server-side; variant match must not require loading all variants in the FE.
- **Performance/query truth:** No N+1 in new code paths; no repository calls inside per-item loops for validation; avoid full-table `findAll` for production lists.

## 3. Current State Findings

### FE UI baseline

- **Toast:** Matches requirements in [`sonner.tsx`](nha-dan-pos-c091ee5b/src/components/ui/sonner.tsx).
- **UserFormDrawer:** `onSave` is correctly destructured and invoked; role dropdown is still static with an explicit TODO for BE roles ([`UserFormDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx) lines 92–106).
- **DateInput / localDate:** Local max for date/datetime; documented UTC pitfall avoided ([`DateInput.tsx`](nha-dan-pos-c091ee5b/src/components/shared/DateInput.tsx), [`localDate.ts`](nha-dan-pos-c091ee5b/src/lib/localDate.ts)).
- **Receipt blocked UX:** Dialog copy matches the required sentence ([`ReceiptDeleteBlockedDialog.tsx`](nha-dan-pos-c091ee5b/src/components/shared/ReceiptDeleteBlockedDialog.tsx)). List/detail gate downstream-specific UI on `deleteBlockReason === "downstream_consumption"` ([`GoodsReceipts.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx), [`GoodsReceiptDetailDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/GoodsReceiptDetailDrawer.tsx)). **Minor inconsistency:** mobile list banner uses different wording (`BlockedActionBanner`) — optional copy alignment, not a logic bug.
- **Storefront search:** URL contract `/products?q=` is implemented; search still filters the downloaded catalog in-browser ([`Products.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Products.tsx)).
- **Revenue product picker:** Debounced backend `productService.list` ([`RevenueReport.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/RevenueReport.tsx)); comment already notes BE variant search gap.
- **Stock adjustment:** Advisory panel present; POST body omits `sourceBatchId` ([`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx) lines 55–64); reasons partially mapped to backend enum (only STOCKTAKE/DAMAGED/OTHER).

### Product search / RBCT

- **Observed behavior:** JPQL in [`ProductRepository.searchProducts`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java) matches product name/code only.
- **Root cause:** No predicate on `ProductVariant.variantCode` / `variantName`.
- **Hydration path:** [`ProductService.search`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java) uses `toResponsesWithVariants`, which batch-loads variants by product IDs and sellable sums in **O(1)** queries per page ([`toResponsesWithVariants`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java) ~378–412) — safe to keep after extending the search filter.

### Roles / UserFormDrawer

- **Observed behavior:** Drawer uses static `staff` / `admin` values; [`adminUsers.save`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts) sends `ROLE_ADMIN` or **`ROLE_USER`** for staff — incorrect vs `ROLE_STAFF` ([`V36__role_staff_customer_compat.sql`](NhaDanShop/src/main/resources/db/migration/V36__role_staff_customer_compat.sql) seeds `ROLE_STAFF`).
- **Backend:** [`Role`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/Role.java) entity and [`RoleRepository`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/RoleRepository.java) exist; no `GET /api/admin/roles` controller found in inspection.
- **Security:** [`SecurityConfig`](NhaDanShop/src/main/java/com/example/nhadanshop/security/SecurityConfig.java) already scopes `/api/admin/**` to `ADMIN`.

### Stock adjustment / `sourceBatchId`

- **Observed FE:** Loads full inventory projections list for search; no batch picker; no `sourceBatchId` in POST.
- **Observed BE:** DTO already includes `sourceBatchId`; confirm path handles explicit batch negatives and validates variant ownership and status ([`StockAdjustmentService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)).
- **Inventory API:** [`GET /api/inventory/projections/{variantId}`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryProjectionController.java) returns [`InventoryProjectionResponse`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionResponse.java) with [`byBatch`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/InventoryProjectionBatchResponse.java) (batch id, code, qty, cost, expiry, receiptId) — sufficient for UI without per-batch API calls. Batch **status** is not in the DTO; list query is `remainingQty > 0` ([`findActiveBatchesByVariantId`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)) — document in UI that rows are “on-hand lots” and rely on backend for voided/archived rejection.

### Receipt delete / void mapping

- **Observed BE:** `voided` → `deleteBlockReason = voided`; consumed lots → `downstream_consumption`; list page batches grouped in one query ([`mapReceiptPage`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)).
- **Suspected gaps:** None from inspection; optional hardening is test-only unless QA finds a code path that maps receipts without `forReceipt`.

## 4. Detailed Implementation Plan By Task

### Task B — Backend product search by variant fields (RBCT)

- **Scope:** Extend search only; do not change report semantics.
- **FE changes:** None required for RBCT beyond verifying picker after BE change; optional: show `code` + hint in picker rows if product DTO already includes variants (it does via `ProductResponse` variants in list — no DTO change strictly needed).
- **BE changes:** Update `ProductRepository.searchProducts` JPQL `WHERE` clause to add OR branches using **`EXISTS` subquery** on `ProductVariant` (alias `v`) tied to `p.id`, with `LOWER(v.variantCode) LIKE ...` and `LOWER(v.variantName) LIKE ...` mirroring the `search` parameter. Mirror the same predicate in `countQuery` to keep pagination correct. Avoid joining variant collection on `Product` in the main query to prevent duplicate rows / broken pagination.
- **API/DTO changes:** None if response shape unchanged.
- **DB migration/seed:** **No** (unless you later approve trigram/GiST indexes for ILIKE on large tables).
- **Query design:** Single paginated `Product` query + EXISTS; variant hydration remains `findByProductIdIn` + sellable aggregate (existing).
- **Performance / query plan:**
  - **Pagination:** Unchanged (`Page<Product>`).
  - **Query shape:** `SELECT p ... WHERE ... AND (name/code LIKE OR EXISTS(variant...))`.
  - **Expected query count (steady state):** 1 page query + 1 count + 1 variant-by-productIds + 1 sellable sum query for the page’s variant IDs (same as today’s `toResponsesWithVariants`).
  - **N+1 risk:** Low if batch methods unchanged.
  - **Query-in-loop risk:** None.
  - **Full-table-load risk:** None.
  - **Index needs:** Optional follow-up — composite/index on `(product_id)` already exists for variants; `ILIKE '%x%'` may seq-scan — note as owner decision for PostgreSQL (`pg_trgm`) if catalogs grow large.
- **Acceptance criteria:** Searching `RBCT` returns the parent product; pagination metadata stable; no duplicate products when multiple variants match; Revenue report still filters by `productIds` only; snapshot totals unchanged for same ids.
- **Integration tests:** New MVC or repository slice test: seed product with variant `variantCode='RBCT'`, call `GET /api/products` (or whichever endpoint `productService.list` uses) with `search=RBCT`, assert product id in content; add second variant matching same term — still one parent row on a page.
- **Regression tests:** Existing product list/search tests; name/code search still works; `includeInactive` unchanged.
- **Stop conditions:** Any need for `DISTINCT` on Product due to accidental join — revert to EXISTS-only shape.

### Task C — `GET /api/admin/roles` + UserFormDrawer integration

- **Scope:** Read-only list of assignable roles for admin user management; do not redesign permissions.
- **FE changes:**
  - Add `adminRoles.list()` (or similar) in [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts) calling `GET /api/admin/roles`.
  - [`UserFormDrawer`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx): `useEffect` once per open to load roles; loading/error/empty states; `SelectItem` `value={role.name}` (e.g. `ROLE_STAFF`), label from DTO `label`.
  - **Fix `adminUsers.save` + `mapUser`:** Map `ROLE_STAFF` explicitly; **never** assign `ROLE_USER` for staff. Display labels in [`UsersManagement.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UsersManagement.tsx) for admin vs staff based on role name (not only binary shield badge).
- **BE changes:**
  - New DTO e.g. `AdminRoleOptionResponse(long id, String name, String label)`.
  - New controller method under [`UserController`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/UserController.java) or small `AdminRoleController` at `/api/admin/roles` guarded by existing `/api/admin/**` ADMIN rule.
  - Service: `roleRepo.findAll()` filtered in code with allowlist `ROLE_ADMIN`, `ROLE_STAFF` (exclude `ROLE_USER`, `ROLE_CUSTOMER`, etc.), sorted stable; `label` from Vietnamese map or `Role.description` fallback.
- **API/DTO changes:** Response list as specified.
- **DB migration/seed:** **No** if `ROLE_STAFF` already present ([`V36`](NhaDanShop/src/main/resources/db/migration/V36__role_staff_customer_compat.sql)); otherwise plan insert-only migration **in a future implementation phase** (not in this planning step).
- **Query design:** Single `SELECT * FROM roles` (small table).
- **Performance:** One query per drawer open; cache short-lived in module scope optional (not global huge state).
- **Acceptance criteria:** Dropdown populated from BE; creating staff persists `ROLE_STAFF`; admin persists `ROLE_ADMIN`; non-admin cannot call endpoint; customer roles not offered (unless product owner overrides).
- **Integration tests:** [`Phase6SecurityApiMvcIntegrationTest`](NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase6SecurityApiMvcIntegrationTest.java)-style cases: ADMIN `200`; STAFF/anon `403/401`; create user integration asserting persisted role names.
- **Regression tests:** Login still works; route guards unchanged; existing users list loads.
- **Stop conditions:** If product owner demands CUSTOMER in admin drawer — stop and rescope security impact.

### Task D — Stock adjustment `sourceBatchId` selection + validation

- **Scope:** FE submits real `sourceBatchId`; BE already implements core logic — focus on wiring, UX rules, and any small BE validation gaps (e.g. reject `sourceBatchId` on positive adjustments if not already).
- **FE changes ([`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx)):**
  - Replace “download all projections” with **debounced product/variant discovery** still via inventory or products API — preferred: add typed call `inventory.getProjection(variantId)` when a line is selected or when opening batch selector (1 request per variant).
  - Extend line model: `sourceBatchId?: string | null`, optional display fields.
  - UI per line: when `difference < 0`, show compact batch table from `projection.byBatch` (code, qty, expiry, receiptId, cost); single-select.
  - Reason mapping: align `<select>` options to backend enum [`EXPIRED | DAMAGED | LOST | STOCKTAKE | OTHER`](NhaDanShop/src/main/java/com/example/nhadanshop/entity/StockAdjustment.java) (Vietnamese labels). Today “Sai lệch hệ thống / Khác” both collapsing to `OTHER` is acceptable if labels match business intent; add EXPIRED/LOST if those flows are in scope.
  - Validation UX (pending owner decision): **If multiple batches exist** and reason in `{DAMAGED, EXPIRED, LOST, OTHER}` (your “wrong receipt / lost / expired / damaged” cluster), **require** `sourceBatchId` before confirm; else show warning string exactly: `Chưa chọn lô, hệ thống sẽ phân bổ theo lô tồn vật lý hiện tại.` when single-batch or STOCKTAKE-style allowed ambiguity.
  - POST body: include `sourceBatchId: number | null` per item matching [`StockAdjustmentRequest`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/StockAdjustmentRequest.java).
- **BE changes:**
  - Review `create`/`confirm` for positive adjustments: **ignore or reject** `sourceBatchId` when `actualQty > systemQty` to prevent meaningless batch attribution (confirm current behavior in full `StockAdjustmentService` and adjust if ambiguous).
  - Ensure validation errors translate to **400/409** with stable business messages via [`GlobalExceptionHandler`](NhaDanShop/src/main/java/com/example/nhadanshop/exception/GlobalExceptionHandler.java) (replace raw `IllegalStateException` leakage if any).
  - Multi-item confirm: validate all items using **batch ID → load all distinct batch IDs in one query** (`findAllById`) rather than per-line `findById` if not already batched.
- **API/DTO changes:** Possibly extend `InventoryProjectionBatchResponse` with `status` later — **optional**; start without schema change.
- **DB migration:** **No**.
- **Performance / query plan:**
  - FE: no per-batch HTTP; one `GET /api/inventory/projections/{variantId}` per variant when UI needs batches.
  - BE confirm: reuse existing locking helpers; assert no new loops hitting DB per allocation row beyond existing trace logic.
- **Acceptance criteria:** Exact batch decreases on confirm; wrong variant batch rejected; insufficient qty rejected cleanly; reversal restores trace; invariant `stockQty == sum(remainingQty)` after `syncVariantStockWithBatches` paths; no FE direct stock writes.
- **Integration tests:** Extend [`StockAdjustmentServiceSlice5bIntegrationTest`](NhaDanShop/src/test/java/com/example/nhadanshop/service/StockAdjustmentServiceSlice5bIntegrationTest.java) patterns — two batches, pick batch A, assert B unchanged; wrong variant id; overshoot qty; reversal restores A.
- **Regression tests:** Unsourced negative still works; DAMAGED disallows positive deltas (already enforced client-side — ensure server-side too).
- **Stop conditions:** If FE cannot fetch batches without loading full projection list — add dedicated read DTO endpoint (duplicate of `getProjection`) only as last resort.

### Task E — Receipt delete/void mapping preservation

- **Scope:** Verification + tests only unless QA finds mismatch.
- **FE/BE code changes:** None expected; mapping already uses [`ReceiptDeleteEligibility.forReceipt`](NhaDanShop/src/main/java/com/example/nhadanshop/service/ReceiptDeleteEligibility.java) in list + detail.
- **Tests:** Matrix test cases for `canDelete` + `deleteBlockReason` combinations (`voided`, `downstream_consumption`, deletable); ensure delete endpoint still returns business error consistent with UI (no auto-void).
- **Stop conditions:** If any endpoint returns `canDelete=false` without `deleteBlockReason`, fix DTO mapping in that path only.

## 5. Implementation Slices

### Slice 1 — Verify FE baseline + receipt gating

- **Files:** Visual/manual verification against files listed in section 3; optional copy tweak [`GoodsReceipts.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/GoodsReceipts.tsx) mobile banner.
- **Validation:** Manual QA checklist from your Task A; optional `pnpm lint` / `pnpm build` (frontend), `./gradlew test` subsets (backend) — list as optional since not run in plan mode.
- **Rollback:** N/A (verification only).

### Slice 2 — Variant-aware product search

- **Files:** [`ProductRepository.java`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java); new/updated test under `src/test/java/...`.
- **Validation:** Focused integration test for RBCT; smoke product list page.
- **Rollback:** Revert JPQL EXISTS clause.

### Slice 3 — Roles endpoint + admin FE integration

- **Files:** New controller/DTO; [`RoleRepository`](NhaDanShop/src/main/java/com/example/nhadanshop/repository/RoleRepository.java) query or filtered find; [`adminBackend.ts`](nha-dan-pos-c091ee5b/src/services/adminBackend.ts); [`UserFormDrawer.tsx`](nha-dan-pos-c091ee5b/src/components/shared/UserFormDrawer.tsx); [`UsersManagement.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/UsersManagement.tsx).
- **Validation:** Security tests for `/api/admin/roles`; manual create staff user and inspect DB `user_roles`.
- **Rollback:** Remove endpoint; revert FE to static list **only if** paired with restoring previous behavior (note: previous `ROLE_USER` mapping is worse — prefer forward fix).

### Slice 4 — Stock adjustment `sourceBatchId`

- **Files:** [`StockAdjustmentCreate.tsx`](nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustmentCreate.tsx); [`InventoryService`](nha-dan-pos-c091ee5b/src/services/inventory/InventoryService.ts) / adapter; possibly [`StockAdjustmentService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) validation polish; tests.
- **Validation:** Integration tests in slice 5; manual single-batch vs multi-batch flows.
- **Rollback:** Feature-flag the batch selector; omit `sourceBatchId` in payload (restores prior allocation behavior).

### Slice 5 — Receipt mapping hardening (if needed)

- **Files:** Only if tests reveal gaps — likely [`InventoryReceiptService`](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java) / [`DtoMapper`](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java).
- **Validation:** Receipt void/delete integration tests.
- **Rollback:** Revert mapping patch.

## 6. Test Plan

- **Frontend:** `pnpm typecheck` / `pnpm build` (paths relative to `nha-dan-pos-c091ee5b`) — **optional** validation step.
- **Backend:** `./gradlew test` / focused integration tests — **optional** validation step.
- **Mandatory coverage targets (add tests where missing):**
  - RBCT search by `variantCode`.
  - `/api/admin/roles` security matrix.
  - Staff persists as `ROLE_STAFF` (regression against old `ROLE_USER` bug).
  - Stock adjustment exact batch deduction + wrong variant + insufficient qty + reversal restores allocation.
  - Receipt downstream delete remains blocked; voided receipts not deletable; delete/void matrix unchanged.
  - N+1 / query-in-loop: code review + optional Hibernate statistics in local test logging for changed queries.

- **Manual QA:** Revenue picker search RBCT; create staff user role path; stock adjustment multi-batch negative with and without `sourceBatchId`; attempt receipt delete with consumption.

## 7. Questions / Decisions Needed Before Implementation

- **UserFormDrawer role set:** Only `ROLE_ADMIN` + `ROLE_STAFF`, or also expose `ROLE_USER`/`ROLE_CUSTOMER` for edge admin workflows?
- **`sourceBatchId` strictness:** Mandatory when `byBatch.length > 1` for `{DAMAGED, EXPIRED, LOST, OTHER}`, or warning-only?
- **Search indexing:** Approve PostgreSQL trigram/GiST (or equivalent) for `%search%` on `variant_code` / `variant_name` at scale?
- **Variant match context in product DTO:** Is highlighting which variant matched worth a DTO extension, or is returning the parent product alone sufficient?

## 8. Final Recommendation

- **Implement first:** Slice 3 (roles + fix `ROLE_USER` staff mapping) — corrects authorization truth before expanding admin features.
- **Next:** Slice 2 (variant search) — unblocks Revenue picker RBCT with low blast radius.
- **Then:** Slice 4 (stock adjustment wiring) — largest UX change; leverage existing backend `sourceBatchId` support and `GET /api/inventory/projections/{variantId}`.
- **Defer:** Storefront server-side search/pagination; chat/reviews/chatbot; optional `InventoryProjectionBatchResponse.status`.
- **Key risks:** ILIKE performance at scale without index strategy; accidental reintroduction of `ROLE_USER` for staff during FE refactors; FE regression in stock adjustment if reason strings drift from backend enum.

## ABSOLUTE STOP

Wait for explicit approval before editing any repository files.
