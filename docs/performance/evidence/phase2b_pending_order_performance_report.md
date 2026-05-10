# Phase 2B — PendingOrder BE list/read-path performance

**Ngày:** 2026-05-09  
**Tham chiếu contract:** `docs/performance/evidence/phase2a_pending_order_contract_signoff.md`

---

## 1. Scope completed

- Tối ưu **list admin** (`listAdminPage`), **list theo thời gian** (`listPage`), **listAll**, và **account recoverable list** (`listRecoverableForCustomer`) để:
  - **Không** gọi `DtoMapper.toResponse(order.getInvoice())` trên list (tránh load full invoice + items/allocations).
  - **Batch-hydrate** `PendingOrder` + `items` + `items.batch` + `createdBy` bằng **một truy vấn** `IN (:ids)` sau khi có page ID (pattern 2 bước: page cha + hydrate).
- **Detail** `getById` / `getByCode`: dùng cùng graph hydrate cho lines/batch, sau đó **`toResponse(..., includeFullInvoice=true)`** để giữ **invoice đầy đủ** khi có liên kết.
- **Không** đổi: confirm/cancel/payment/Casso/SalesQuote QuoteContext, migration, FE, UI.
- **countAdmin** giữ nguyên logic `Specification` + `count()` — không đếm từ page.

---

## 2. Files changed

| File | Thay đổi |
|------|-----------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/PendingOrderRepository.java` | `findAllByIdInForListHydrate` — `@EntityGraph`: `items`, `items.batch`, `createdBy` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java` | `mapOrdersForList`, tách `toResponse(order, includeFullInvoice)`; list paths dùng `includeFullInvoice=false`; `PageImpl` cho admin/simple page; `getById`/`getByCode` hydrate + full invoice |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase0cQueryCountBaselineIntegrationTest.java` | Giới hạn trên cho baseline pending; thêm scenario **CONFIRMED + invoice + 3 dòng invoice**; assert `invoice == null` trên list |

---

## 3. Implementation strategy

| Hạng mục | Lựa chọn |
|----------|----------|
| **List vs detail mapper** | Có — `toResponse(order, false)` cho mọi list; `true` cho getById/getByCode và các luồng mutation hiện gọi `toResponse(order)` một đơn (create/mark/cancel/confirm vẫn dùng overload mặc định `true`). |
| **2-step ID pagination** | **Một phần:** bước 1 `findAll(spec, pageable)` chỉ load **root** `PendingOrder` (items/invoice lazy); bước 2 `findAllByIdInForListHydrate(ids)` — **không** JOIN FETCH trên `Page` entity đầy. |
| **Invoice trên list** | **Slim:** field `invoice` trong JSON list là **`null`** dù DB có `invoice_id` — khớp Phase 2A (FE không map `raw.invoice`). Client ngoài repo nếu phụ thuộc nested invoice trên list cần flag/endpoint sau (chưa thêm). |

---

## 4. API contract changed?

**Shape DTO không đổi** — cùng `PendingOrderResponse` với field `invoice` optional. **Hành vi:** trên **list/account list**, `invoice` luôn **`null`** (trước đây có thể là object đầy đủ khi đã confirm). Đây là thay đổi **payload có điều kiện** đã được Phase 2A chấp nhận cho FE chính thức; ghi nhận rủi ro **client ngoài repo**.

---

## 5. FE code changed?

**Không.**

---

## 6. Business semantics changed?

**Không** — pending không trừ kho; confirm sole authority; snapshot không recompute; countAdmin full-filter; `totalElements` từ `Page` repository.

---

## 7. Query count before / after (H2, `Phase0cQueryCountBaselineIntegrationTest`)

Nguồn **before:** `docs/performance/evidence/phase0c_query_baseline.md` (2026-05-09).  
Nguồn **after:** log `PHASE0C\t...` run 2026-05-09 sau Phase 2B.

| Scenario | N / pageSize | Before (`prepareStatements`) | After | Pass/Fail | Notes |
|----------|--------------|-------------------------------|-------|-----------|--------|
| Admin list, **không** invoice | 10 | 12 | **3** | Pass | ~N+2 → cố định |
| Admin list, **không** invoice | 50 | 52 | **3** | Pass | |
| Admin list, **không** invoice | 100 | 102 | **3** | Pass | |
| Admin list, **CONFIRMED + invoice** + 3 `SalesInvoiceItem`/row | 10 | *(chưa đo baseline cũ)* | **3** | Pass | Không scale theo payload invoice |
| Admin list, **CONFIRMED + invoice** + … | 50 | * | **3** | Pass | |
| Admin list, **CONFIRMED + invoice** + … | 100 | * | **3** | Pass | |

Test assert: `prepareStatements <= 5` cho cả hai scenario.

---

## 8. Pending rows with invoice scenario

| Mục | Giá trị |
|-----|---------|
| **Measured?** | **Có** — `baseline_pending_orders_admin_page_with_linked_invoices_statementCount` |
| **Kết quả** | `prepareStatements=3` với N=10/50/100; mọi dòng list có `invoice == null` |
| **Nếu không đo** | — |

---

## 9. Contract verification

| Kiểm tra | Kết quả |
|---------|---------|
| Detail snapshots preserved | **Có** — list/detail vẫn map cùng JSON snapshot + `lines` từ `PendingOrder` (không đọc invoice trên list). |
| Confirm invoice preserved | **Có** — `confirmOrder` / idempotent branch vẫn `DtoMapper.toResponse(invoice)`; `pendingOrder` trong response vẫn `toResponse(order)` đầy đủ invoice khi cần. |
| countAdmin preserved | **Có** — không đổi implementation. |
| totalElements | **Có** — `PageImpl` dùng `poPage.getTotalElements()`. |

---

## 10. Tests run + results

| Command / suite | Kết quả |
|-----------------|--------|
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.service.Slice6cQuotePaymentIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase5CommercialPromotionsVouchersMvcIntegrationTest"` + `SalesQuotePromotionFlowIntegrationTest` | **PASS** |
| FE: `npm test -- --run src/pages/admin/PendingOrders.serverPagination.test.tsx` | **PASS** (3 tests) |

---

## 11. Known deferred items

- **Client ngoài repo** cần nested `invoice` trên list → có thể thêm `includeInvoiceDetails` (default giữ tương thích theo Phase 2A) hoặc endpoint summary — **chưa** implement.
- **`getByCode` / `getById`**: thêm 1 query existence + 1 hydrate (chấp nhận để tránh N+1 batch trên lines).
- **`listPage` / `listAll`**: ít được gọi từ controller hiện tại; đã đồng bộ pattern list.

---

## 12. Final verdict

**PASS** — list path bounded (~3 prepared statements trong baseline H2), không load invoice/items trên list; detail/confirm giữ invoice đầy đủ; semantics & counts giữ nguyên.

**Khu vực vẫn blocked theo plan khác:** SalesQuote golden parity (Phase 3B), Receipt/Excel bulk, index phase, v.v. — không thuộc Phase 2B.
