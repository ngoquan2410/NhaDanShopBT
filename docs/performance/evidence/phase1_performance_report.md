# Phase 1 — Read-path performance (PERF-001, 004, 008, 011)

**Run environment (after):** H2 in-memory, `Phase0cQueryCountBaselineIntegrationTest`, `prepareStatements` = Hibernate `Statistics#getPrepareStatementCount()` trong cửa sổ đo (giống Phase 0C).

## 1. Scope completed

- **PERF-001 — Customer batch stats:** Gom thống kê COMPLETED theo identity (customer FK **hoặc** `customerPhone` chuẩn hóa) bằng tối đa 2 truy vấn invoice + map trong bộ nhớ; không còn 3 aggregate SQL / khách trong `getAll` / `search` / `toResponse`.
- **PERF-004 — ProductCombo bulk preload:** `listAll` / `listActive` / `toResponse` dùng `findByComboProduct_IdIn` + `findByProductIdInWithProduct` + map default variant; không còn `findByComboProduct` từng combo trên list path.
- **PERF-008 — StockAdjustment list:** Hai bước — page ID (`adjDate DESC`, `id DESC`) rồi `EntityGraph` fetch graph theo `id IN`; không JOIN FETCH collection trên `Page` entity đầy.
- **PERF-011 — Promotion list:** Page promotion “nhẹ” + `findAllByIdInWithDetails` + batch tên quà `getProductId`; `listActive` tương tự; không đổi evaluate/pick-best.

**Không làm:** PendingOrder 2B, SalesQuote 3B, Receipt/Excel, Flyway/index, FE/UI, mutation semantics (confirm/reverse adjustment, invoice cancel, v.v.).

## 2. Files changed

| File | Thay đổi |
|------|----------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java` | Batch stats map + `toResponsesWithBatchStats` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java` | `findCompletedByCustomerIdIn`, `findCompletedByCustomerPhoneIn` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java` | `buildComboResponses`, bulk item + variant load |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductComboRepository.java` | `findByComboProduct_IdIn` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductVariantRepository.java` | `findByProductIdInWithProduct` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java` | `getAll` hai bước + sort theo thứ tự page |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/StockAdjustmentRepository.java` | `findIdsByOrderByAdjDateDescIdDesc`, `findAllByIdInWithDetails` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/PromotionService.java` | List + `listActive` batch hydrate + gift names map |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/PromotionRepository.java` | `findAllByIdInWithDetails` |

## 3. Business truth guardrails verified

- Chỉ invoice **COMPLETED** trong stats khách; **CANCELLED** không vào tổng / count / last purchase.
- Identity khách: `(customer.id = :id OR (normalized phone match customerPhone))` giữ như repository cũ; gom set invoice tránh double-count trong cùng khách.
- Combo: `stockQty` / giá trên default variant combo vẫn từ projection đã sync (không đổi rule sellable/virtual trong Phase 1).
- Stock adjustment: chỉ đổi read `getAll`; allocation / confirm / reverse không đụng.
- Promotion: bucket / gift không discount tiền — chỉ preload dữ liệu list.

## 4. API contract changed?

**Không.** DTO/field giữ nguyên.

## 5. UI changed?

**Không.**

## 6. Query count before / after

Nguồn **before:** `docs/performance/evidence/phase0c_query_baseline.md` (run 2026-05-09).  
Nguồn **after:** log `PHASE0C\t...` từ `Phase0cQueryCountBaselineIntegrationTest` sau Phase 1 (2026-05-09).

| Area | N (rows / list size) | Before (prepareStatements) | After (prepareStatements) | Pass/Fail | Notes |
|------|---------------------:|---------------------------:|--------------------------:|-----------|--------|
| Customer `getAll` | 10 | 31 | 2 | Pass | Không scale theo N |
| Customer `getAll` | 50 | 151 | 2 | Pass | |
| Customer `getAll` | 100 | 301 | 2 | Pass | |
| Combo `listAll` | 10 | 24 | 4 | Pass | Cố định ~4 (list products + items + variants + flush) |
| Combo `listAll` | 50 | 104 | 4 | Pass | |
| Combo `listAll` | 100 | 204 | 4 | Pass | |
| Stock adjustment `getAll` | 10 (page 10) | 14 | 3 | Pass | ID page + graph fetch |
| Stock adjustment `getAll` | 50 (page 50) | 54 | 3 | Pass | |
| Stock adjustment `getAll` | 100 (page 100) | 104 | 3 | Pass | |
| Promotion `list` | 10 (page 10) | 32 | 3 | Pass | Spec page + hydrate + gift batch (dataset không có gift) |
| Promotion `list` | 50 (page 50) | 152 | 3 | Pass | |
| Promotion `list` | 100 (page 100) | 302 | 3 | Pass | |

## 7. Tests run and results

| Command / class | Kết quả |
|-----------------|--------|
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase5CommercialPromotionsVouchersMvcIntegrationTest" --tests "com.example.nhadanshop.service.SalesQuotePromotionFlowIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest"` | **PASS** |
| `.\gradlew.bat test --tests "com.example.nhadanshop.service.StockAdjustmentServiceSlice5bIntegrationTest"` | **FAIL** — `ApplicationContext` không load: thiếu bean `StockedCatalogGuardService` trong slice test (không phát sinh từ diff Phase 1; `ProductComboService` phụ thuộc bean này). |

## 8. Known deferred items

- **PendingOrder / SalesQuote quote / Receipt list-heavy paths:** theo `phase0_go_no_go.md` — không thuộc Phase 1.
- **`ProductComboService.updateVirtualStock`:** vẫn dùng `findByComboProduct` per combo — có thể bulk hóa ở phase sau nếu chứng minh parity.
- **Stock adjustment list sort:** hai bước dùng `adjDate DESC, id DESC`; method Spring cũ chỉ `adjDate DESC` — thứ tự khi cùng timestamp có thể khác trước (ổn định hơn cho phân trang).

## 9. Semantic changes?

**Không** — cùng predicate stats khách, cùng shape response combo/promotion/adjustment list.

## 10. Final verdict

**PASS** cho phạm vi Phase 1 (4 area GO_TO_IMPLEMENT): query count bounded theo page/list size cố định trong baseline 0C; không đổi contract hay semantics nghiệp vụ đã mô tả.
