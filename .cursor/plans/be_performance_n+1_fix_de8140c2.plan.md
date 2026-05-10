---
name: BE Performance N+1 Fix
overview: Plan tối ưu N+1/query-in-loop trên NhaDanShop (Java 21 / Spring Boot 3.3 / JPA); giữ business truth; sequencing an toàn — Phase 0A (BE evidence baseline) → 0B (FE/API contract evidence) → 0C (query-count baseline) → P1 sau khi 0A+0C đủ cho vùng đụng; Phase 2B PendingOrder blocked đến khi Phase 2A / FE contract audit pass (mục 4); Phase 3B QuoteContext blocked đến khi Phase 3A golden parity baseline tồn tại (mục 8.F); tối ưu nhạy stock/mutation blocked đến khi Backend Evidence Pack / invariant tests tồn tại (mục 1 — Backend Evidence Pack Gate); pageable+collection ưu tiên 2-step ID (mục 6.6).
todos:
  - id: phase0a-backend-evidence
    content: "Phase 0A: Backend Evidence Baseline — behavior/DB state/golden snapshot/invariant; không đổi business logic"
    status: completed
  - id: phase0b-fe-contract-evidence
    content: "Phase 0B: FE/API Contract Evidence — static audit + JSON shape + chiến lược tương thích; không implement BE/FE"
    status: completed
  - id: phase0c-query-baseline
    content: "Phase 0C: Perf profile + query-count helper; baseline customers, pending admin, quote, combos, stock-adjustments, receipts, promotions"
    status: completed
  - id: phase1-customer-combo-adj-promo
    content: "Phase 1: Customer batch stats + CustomerRepository/ SalesInvoiceRepository; ProductCombo bulk items+sellable; StockAdjustment EntityGraph/2-step; Promotion list fetch + gift name map — chỉ sau 0A+0C baseline cho area"
    status: completed
  - id: phase2a-fe-contract-audit
    content: "Phase 2A: FE/API contract audit (blocked until 0B evidence); output matrix — blocked Phase 2B until pass"
    status: completed
  - id: phase2b-pending-be
    content: "Phase 2B: PendingOrder BE optimization — chỉ sau 2A pass; list không breaking; detail snapshot đủ"
    status: completed
  - id: phase3a-quote-golden-baseline
    content: "Phase 3A: SalesQuote golden/parity baseline (mọi scenario mục 8.F) — blocked Phase 3B until exists"
    status: completed
  - id: phase3b-quote-context
    content: "Phase 3B: SalesQuoteService QuoteContext (sau 3A); data-access only; parity gate pass"
    status: completed
  - id: phase4-receipt-excel
    content: "Phase 4: InventoryReceiptService prescan maps; ExcelImportService/ExcelReceiptImportService bulk validation"
    status: completed
  - id: phase5-index-config
    content: "Phase 5: Đề xuất Flyway indexes + EXPLAIN; Hibernate batch props sau khi tests pass"
    status: pending
  - id: phase6-codegen
    content: "Phase 6: CustomerService.generateNextCode + ProductComboService.generateComboCode dùng MAX suffix pattern"
    status: completed
isProject: false
---

# Plan tối ưu performance Backend NhaDanShopBT

## 1. Executive Summary

### Business truth bắt buộc (gate toàn dự án — không phá khi tối ưu)

- **Stock**: `ProductBatch.remainingQty` là truth; `ProductVariant.stockQty` chỉ projection; `InventoryMovement` append-only.
- **Snapshot**: quote / pending / invoice / profit từ backend snapshot; không recompute lịch sử từ catalog, promotion, loyalty, giá sản phẩm, batch cost hiện tại.
- **Lifecycle**: business event đã posted → cancel / void / reverse / archive; không hard-delete tùy tiện.
- **Pending**: không trừ stock thật; **confirm** là sole authority tạo invoice từ pending; confirm **idempotent**; manual payment link **không** tạo invoice và **không** mark confirmed.
- **Invoice**: từ quote phải materialize lines từ quote payload; exact batch sale / cancel theo **allocation trace**.
- **Stock adjustment**: reversal theo **allocation trace**, không chạy lại FEFO hiện tại.
- **Projection**: `InventoryProjection.onHand` / `available` **không** đổi nghĩa thành sellable.
- **Combo**: virtual sellable từ batch sellable của component **default variants**, không dùng raw `variant.stockQty`.
- **Commercial**: free shipping chỉ ảnh hưởng shipping bucket, không giảm merchandise revenue/profit; gift không phải discount tiền; gift vẫn trừ stock và COGS nếu batch cost > 0 theo rule đã chốt.
- **Pagination**: server-side; `totalElements` = tổng toàn bộ theo filter, không phải độ dài page.
- **Errors**: không leak SQL / JDBC constraint stack trace ra UI/API.

### Implementation Allowed / Blocked Matrix

| Trạng thái | Hạng mục | Ghi chú |
|------------|----------|---------|
| **Allowed first** | Phase 0 — baseline query-count | Không đổi business logic |
| **Allowed first** | Customer batch stats (PERF-001) | JSON field không remove/rename |
| **Allowed first** | ProductCombo bulk preload (PERF-004) | Chỉ khi response tương đương field |
| **Allowed first** | StockAdjustment list — 2-step ID + fetch graph (PERF-008) | Chỉ khi response tương đương field |
| **Allowed first** | Promotion list preload (PERF-011) | Chỉ khi response tương đương field |
| **Blocked until Phase 2A xong** | Phase 2B — PendingOrder BE list/detail optimization | Bắt buộc FE contract audit trước |
| **Blocked until golden baseline tồn tại** | Phase 3 — SalesQuote QuoteContext refactor | SalesQuote Golden Parity Gate |
| **Blocked until root-cause + tests** | `hibernate.default_batch_fetch_size`, `jdbc.batch_size`, `order_inserts/updates` | Không dùng config để che N+1 trước khi có fix |
| **Blocked until EXPLAIN + lock-risk** | Flyway index migration (Phase 5) | Review staging/production |

