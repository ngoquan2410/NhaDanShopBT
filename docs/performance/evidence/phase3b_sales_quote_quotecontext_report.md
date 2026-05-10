# Phase 3B — SalesQuote QuoteContext (data-access refactor)

**Ngày:** 2026-05-09  
**Tham chiếu:** `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`, `phase3a_sales_quote_golden_baseline.md`, `phase0c_query_baseline.md`

---

## 1. Scope completed

- Refactor **chỉ data-access** trong `SalesQuoteService.quote` và helper liên quan: preload maps, bulk query, lookup `Map` — **không** đổi pricing bucket, promotion evaluation, DTO/API, FE.
- Loại bỏ pattern **query trong vòng lặp theo N dòng** (product/variant/batch/combo items + sellable per variant).
- Giữ parity với Phase 3A golden baseline (tests gate).

---

## 2. Files changed

| File | Mô tả |
|------|--------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java` | `QuoteContext` (record nội bộ), `buildQuoteContext`, `resolveVariantForQuote`, preload + lookup; bỏ dependency `ProductVariantService` trên path quote. |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java` | `findAllByIdWithVariantAndProductIn` — bulk FETCH batch + variant + product. |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase0cQueryCountBaselineIntegrationTest.java` | Assert `prepareStatements <= 12` cho scenario storefront quote N lặp (Phase 3B bounded gate). |
| `docs/performance/evidence/phase3b_sales_quote_quotecontext_report.md` | Báo cáo (file này). |

---

## 3. QuoteContext design summary

- **Record nội bộ** `QuoteContext` gồm:
  - `productById`
  - `variantById` (explicit + default đã resolve)
  - `defaultVariantByProductId`
  - `batchById` (batch có `batchId` trên request, FETCH variant + product)
  - `comboItemsByComboProductId` (bulk theo combo product id)
- **Luồng preload (`buildQuoteContext`)**:
  1. Thu thập `productId` / `variantId` / `batchId` từ dòng request; thêm `getProductId` của promotion gift (`BUY_X_GET_Y` / `QUANTITY_GIFT`) nếu có.
  2. `ProductRepository.findAllById` cho tập sản phẩm.
  3. Xác định combo → `ProductComboRepository.findByComboProduct_IdIn`; merge `Product` thành phần vào map.
  4. Tập sản phẩm cần **default variant**: dòng `variantId == null`, thành phần combo, gift product.
  5. `variantRepo.findAllById` cho variant explicit; `findByProductIdInWithProduct` + chọn `isDefault` cho default.
  6. `findAllByIdWithVariantAndProductIn` cho mọi `batchId` khác null.
- **Resolve variant**: `resolveVariantForQuote` + `assertReadyForCustomerSale` (mirror logic `ProductVariantService` cho path bán hàng / component).
- **Kiểm tồn bán được**: `assertVariantDemandAvailable` dùng **một** lần `sumSellableRemainingQtyByVariantIds` thay cho vòng `sumSellableRemainingQtyByVariantId` + `findById` từng variant.

---

## 4. Repository methods added/changed

| Repository | Method | Ghi chú |
|------------|--------|---------|
| `ProductBatchRepository` | `findAllByIdWithVariantAndProductIn(Collection<Long> batchIds)` | JPQL `IN` + `JOIN FETCH` variant, product. |
| Các repo khác | *Không thêm method mới* | Dùng sẵn `findAllById` (JPA), `findByProductIdInWithProduct`, `findByComboProduct_IdIn`, `sumSellableRemainingQtyByVariantIds`. |

---

## 5. Query-in-loop removed

| Trước (trong loop / helper lặp) | Sau (bulk / preload) |
|--------------------------------|----------------------|
| `productRepo.findById` mỗi dòng + trong `eligiblePromoUnits` / `eligibleSubtotalForQuote` / `qtyByProductMatchingPromotion` | `findAllById` một lần + `productById` |
| `variantService.resolveVariant` → `findById` / `findByProductIdAndIsDefaultTrue` lặp | Bulk explicit + `findByProductIdInWithProduct` + map |
| `variantRepo.findById` sau resolve (hydrate) + `toLineResponse` / snapshots | Thực thể đã trong `variantById` |
| `batchRepo.findByIdWithVariantAndProduct` mỗi dòng có batch | `findAllByIdWithVariantAndProductIn` |
| `comboItemRepo.findByComboProduct` mỗi combo line | `findByComboProduct_IdIn` + map theo combo id |
| `sumSellableRemainingQtyByVariantId` + `findById` từng variant trong `assertVariantDemandAvailable` | `sumSellableRemainingQtyByVariantIds` + map |

---

## 6. Golden parity result

| Test suite | Result (2026-05-09, local) |
|------------|----------------------------|
| `Phase3aSalesQuoteGoldenBaselineIntegrationTest` | **PASS** |
| `SalesQuotePromotionFlowIntegrationTest` | **PASS** |
| `Phase6BeDomainRegressionIntegrationTest` | **PASS** |
| `Phase5CommercialPromotionsVouchersMvcIntegrationTest` | **PASS** |
| `Slice6cQuotePaymentIntegrationTest` | **PASS** |
| `Phase0cQueryCountBaselineIntegrationTest` | **PASS** (kèm assert bounded quote) |

---

## 7. Query count before/after (Hibernate `prepareStatementCount`, storefront quote N dòng giống nhau)

Nguồn **before:** `docs/performance/evidence/phase0c_query_baseline.md` (2026-05-09).  
Nguồn **after:** log `PHASE0C` / `PHASE3A` trong `build/test-results/test/` sau Phase 3B.

| Scenario | N | Before | After | Pass/Fail |
|----------|---|--------|-------|-----------|
| Phase0C `sales_quote` | 10 | 16 | **8** | Pass |
| Phase0C `sales_quote` | 50 | 56 | **8** | Pass |
| Phase0C `sales_quote` | 100 | 106 | **8** | Pass |
| Phase3A reference `sales_quote` | 20 | 26 | **8** | Pass (test 3A chỉ assert `> 0`) |

**Nhận xịnh:** pattern **không còn tuyến tính theo N** cho kịch bản lặp cùng product/variant/batch; số tuyệt đối vẫn phụ thuộc các bước cố định (shipping mock, persist quote, v.v.).

---

## 8. Persisted payload parity

- Golden **15** (`golden_persisted_payload_snapshot`) **PASS** — `SalesQuotePayloadDto` deserialize khớp response (breakdown, lines, promotion, shipping).
- Không đổi serialization shape hay `SalesQuoteService` pricing pipeline sau capture lines.

---

## 9. Business truth guardrails verified

- POST quote vẫn là nguồn pricing checkout/POS; storefront vẫn reject manual/line/`rewardLine` client.
- Bucket tách: manual / promotion merchandise / voucher / loyalty / shipping — không đụng `PromotionEvaluationService` hay loyalty production ngoài wiring hiện có.
- `FREE_SHIPPING`, gift giá 0, batch quote không mutate stock: **không đổi code path semantics** (chỉ đọc batch + sellable sum).

---

## 10. API contract changed?

**Không** — cùng DTO/response shape.

---

## 11. FE changed?

**Không.**

---

## 12. Business semantics changed?

**Không** — chỉ thay cách load entity; validation/giữ message lỗi tương đương (ví dụ gift missing product vẫn `IllegalArgumentException`).

---

## 13. Known deferred items

- Quote phức tạp (nhiều product/variant/batch **khác nhau** trên từng dòng) vẫn tỷ lệ với số **entity khác biệt** — chấp nhận; mục tiêu là loại bỏ **N+1 trùng lặp** khi N dòng trỏ cùng catalog keys.
- `resolveFallbackPromotionId` vẫn gọi `promotionEvaluationService.pickBest` (ngoài scope preload catalog).

---

## 14. Final verdict

**PASS — GO** cho Phase 3B: data-access refactor với preload có kiểm soát; golden + commercial tests pass; Phase0C quote bounded (assert `<= 12` prepare statements cho scenario N=10/50/100).