**Thứ tự triển khai an toàn**: Phase 0 → các mục “Allowed first” (P1) → Phase 2A → Phase 2B (nếu gate pass) → baseline golden quote → Phase 3 → Phase 4–6.

### Đã xác nhận từ code (không chỉ nghi vấn)

- **[CustomerService](NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java)** — `toResponse(Customer c)` gọi **3 query riêng** cho mỗi customer: `sumCompletedTotalForCustomerIdentity`, `countCompletedForCustomerIdentity`, `lastCompletedAtForCustomerIdentity` ([142:156:NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java)). `getAll()` / `search()` map từng row → **3N+1** (N = số customer trả về). Thêm: `generateNextCode()` dùng `findAll()` + vòng `existsByCode` ([63:82:NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java)).

- **[SalesQuoteService](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)** — Vòng `for (SalesQuoteLineRequest line : req.lines())`: `productRepo.findById` mỗi dòng ([92:97](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)); combo: `comboItemRepo.findByComboProduct(product)` mỗi combo line ([114:117](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)); `variantRepo.findById` sau resolve ([104:105](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java), [151:152](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)); `batchRepo.findByIdWithVariantAndProduct` khi có batchId ([160:162](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)). Các helper promotion: `eligiblePromoUnits`, `eligibleSubtotalForQuote`, `qtyByProductMatchingPromotion` lặp lại `productRepo.findById` ([544:556](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java), [584:597](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java), [685:697](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)). `assertVariantDemandAvailable`: mỗi variantId gọi `variantRepo.findById` + `sumSellableRemainingQtyByVariantId` ([700:720](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)) — có sẵn bulk `sumSellableRemainingQtyByVariantIds` trong [ProductBatchRepository](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java) ([317:329](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)). `toLineResponse`, `mapGiftSnapshots`, `mapAffectedLineSnapshots` lặp `findById` product/variant ([766:815](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java), [818:835](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)).

- **[ProductComboService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)** — `listActive` / `listAll` → `toResponse` mỗi combo gọi `comboItemRepo.findByComboProduct(combo)` ([44:51](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java), [260:261](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)) → **N query combo items**. `updateVirtualStock`: sau `findByComboProduct`, vòng for gọi `sumRemainingQtyByVariantId` + stream gọi `sumSellableRemainingQtyByVariantId` từng component ([132:167](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)). `refreshCombosContaining` gọi `updateVirtualStock` + `save` từng combo ([171:176](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java)). **Lưu ý business**: combo validation trong quote/pending đang so sánh `compVariant.getStockQty()` với required ([119:126:NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java), [291:301:NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)) — lệch với guard “virtual stock từ sellable batch”; plan phải **align** sang sellable (hoặc ít nhất physical batch sum) có chủ đích, không đổi semantics ngầm mà không test.

- **[PendingOrderService](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)** — `listPage` / `listAdminPage` / `listAll` / `listRecoverableForCustomer` đều `.map(this::toResponse)` ([375:393](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java), [420:438](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)). `toResponse` đọc `order.getItems()` và mỗi item truy cập `i.getProduct().getId()`, `i.getVariant()`, `i.getBatch()`, cuối cùng `order.getInvoice() != null ? DtoMapper.toResponse(order.getInvoice()) : null` ([568:616](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)). `DtoMapper.toResponse(SalesInvoice)` đọc `inv.getItems()` và map từng line ([101:196:NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java)) → **rủi ro N+1 + payload nặng** trên list. `countAdmin` đúng hướng (5 count theo spec + tổng) ([396:417](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)). `createOrder` / `createOrderFromBackendQuote`: loop `productRepo.findById`, `comboItemRepo.findByComboProduct`, `productBatchRepository.findById` ([152:198](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java), [268:335](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)). `assertPendingVariantDemandAvailable` giống quote: per-variant `findById` + `sumSellableRemainingQtyByVariantId` ([353:371](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)). `nextOrderNo` seed bằng `pendingOrderRepo.count()` — không tuyến tính theo page nhưng **không đảm bảo unique** dưới concurrency (rủi ro tách phase riêng).

- **[StockAdjustmentService](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)** — `getAll` dùng `adjRepo.findAllByOrderByAdjDateDesc(pageable).map(this::toResponse)` ([885:890](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)). `toResponse` đọc `it.getVariant()`, `v.getProduct()`, `it.getSourceBatch()` ([1048:1068](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)) — [StockAdjustmentRepository](NhaDanShop/src/main/java/com/example/nhadanshop/repository/StockAdjustmentRepository.java) **không** có `@EntityGraph` → lazy N+1. `create` loop: `variantRepo.findById` + optional `batchRepo.findById` mỗi dòng request ([141:154](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)) — tối ưu được bằng preload Map (không đổi confirm semantics). `prevalidateTraceInverses`: `batchRepo.findById` trong loop trace ([719:735](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java)).

- **[InventoryReceiptService](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)** — `createReceipt`: Pass1 + Pass2 đều `productRepo.findById(itemReq.productId())` mỗi index ([130:132](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java), [198:204](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)); combo expansion loop `findById` + `comboRepo.findByComboProduct` ([90:118](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)). `mapToResponse` single: `batchRepo.findByReceiptIdOrderByExpiryDateAsc` ([491:493](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)). `mapReceiptPage` **đã batch** batches theo `receiptIds` ([496:509](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)) — tốt.

- **[ExcelImportService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)** — `parseSheet`: mỗi row có thể `existsByCode`, `findByVariantCodeIgnoreCase` (có khi gọi 2 lần) ([397:409](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)), `findByNameIgnoreCase`, `existsByNameIgnoreCaseAndCategoryId` ([412:417](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)), `findByNameIgnoreCase` cho isNewCat ([445:446](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)). `importProducts` loop: `findByNameIgnoreCase` / `save` category, `existsByName`, `generateProductCode` (load all codes category), v.v. ([202:240](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java)).

- **[ExcelReceiptImportService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java)** — `parseSingleSheet` mỗi dòng: `productRepository.findByCode`, `variantRepo.findByVariantCodeIgnoreCase`, `findByProductIdOrderByIsDefaultDescVariantCodeAsc` khi smart-match ([331:369](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java) và phần tiếp theo trong file).

- **[PromotionService](NhaDanShop/src/main/java/com/example/nhadanshop/service/PromotionService.java)** — `list(...).map(this::toResponse)` ([85:87](NhaDanShop/src/main/java/com/example/nhadanshop/service/PromotionService.java)). `toResponse` đọc lazy collections `categories`, `products`, `buyItems` + `productRepo.findById(getProductId)` cho tên quà ([206:217](NhaDanShop/src/main/java/com/example/nhadanshop/service/PromotionService.java)) — N+1 khi page có nhiều promotion. Query list **không** JOIN FETCH graph (chỉ `Specification` + `Page`).

- **[ProductionOrderService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductionOrderService.java)** — `mapOrder`: với mỗi component, `allocationRepo.findByOrderComponent_IdOrderByIdAsc` + `variantRepo.findById(oc.getVariantId())` ([618:658](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductionOrderService.java)). `applyConsumes`: trong vòng `Take`, `batchRepo.findById` mỗi allocation ([544:547](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductionOrderService.java)) — có thể bulk load batch theo id set.

- **[DtoMapper](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java)** — `toResponse(Product)` đọc `p.getVariants()` lazy ([29:33](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java)). `toResponse(SalesInvoice)` đọc `inv.getItems()` và `DtoMapper.toResponse` từng item, item đọc `variant`, `product`, `batchAllocations` ([124:173](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java), [203:243](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java)). **Call site** quan trọng: nhúng invoice đầy đủ trong `PendingOrderResponse` ([612:615:NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)).

### Đã có pattern tốt (giữ làm chuẩn)

- [ProductService.toResponsesWithVariants](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java): bulk `findByProductIdIn`, bulk `sumSellableRemainingQtyByVariantIds`, Map `sellableByVid` ([392:444](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java)).
- [SalesInvoiceRepository](NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java): `findInvoiceIdsForList` + `findAllByIdInForList` với `@EntityGraph` ([46:73](NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java)) — mẫu **2-step ID pagination**.
- [InventoryReceiptService.mapReceiptPage](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java): preload batches theo `receiptIds` ([496:509](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java)).

### Nghi vấn cần verify thêm khi chạm FE

- Đã chuyển thành gate có quy trình: xem **[mục 4. FE/API Compatibility Gate](#4-feapi-compatibility-gate)** và Phase 2A/2B — không quyết định ad-hoc.

### Phạm vi phase này vs defer

- **Làm ngay sau Phase 0 (an toàn, không chờ FE)**: baseline query-count; Customer batch stats; Combo bulk items + sums; StockAdjustment list 2-step/fetch; Promotion list preload; (sau đó) Receipt/Excel prescan, codegen, index (theo gate).
- **Chờ gate**: **PendingOrder Phase 2B** chỉ sau **Phase 2A** (FE contract audit). **SalesQuote Phase 3** chỉ sau **golden parity baseline**. Hibernate batch_fetch / index: theo matrix phía trên.
- **Defer có chủ đích**: đổi `GET /api/customers` sang pagination (breaking) trừ khi FE đồng ý; thay `nextOrderNo` bằng DB sequence/unique constraint (cần design concurrency).

---

## 2. Current Code Findings

| ID | Area/API | Files / methods | Pattern hiện tại | Vì sao chậm | N+1 / loop DB | Business risk nếu sửa sai | Hướng an toàn | API contract? | Migration? | Phase |
|----|----------|-----------------|------------------|-------------|---------------|---------------------------|---------------|---------------|------------|-------|
| PERF-001 | `GET /api/customers` | [CustomerService](NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java) `getAll`, `search`, `toResponse` | Mỗi customer 3 aggregate query identity | O(N) queries | **3N+1** | Sai công thức identity (id+phone) làm sai totalSpend | 1–2 query batch: group by `(customer_id, normalized_phone)` map vào `Map<Long, CustomerStats>` + xử lý phone-only rows; giữ cùng predicate `status=COMPLETED` như [SalesInvoiceRepository](NhaDanShop/src/main/java/com/example/nhadanshop/repository/SalesInvoiceRepository.java) `sumCompletedTotalForCustomerIdentity` | **Không** nếu chỉ đổi implementation | **Không** (ưu tiên JPQL); optional index sau EXPLAIN | P1 |
| PERF-002 | Customer code gen | `CustomerService.generateNextCode` | `findAll` + loop exists | Full table scan + exists loop | High | Trùng mã khi concurrent | `MAX` suffix native tương tự `findMaxSeqForPrefix` + retry unique | No | Optional | P2 |
| PERF-003 | `POST /api/sales/quote` | [SalesQuoteService.quote](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java) + helpers | `findById` trong loop lines + promotion helpers + response mapping | O(lines×k) | **Có** | Đổi eligibility promotion / gift / shipping bucket | **Sau golden baseline (8.E)**; **QuoteContext**: preload maps; **parity gate** pass | No | No | **3** (blocked until golden) |
| PERF-004 | Combo list / virtual stock | [ProductComboService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java) `list*`, `toResponse`, `updateVirtualStock`, `refreshCombosContaining` | `findByComboProduct` per combo; per component `sum*` | O(combos×items) | **Có** | Virtual stock sai predicate | Bulk `findByComboProductIdIn` → `Map<Long, List<ProductComboItem>>`; bulk `sumRemainingQtyByVariantIds` + `sumSellableRemainingQtyByVariantIds` (thêm repo method nếu thiếu); `refreshCombosContaining`: group `comboId` rồi update | No | No | P1 |
| PERF-005 | Quote/Pending combo check dùng `stockQty` | [SalesQuoteService](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java) L119–126; [PendingOrderService](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java) L291–301 | So `variant.stockQty` | Có thể **sai truth** vs sellable | Không phải N+1 nhưng **semantic** | Khách đủ sellable nhưng bị reject hoặc ngược lại | Thống nhất kiểm tra bằng **sellable batch sum** (và physical sum nếu cần tách rule) có test chứng minh | No | No | P2 (kèm test) |
| PERF-006 | Pending list/admin | [PendingOrderService](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java) `list*`, `toResponse` | Lazy items + **full** `DtoMapper.toResponse(invoice)` | Payload + N+1 | **Có** | Mất snapshot hiển thị | **Sau Phase 2A**; 2-step ID + fetch ([6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id)); list slim invoice / summary endpoint / flag theo audit FE | **Có thể** (gate mục 4) | No | **2B** |
| PERF-007 | Pending create | `createOrder`, `createOrderFromBackendQuote`, `assertPendingVariantDemandAvailable` | Per line DB | O(lines) | **Có** | Hỏng quote consume / lock | Cùng QuoteContext pattern; bulk sellable | No | No | P3 |
| PERF-008 | `GET /api/stock-adjustments` | [StockAdjustmentService.getAll](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java), [StockAdjustmentRepository](NhaDanShop/src/main/java/com/example/nhadanshop/repository/StockAdjustmentRepository.java) | Plain `findAll` page | Lazy items | **Có** | Thiếu field response | **2-step ID** + fetch graph bước 2 ([6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id)); tránh `JOIN FETCH` bag trên `Page` | No | No | P1 |
| PERF-009 | Receipt create | [InventoryReceiptService.createReceipt](NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java) | Lặp `findById` 2 pass | 2× rows | **Có** | Hỏng confirmed-on-create | Prescan `allItems` → `Set<Long> productIds`, `Set<Long> comboIds`, import units; `Map` preload; Pass2 chỉ lookup Map; **vẫn** `findByIdForUpdate` per variant trong mutation (cần lock) | No | No | P4 |
| PERF-010 | Excel import | [ExcelImportService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java), [ExcelReceiptImportService](NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java) | Per-row exists/find | O(rows) | **Có** | Sai validation | Pass1 collect keys; bulk load; Map; giữ thứ tự báo lỗi | No | No | P4 |
| PERF-011 | Promotion admin list | [PromotionService.list](NhaDanShop/src/main/java/com/example/nhadanshop/service/PromotionService.java) | Lazy collections + `findById` gift name | O(page) | **Có** | Thiếu buyItems trong response | `JOIN FETCH` / `@EntityGraph` cho list query hoặc DTO projection; bulk load `getProductId` names → `Map<Long,String>` | No | No | P1 |
| PERF-012 | Production map | [ProductionOrderService.mapOrder](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductionOrderService.java), `applyConsumes` | Per component/allocation queries | O(components) | **Có** | Sai snapshot | Preload variants `IN`, batches `IN`; giữ movement semantics | No | No | P2 |
| PERF-013 | DtoMapper / invoice trong pending | [DtoMapper.toResponse(SalesInvoice)](NhaDanShop/src/main/java/com/example/nhadanshop/service/DtoMapper.java) | Lazy items/allocations | N+1 khi invoice chưa fetch | **Có** | Sai profit/snapshot | Fetch graph trước khi gọi mapper hoặc split summary | No | No | P2 |
| PERF-014 | Code generation (đã tốt một phần) | [InvoiceNumberGenerator](NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceNumberGenerator.java), [StockAdjustmentService.nextAdjNo](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockAdjustmentService.java) | Max prefix từ DB | OK | Không | — | Giữ; chỉ audit chỗ còn `findAll` ([CustomerService](NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java), [ProductComboService.generateComboCode](NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java) L246–250) | No | No | P2 |

---

## 3. Guardrail Mapping

| Change proposal | Business truth impacted | Guardrail | Cách plan tránh phá vỡ |
|-----------------|-------------------------|-----------|-------------------------|
| Customer batch stats | Invoice stats chỉ `COMPLETED`; identity id+phone | Giữ nguyên predicate JPQL hiện có | Batch query mirror 3 method hiện tại hoặc 1 native GROUP BY với cùng điều kiện |
| QuoteContext preload | Quote snapshot, promotion/voucher/loyalty buckets, storefront rules | Không đổi thứ tự/bucket; không cho client rewardLine | Chỉ refactor data access; golden tests so sánh `SalesQuoteResponse` payload |
| Combo virtual / validation | Combo sellable từ batch; `stockQty` projection | Không dùng raw `stockQty` cho sellable nếu đã chốt | Explicit migration tests cho combo line + gift |
| Pending list tối ưu | Snapshot JSON fields; tab counts server-side | Detail vẫn đủ snapshot; counts full filter | Phase **2A** xong trước; `countAdmin` giữ nguyên; list chỉ slim invoice sau khi FE gate chấp nhận |
| SalesQuote refactor | Bucket / snapshot commercial | Golden parity trước Phase 3 | Baseline payload mục 8.E; chỉ data-access |
| Stock adjustment list graph | Confirm/reverse, allocation trace | Không đổi mutation path | Chỉ read path; confirm/reverse giữ [StockMutationService](NhaDanShop/src/main/java/com/example/nhadanshop/service/StockMutationService.java) |
| Receipt bulk preload | Confirmed-on-create; một transaction | Không bypass StockMutation | Chỉ giảm select trùng; vẫn `updateStockWithBatches` |
| Hibernate batch_fetch_size | Che N+1 | Không coi là fix root | Chỉ bật sau baseline; kết hợp fix query |

---

## 4. FE/API Compatibility Gate

**Mục tiêu**: trước khi tối ưu PendingOrder list hoặc đổi response shape, phải audit FE usage — **Phase 2B bị chặn** cho đến khi gate này hoàn tất (xem Implementation Matrix).

### 4.1 Bắt buộc grep FE (trước Phase 2B)

Chạy trên toàn bộ frontend repo (ví dụ `nha-dan-pos-c091ee5b/`, và mọi app consumer API), tối thiểu các pattern:

- `pendingOrder.invoice` / `order.invoice`
- `invoice?.items` / `invoice.items`
- `PendingOrderResponse` / `PendingOrder` (type/interface)
- `invoiceSummary` / `invoiceId` / `invoiceNo`

### 4.2 Phân loại usage

- **A** — List / table (admin pending list, dashboard rows).
- **B** — Detail drawer / detail page.
- **C** — Print / export / PDF.
- **D** — Confirm / payment / reconciliation (luồng tiền, đối soát).

### 4.3 Output bắt buộc của audit

- **FE files affected** (đường dẫn đầy đủ).
- **Fields actually used** (nested tới mức nào: `invoice.items`, `batchAllocations`, v.v.).
- **List-only vs detail-only** (hoặc cả hai).
- **BE có thể bỏ full invoice trên list không** — yes/no có điều kiện.
- **Chỉ cần đổi adapter** (map summary → UI) hay bắt buộc giữ nguyên payload list.

### 4.4 Stop condition (gate)

Nếu FE list **bắt buộc** `pendingOrder.invoice` đầy đủ (ví dụ `items`, allocations, profit breakdown) mà **chưa** có kế hoạch migration adapter / endpoint mới / flag — **không được** đổi behavior endpoint list hiện tại làm mất hoặc thay đổi kiểu field đó.

---

## 5. Implementation Plan by Phase

### Phase 0 — Measurement only (P0)

- Thêm profile `test` / `perf`: bật `spring.jpa.properties.hibernate.generate_statistics=true` (chỉ test) hoặc **datasource-proxy** (dependency mới trong [build.gradle](NhaDanShop/build.gradle) — chỉ `testImplementation`).
- Helper `QueryCountHolder` (ThreadLocal) hoặc wrap `DataSource` trong test.
- Baseline **số query** (hoặc statement count) cho:
  - `GET /api/customers` (seed ~100 customers, subset có invoice COMPLETED) — controller [CustomerController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/CustomerController.java)
  - `GET /api/pending-orders` admin page — [PendingOrderController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java)
  - `POST /api/sales/quote` — cần route chính xác từ [SalesQuoteController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/) (grep khi implement)
  - Combo list — [ProductComboController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductComboController.java)
  - `GET /api/stock-adjustments` — [StockAdjustmentController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/StockAdjustmentController.java)
  - `GET /api/receipts` — [InventoryReceiptController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/InventoryReceiptController.java)
- Output bảng Before (Phase 0).
- **Khuyến nghị**: bắt đầu **capture baseline JSON** (phục vụ mục 8.D) cho các endpoint read-only trong Phase 0 nếu có thể — giảm drift trước khi sửa code.

### Phase 1 — Low-risk N+1 (P1)

- **Customer**: thêm `SalesInvoiceRepository` methods batch (hoặc 1 query UNION/aggregation) trả về DTO/tuple → `Map<Long, Stats>`; sửa `toResponse` nhận optional preloaded map; `getAll`/`search` gọi 1 lần sau khi có list customers.
- **StockAdjustment**: **ưu tiên** 2-step: page IDs rồi `findAllByIdInWithGraph` ([6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id)); tránh `JOIN FETCH` collection trên `Page` gốc.
- **Promotion list**: **không** `JOIN FETCH` bag/collection trực tiếp trên `Page` nếu vi phạm [6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id); ưu tiên **2-step ID** + fetch graph bước 2, hoặc batch load collections sau khi có id page; preload gift product names bằng `Set<Long>` → `productRepo.findAllById`.
- **ProductCombo**: bulk load combo items by `comboProductIds`; bulk sum sellable/remaining cho `defaultVariant` ids; `toResponse` nhận maps.

### Phase 2A — FE Contract Audit (P2) — **bắt buộc trước 2B**

- Thực hiện mục **[4. FE/API Compatibility Gate](#4-feapi-compatibility-gate)** đầy đủ.
- **Không** sửa BE PendingOrder list/detail cho mục đích tối ưu invoice embedding trước khi có kết luận audit (trừ fix lỗi bảo mật / correctness khác scope perf).
- Deliverable: tài liệu ngắn (trong PR hoặc wiki) kèm bảng phân loại A–D và quyết định “list có được slim invoice không”.

### Phase 2B — BE PendingOrder Optimization (P2) — **chỉ sau 2A**

**Điều kiện mở**: Phase 2A kết luận rõ FE có thể nhận slim list hoặc đã có kế hoạch migration.

- Nếu FE **chỉ** cần trên list: `invoiceId`, `invoiceNo`, `status`, `total` (hoặc tương đương tối thiểu) — BE **được** tối ưu để list **không** load full invoice items / allocations.
- `GET /api/pending-orders/{id}` (detail) **vẫn** trả đủ snapshot: promo, voucher, loyalty, gift, shipping, pricing breakdown, lines — **không** giảm field snapshot đã có.
- `countAdmin` / tab counts: giữ server-side full filter, **không** đếm theo page hiện tại.
- Nếu FE **cần** full invoice trong list và **chưa** migration adapter:
  - **Không** đổi breaking behavior endpoint list hiện tại.
  - Đề xuất **một trong hai** (backward-compatible):
    - **Option A**: endpoint mới, ví dụ `GET /api/pending-orders/admin/summary` (hoặc tên thống nhất team).
    - **Option B**: query param `includeInvoiceDetails=false|true` (default phải giữ tương thích — thường `true` cho đến khi FE chuyển).
  - FE chỉnh **adapter/service layer** nếu có thể; **không** đổi UI layout trong slice perf trừ khi báo cáo giải thích.
- Repository: ưu tiên **2-step ID pagination** + fetch graph (xem [6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id)) thay vì `JOIN FETCH` collection trên `Page` trực tiếp.
- Xác minh `Page.totalElements` vẫn đúng ([JpaSpecificationExecutor](NhaDanShop/src/main/java/com/example/nhadanshop/repository/PendingOrderRepository.java)).

### Phase 3 — SalesQuote QuoteContext (P2–P3) — **blocked until golden parity**

**Điều kiện mở**: đã có **SalesQuote Golden Parity Gate** — baseline payload được capture và test so sánh field-equivalent (xem [8. Test Plan — E](#e-salesquote-golden-parity-gate)).

- Trong `quote()`: pass1 collect `productIds`, `variantIds`, `batchIds`, `comboProductIds` từ `req.lines()`.
- Preload: products `IN`, variants `IN`, batches `IN`, combo items `IN` → maps.
- Refactor helpers nhận `QuoteContext` / maps; xóa `findById` trong loop.
- `assertVariantDemandAvailable`: build `demandByVariant` rồi **một** `sumSellableRemainingQtyByVariantIds`.
- `toLineResponse` / gift / affected maps: join từ maps, không query.
- Trong suốt refactor: **chỉ** tách data-access; logic pricing/bucket giữ nguyên; mọi diff payload so với golden phải được phân loại bug-fix có chứng từ hoặc revert.

### Phase 4 — Receipt + Excel bulk (P4)

- `createReceipt`: build `Map<Long, Product>` sau pass0; combo expansion dùng map; pass2 không `findById` lặp.
- `ExcelImportService.parseSheet`: cache `Map` code→exists, category name→id; batch variant code conflicts.
- `ExcelReceiptImportService`: tương tự prescan sheet — cần đọc thêm phần import pass2 trong file (đoạn chưa đọc hết).

### Phase 5 — DB index + Hibernate config (đề xuất, chưa apply trong plan review)

- Flyway mới: index gợi ý (sau EXPLAIN trên staging):
  - `sales_invoices (status, customer_id)`, `(status, customer_phone)`, `(invoice_date)`, partial index `WHERE status='COMPLETED'` nếu phù hợp
  - `pending_orders (status, created_at)`, `(customer_id, status, expires_at)`, columns search `order_no`, `customer_phone`
  - `pending_order_items (pending_order_id)`, `(variant_id)`
  - `product_batches (variant_id)` filter sellable (composite với `status`, `expiry_date`, `remaining_qty`) — cẩn trọng cardinality
- Config đề xuất: `hibernate.default_batch_fetch_size=32`, `hibernate.jdbc.batch_size=50`, `order_inserts`, `order_updates` — **chỉ merge sau** Phase 0 baseline và regression tests.

### Phase 6 — Code generation cleanup (P2)

- `CustomerService.generateNextCode`: pattern giống [InvoiceNumberGenerator](NhaDanShop/src/main/java/com/example/nhadanshop/service/InvoiceNumberGenerator.java) (`MAX` substring).
- `ProductComboService.generateComboCode`: bỏ `findByProductTypeOrderByNameAsc(...).size()`.

---

## 6. Detailed Technical Design (chính)

### 6.1 Customer batch stats

- **Keys**: `Long customerId` cho map chính; phone-normalize giống `normalizePhone` trong CustomerService.
- **Query shape** (pseudo):
  - Option A: 3 JPQL `IN (:ids)` với cùng WHERE như 3 method hiện tại — vẫn 3 queries nhưng **O(1)** theo page.
  - Option B: 1 native query `GROUP BY customer_id` cho spend/count + subquery `MAX(invoice_date)` — ít round-trip hơn, cần chứng minh tương đương với OR phone.
- **Map**: `Map<Long, CustomerStats>` merge vào `toResponse`.

### 6.2 QuoteContext

- `Map<Long, Product> products`
- `Map<Long, ProductVariant> variants`
- `Map<Long, ProductBatch> batches` (fetch join variant+product đã có `findByIdWithVariantAndProduct`)
- `Map<Long, List<ProductComboItem>> comboItemsByComboId` — cần thêm `ProductComboRepository.findByComboProductIdIn(List<Long> comboIds)` returning items **with** `product` fetch join
- `Map<Long, Integer> sellableByVariantId` sau một lần `sumSellableRemainingQtyByVariantIds(uniqueVariantIds, today)`

### 6.3 ProductCombo bulk

- Sau `listActive`: collect `List<Long> comboProductIds = products.stream().map(Product::getId)`
- `itemsByComboId = groupBy(comboItemRepo.findByComboProductIdIn(...))`
- Collect `defaultVariantId` mỗi component → `sumSellableRemainingQtyByVariantIds` + optional `sumRemainingQtyByVariantIds` (thêm method bulk nếu chỉ có single-variant API)

### 6.4 Pending list

- **Graph paths**: `PendingOrder.items` → `PendingOrderItem.product`, `variant`, `batch`; `createdBy`; `invoice` — **không** fetch `invoice.items` trên list (tránh bag×bag).
- Nếu cần invoice summary: thêm `@EntityGraph` chỉ `invoice` scalar fields hoặc projection interface.

### 6.5 Stock adjustment list

- Ưu tiên **Page IDs → `WHERE id IN (:ids)` + fetch graph** rồi sort lại theo thứ tự page (index map), thay vì `JOIN FETCH` collection trên query `Page` gốc.
- Entity graph trên bước fetch theo IDs: `StockAdjustment.items`, `items.variant`, `items.variant.product`, `items.sourceBatch`, `createdBy`, `confirmedBy`, `reversalAdjustment`, `reversesOriginal` — validate không gây `MultipleBagFetchException`.

### 6.6 Không Pageable JOIN FETCH collection — ưu tiên 2-step ID

**Rule**: Với endpoint **pageable** có quan hệ **OneToMany / collection**, **không** dùng `JOIN FETCH` collection trực tiếp trên query `Page` nếu có nguy cơ:

- **Duplicate rows** làm sai `totalElements` / slice SQL, hoặc
- Hibernate **pagination in-memory** (warning / fallback), hoặc
- Tăng đột biến số join.

**Pattern bắt buộc ưu tiên**:

1. Bước 1: `Page<Long> ids` (hoặc projection id + order key) với query **không** join fetch bag/collection.
2. Bước 2: `findAllByIdInWithGraph(ids)` hoặc batch fetch associations với `WHERE id IN (:ids)`.
3. Bước 3: **Sắp xếp lại** kết quả trong memory theo thứ tự id ban đầu (`LinkedHashMap` / `orderIndex`).

**Áp dụng rõ ràng cho**: PendingOrder list/admin; StockAdjustment list; Promotion list nếu fetch collections; mọi list kiểu invoice-like sau này.

**Nếu** dùng `@EntityGraph` trực tiếp trên method `Page<Entity>` có collection: **bắt buộc** verify không có in-memory pagination, `totalElements` và nội dung page đúng, SQL log / query-count pass.

---

## 7. Acceptance Criteria

### Global

- Không regression business truth (stock batch, snapshot, pending confirm, invoice cancel, receipt void/delete, adjustment reverse, promotion/voucher/loyalty/shipping tách bucket).
- Không ghi trực tiếp `remainingQty` / `stockQty` ngoài mutation path.
- List APIs: `totalElements` = tổng filter server-side.
- Query count các endpoint trong test perf: **không tăng tuyến tính** theo **N** (số bản ghi trong page hoặc dataset); baseline before/after ghi rõ **dataset size** (ví dụ 50 / 100 rows).
- Integration tests hiện có pass; thêm test query-count / business parity / **API contract snapshot** (xem Test Plan).
- **Pageable + collection**: không duplicate rows / không in-memory pagination do fetch join sai; tuân [6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id).

### FE/API compatibility

- Endpoint hiện có: **không** remove / rename / đổi kiểu field nếu chưa có **FE adapter migration** cùng slice (field **thêm mới** backward-compatible được phép).
- **UI layout** không đổi trong slice performance; mọi thay đổi FE (nếu có) ưu tiên **adapter / type normalization**, có giải thích trong report nếu vượt phạm vi đó.

### Theo endpoint (tóm tắt)

- Customers: không còn per-customer 3 query; stats khớp implementation cũ trên cùng dataset.
- Pending admin: tab counts backend full filter; **detail** (`GET .../{id}`) vẫn đủ snapshot promo/voucher/loyalty/gift/shipping; **list** không breaking nếu chưa có FE migration — tuân Phase 2A/2B; list không N+1 items sau tối ưu.
- Quote: không `findById` trong loop khi đã bulk được; **QuoteContext không đổi pricing semantics**; tách bucket promotion / voucher / loyalty / shipping; gift vẫn reward line giá 0, không discount tiền; FREE_SHIPPING: `promotionDiscount=0`, chỉ shipping bucket; payload **field-equivalent** golden trừ khi đã ghi nhận bug business có chứng từ.
- Combo list: không query items từng combo; virtual stock đúng predicate sellable.
- Receipt create: một transaction; ít SELECT trùng; void/delete không đổi.
- Stock adjustment list: bounded queries; confirm/reverse unchanged.

---

## 8. Test Plan

### A. Query-count regression (mới)

- `customers_100Rows_queryCount_constant` — service hoặc MockMvc `GET /api/customers`
- `pendingOrders_adminPage_50Rows_queryCount_constant`
- `salesQuote_20Lines_queryCount_notLinear`
- `combos_100Rows_queryCount_constant`
- `stockAdjustments_50Rows_queryCount_constant`

### B. Business regression (giữ / mở rộng)

- Các scenario user liệt kê — ưu tiên mapping vào test hiện có dưới [NhaDanShop/src/test/java/com/example/nhadanshop/integration](NhaDanShop/src/test/java/com/example/nhadanshop/integration) và service tests (ví dụ [SalesQuotePromotionFlowIntegrationTest](NhaDanShop/src/test/java/com/example/nhadanshop/service/SalesQuotePromotionFlowIntegrationTest.java)).

### C. Database

- `EXPLAIN ANALYZE` cho batch aggregate customer + pending list + sellable sum.

### D. API Contract Snapshot Tests

- **Mục tiêu**: chặn regression shape JSON khi tối ưu read path / mapper / fetch.
- **Endpoints tối thiểu** cần capture hoặc assert shape (field keys chính, kiểu, nested tối thiểu) **trước / sau** thay đổi liên quan:
  - `GET /api/customers`
  - `GET /api/combos` (hoặc route list combo thực tế từ [ProductComboController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/ProductComboController.java))
  - `GET /api/stock-adjustments`
  - `GET /api/promotions` (admin list)
  - `POST /api/sales/quote`
  - `GET /api/pending-orders/{id}` — **detail**
  - List pending admin hiện tại (route chính xác từ [PendingOrderController](NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java))
- **Rules**:
  - Không remove/rename/type-change field hiện có nếu không có FE migration cùng slice.
  - Field **thêm** OK nếu backward-compatible.
  - Nếu thêm summary endpoint hoặc v2: test **cả** endpoint cũ và mới.
  - Detail pending phải giữ đủ snapshot fields đã cam kết.

### E. SalesQuote Golden Parity Gate

**Phase 3 QuoteContext chỉ implement sau khi gate này có baseline.**

- **Trước refactor** `SalesQuoteService`: tạo baseline / golden payload (JSON hoặc fixture) cho từng scenario (có thể nhiều test case riêng):
  - POS quote có manual discount.
  - Storefront quote — không manual discount / không line discount (enforce hiện tại).
  - Promotion PERCENT_DISCOUNT.
  - Promotion FIXED_DISCOUNT.
  - Promotion FREE_SHIPPING (shipping bucket only).
  - Voucher percent; voucher fixed; voucher free shipping.
  - Loyalty redeem.
  - Gift promotion (reward line, không discount tiền).
  - Dòng combo.
  - Quote có exact `batchId`.
  - Quote có shipping address (storefront).
- **Sau refactor**: `SalesQuoteResponse` (và payload persist nếu test end-to-end) phải **field-equivalent** với baseline (so sánh có kiểm soát: normalize null/scale nếu quy ước rõ).
- **Chấp nhận khác biệt** chỉ khi đã xác nhận là **sửa bug business truth** (ví dụ combo đang dùng `stockQty` thay vì sellable batch sum) — phải ghi trong report và có test chứng minh.
- Nếu pricing / promotion / voucher / loyalty / shipping / gift **đổi không giải thích được** → **stop và report**, không merge.

---

## 9. Risk Register (rút gọn)

| Risk | Level | Regression | Detection | Rollback | Stop |
|------|-------|-------------|-----------|----------|------|
| Summary/detail split pending | **High** | FE hỏng list | Contract test + FE QA | Feature flag / revert | FE bắt buộc full invoice trên list và không chấp nhận v2 |
| QuoteContext sai điều kiện promo/gift | **High** | Tiền/voucher sai | Golden quote tests | Revert service | Payload quote thay đổi không kiểm soát được |
| Đổi combo check sang sellable | **Med** | Reject/accept sai | Integration combo + pending | Revert | Test chứng minh conflict với rule cũ |
| EntityGraph thiếu field archived | **Med** | Thiếu dữ liệu lịch sử | Read tests inactive | Revert graph | Graph ẩn dữ liệu cần cho audit |
| batch_fetch_size che N+1 | **Low** | Vẫn chậm | Query count | Tắt config | Chỉ bật config không có fix query |
| Index migration lock | **Med** | Lock production | Online DDL review | `CONCURRENTLY` / defer | Không rõ lock |
| FE contract break — PendingOrder `invoice` trên list | **High** | UI list hỏng / thiếu allocation | FE grep + JSON contract test (mục 4 + 8.D) | Summary endpoint hoặc `includeInvoiceDetails`; adapter FE | List bắt buộc full invoice, chưa có adapter migration |
| SalesQuote parity drift | **High** | Tiền / bucket sai | Golden parity tests (mục 8.E) | Refactor chỉ data-access; so payload | Thay đổi field pricing/gift/shipping/loyalty không giải thích được |
| Pageable + collection fetch — sai phân trang | **Med/High** | Duplicate rows, sai `totalElements`, in-memory page | SQL log, query-count, assert nội dung page | 2-step ID pagination ([6.6](#66-không-pageable-join-fetch-collection--ưu-tiên-2-step-id)) | Hibernate cảnh báo in-memory pagination hoặc dữ liệu page sai |

---

## 10. Stop Conditions

- Mọi điểm trong user guardlist “Stop and report” — đặc biệt: đổi snapshot structure, đổi mutation path, hard-delete dữ liệu posted, hoặc contract break không có migration FE.
- **PendingOrder**: tối ưu yêu cầu remove/đổi field `invoice` trên **endpoint list hiện tại** mà **chưa** có FE migration / endpoint thay thế / flag tương thích.
- **SalesQuote**: golden payload **đổi** sau refactor mà **không** được xác nhận là sửa bug business truth có chứng từ.
- **Pagination**: fetch collection trên pageable gây **duplicate rows** hoặc **in-memory pagination** — không tiếp tục cho đến khi chuyển sang 2-step ID.
- **Contract**: đổi response shape mà **chưa** có API contract snapshot test / tương đương (8.D).
- **UI**: fix performance **yêu cầu redesign UI** — stop slice perf, tách sang hạng mục product.

---

## 11. Final Report Template (sau implementation)

```markdown
## Performance Fix Report

### Scope Completed
- Phase(s) completed:
- Files changed:
- Migrations added:
- Config changes:

### Business Truth Guardrails Verified
- Stock truth preserved:
- Snapshot truth preserved:
- Pending confirm semantics preserved:
- Invoice cancel/receipt void/stock adjustment reversal preserved:
- Promotion/voucher/loyalty/shipping bucket separation preserved:
- Pagination/count truth preserved:

### Query Count Before/After
| Endpoint/Test | Before queries | After queries | Dataset size | Pass/Fail |
|---|---:|---:|---:|---|

### Functional Tests
| Test | Result | Notes |
|---|---|---|

### Performance Tests
| Test | Result | Query threshold | Actual |
|---|---|---:|---:|

### DB Migration/Index Verification
- Flyway status:
- EXPLAIN ANALYZE summary:
- Indexes used:
- Lock-time risk checked:

### API Compatibility
- Contract changed? yes/no
- If yes, migration path:
- FE impact:

### FE Impact Matrix
| Area | Endpoint changed? | JSON field changed? | FE files touched? | Adapter-only? | UI changed? | Risk |
|---|---|---|---|---|---|---|
| | | | | | | |

### API Contract Verification
- Existing endpoints checked:
- Fields removed/renamed:
- Fields added:
- Backward compatible? yes/no:
- FE migration needed? yes/no:
- FE files changed:

### Quote Golden Parity
| Scenario | Before snapshot captured? | After matches? | Difference accepted? | Notes |
|---|---|---|---|---|
| | | | | |

### PendingOrder Contract Audit
- FE usages found:
- List usages:
- Detail usages:
- Print/export usages:
- Recommended BE strategy:
- FE adapter changes required:

### Known Deferred Items
- Deferred item:
- Reason:
- Suggested next phase:

### Risks Remaining
- Risk:
- Mitigation:

### Final Verdict
- PASS/FAIL:
- Safe to proceed to implementation/release? yes/no:
- Required follow-up:
```
