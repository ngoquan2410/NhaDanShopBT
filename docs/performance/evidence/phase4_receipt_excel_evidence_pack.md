# Phase 4 — Receipt / Excel bulk preload (Evidence Pack)

**Ngày:** 2026-05-09  
**Loại:** Evidence-only — không đổi production code, API, FE, migration, business logic.  
**Tham chiếu:** `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`, `phase0a_backend_evidence.md`, `phase0c_query_baseline.md`, `phase0_go_no_go.md`, `phase1_performance_report.md`, `phase3b_sales_quote_quotecontext_report.md`.

---

## 1. Scope

| Mục | Xác nhận |
|-----|----------|
| Evidence / baseline / tests | Có |
| Refactor `InventoryReceiptService` / Excel services | **Không** |
| Đổi mutation path / `StockMutationService` | **Không** |
| Đổi API contract / DTO / FE | **Không** |
| Flyway / Hibernate production config | **Không** |

---

## 2. Current code behavior map

### 2.1 `InventoryReceiptService` — `createReceipt`

| Mục | Chi tiết |
|-----|----------|
| **File / method** | `NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java` — `createReceipt` |
| **Query-in-loop** | Combo expansion: `productRepo.findById` + `comboRepo.findByComboProduct` mỗi combo request (khoảng L92–L117). Pass 1: `productRepo.findById` **mỗi dòng** `allItems` (L130–L132). Lookup `importUnitRepo` theo dòng (L141, L157). Pass 2: lặp lại `productRepo.findById` **mỗi dòng** (L198–L204); `variantRepo.findByIdForUpdate` mỗi dòng (L243–L244). Sau mỗi dòng: `stockMutationService.updateStockWithBatches`, `appendGoodsReceiptMovement` (L281–L286). Cuối: `comboService.refreshCombosContaining` theo từng `productId` distinct (L325–L328). |
| **Bảng chạm** | `inventory_receipts`, `inventory_receipt_items`, `product_batches`, `product_variants` (metadata/cost/sellable), `inventory_movements` (append `goods_receipt`), `users` (optional `createdBy`), `suppliers`, `product_import_units`, … |
| **Stock / movement** | **Chỉ** qua `StockMutationService.updateStockWithBatches` + `appendMovement` (private `appendGoodsReceiptMovement`). `ProductBatch.remainingQty` = truth lô; `ProductVariant.stockQty` cập nhật theo mutation service. |
| **Rủi ro nếu preload sai** | Map `productId` / combo / import unit sai → sai lô, sai cost allocation, sai movement `source_id`, hoặc race lock variant; **không** được bypass `StockMutationService`. |

### 2.2 `InventoryReceiptService` — `listReceipts` / `mapReceiptPage`

| Mục | Chi tiết |
|-----|----------|
| **File / method** | `listReceipts` → `mapReceiptPage(receiptRepo.findAllWithDetails(pageable))` (L369–L371, L496–L509). |
| **Query-in-loop** | `findAllWithDetails`: `@EntityGraph` receipt + `items` + product/variant. `mapReceiptPage`: **một lần** `batchRepo.findByReceipt_IdIn(receiptIds)` rồi group theo receipt — **không** N+1 batch theo từng receipt trên page. |
| **Bảng** | `inventory_receipts`, `inventory_receipt_items`, `product_batches`, join `users`/`suppliers` theo graph. |
| **Rủi ro** | Nếu sau này đổi mapper để lazy load batch từng dòng → N+1; hiện trạng read path batch là **bounded** theo page (xem mục 4). |

### 2.3 `InventoryReceiptService` — `voidReceipt` / `deleteReceipt`

| Mục | Chi tiết |
|-----|----------|
| **File / method** | `voidReceipt` (L387–L437), `deleteReceipt` (L440–L488). |
| **Query / lock** | `findByIdForUpdate` receipt; liệt kê variant từ batch receipt, lock variant `findByIdForUpdate` sorted; `findByReceiptIdForUpdate` batches. |
| **Movement** | Void: `stockMutationService.updateStockWithBatches` (delta `-rem`), `appendGoodsReceiptVoidMovement` — `source_id` `receipt:{id}:batch:{bid}:void`; chặn trùng ledger `existsBySourceTypeAndSourceId` (L418–L421). Delete: `updateStockWithBatches` delta `-importQty`, `appendGoodsReceiptDeleteMovement`, xóa batch, `syncVariantStockWithBatches`, hard-delete receipt. |
| **Business** | Void giữ receipt + batch, `remaining` về 0; delete chỉ khi mọi batch `remainingQty == importQty`; voided không delete; duplicate void batch-level bị chặn ledger. |

### 2.4 `ExcelImportService` — `parseSheet` / `importProducts`

| Mục | Chi tiết |
|-----|----------|
| **File** | `NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelImportService.java` |
| **parseSheet (read-only)** | Mỗi dòng hợp lệ: có thể `productRepository.existsByCode` (L399); `variantRepository.findByVariantCodeIgnoreCase` (có thể **2 lần** L404–L405); `categoryRepository.findByNameIgnoreCase` + `existsByNameIgnoreCaseAndCategoryId` (L414–L417); nhánh `isNewCat` có thể `findByNameIgnoreCase` (L445 trong file đầy đủ). |
| **importProducts** | Sau preview: parse lại; **mỗi dòng** import: `findByNameIgnoreCase` category (L214), `existsByNameIgnoreCaseAndCategoryId` (L224), `existsByCode` (L237), `save` product/variant paths, `generateProductCode` (có thể load nhiều mã category). |
| **Khóa prescan gợi ý** | `product_code` (raw/resolved), `variant_code` (namespace), `category_name`, `product_name` (trùng tên trong DM). |

### 2.5 `ExcelReceiptImportService` — `parseSingleSheet` / preview / import

| Mục | Chi tiết |
|-----|----------|
| **File** | `NhaDanShop/src/main/java/com/example/nhadanshop/service/ExcelReceiptImportService.java` |
| **parseSingleSheet** | Mỗi dòng: `productRepository.findByCode` (L332); variant có mã: `variantRepo.findByVariantCodeIgnoreCase` (L348); không mã variant: `findByProductIdOrderByIsDefaultDescVariantCodeAsc` (L368–L369); nhánh bổ sung lặp `findByCode` / `findByVariantCodeIgnoreCase` (L411, L428, L436). |
| **Import pass** | Tương tự + tạo receipt/batch qua cùng luồng nhập kho (mutation qua `StockMutationService`). |
| **Khóa prescan** | `product_code` (upper), `variant_code`, `product_id` sau resolve; smart-match cần tập variant theo `productId`. |

---

## 3. Receipt create — DB evidence (current behavior)

**Tests:** `Phase4ReceiptExcelEvidenceIntegrationTest` (`NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase4ReceiptExcelEvidenceIntegrationTest.java`).

| Tiêu chí | Kết quả |
|----------|---------|
| `createReceipt` thành công | Có — response có `id`, DB có receipt |
| Receipt row | `status = confirmed` (hằng `InventoryReceipt.STATUS_CONFIRMED`) |
| `ProductBatch` | Một lô / dòng test; `remainingQty == importQty` ban đầu |
| `ProductVariant.stockQty` | Khớp `SUM(product_batches.remaining_qty)` cho variant (sau flush/clear) |
| `InventoryMovement` | Đúng **1** dòng `goods_receipt` với `source_id` prefix `receipt:{id}:` |
| Transaction / không partial | Pass1 fail (productId không tồn tại ở dòng 2): **`@Transactional(NOT_SUPPORTED)`** + `EntityNotFoundException`; `inventory_receipts.count()` không tăng — không partial receipt |

**Lệnh:**

```powershell
cd C:\Work\NhaDanShopBT\NhaDanShop
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase4ReceiptExcelEvidenceIntegrationTest"
```

---

## 4. Receipt list — query baseline (có batch gắn receipt)

**Test:** `Phase0cQueryCountBaselineIntegrationTest.baseline_receipts_page_with_batches_statementCount`  
**Công cụ:** Hibernate `Statistics.getPrepareStatementCount()` (giống Phase 0C).

**Dataset:** `N` phiếu `confirmed`, mỗi phiếu **≥1** `product_batches` gắn `receipt_id`, cùng một variant seed.  
**Page:** `PageRequest.of(0, N)` — `pageSize = N`.

| Scenario | N | Page size / rows | prepareStatements | Kết luận |
|----------|--:|-----------------:|------------------:|----------|
| `listReceipts` + receipt-owned batches | 10 | 10 | **3** | **Bounded** — không tăng tuyến tính theo N trong đoạn đo |
| | 50 | 50 | **3** | |
| | 100 | 100 | **3** | |

**Nhận định:** `mapReceiptPage` đã batch `findByReceipt_IdIn` — với dữ liệu có batch thực tế, list read path vẫn **bounded**; **không** bắt buộc tối ưu read list cho Phase 4 (trọng tâm Phase 4 là **create / Excel validation** prescan).

**Log mẫu (run local 2026-05-09):** `PHASE0C	receipts_with_batches	N_rows=*	pageSize=*	prepareStatements=3`

---

## 5. Receipt void / delete — matrix evidence

| Kịch bản | Nguồn chứng min | Kết quả |
|----------|-----------------|--------|
| Delete khi chưa tiêu thụ — rollback stock, xóa batch/receipt | `ReceiptDeletionLockingIntegrationTest` | **PASS** (run 2026-05-09) — slice đã bổ sung `@Import(StockedCatalogGuardService.class)` để load `ProductVariantService`. |
| Delete khi đã bán một phần — chặn | Cùng class | **PASS** — `IllegalStateException`, receipt + batch còn nguyên. |
| Void unconsumed — `goods_receipt_void`, `remaining` → 0, stock projection | `Phase4ReceiptExcelEvidenceIntegrationTest.voidReceipt_matrix_unconsumed_and_duplicate` | **PASS** — 1 movement void / batch; `stockQty == SUM(remaining)` |
| Duplicate void service — không double movement | Cùng test — void lần 2 `IllegalStateException` | **PASS** — count void movement không tăng |
| Fully consumed void — không ghi void movement | `voidReceipt_fullyConsumed_metadataOnly` | **PASS** — receipt `voided`, count `goods_receipt_void` = 0 |
| Voided không delete | `deleteReceipt_rejects_when_voided` | **PASS** — `IllegalStateException` |
| HTTP void idempotency / conflict | `CriticalWatchlistGateMvcIntegrationTest.receipt_void_idempotent_replay_keeps_inventory_after_void` | **Existing** — replay cùng idempotency key 200; lần gọi void khác key → 409 (không double trừ stock) |

---

## 6. Excel import — static + query baseline

### 6.1 `ExcelImportService`

- **Per-row (parse):** `existsByCode`, `findByVariantCodeIgnoreCase` (có thể lặp), `findByNameIgnoreCase` / `existsByNameIgnoreCaseAndCategoryId` category + tên SP.
- **Import:** `findByNameIgnoreCase` category, `existsByName...`, `existsByCode`, `generateProductCode`, persist product/variant.
- **Baseline N-row:** **Chưa chạy** trong task này (cần fixture sheet sản phẩm + thời gian); **chỉ static mapping** ở mục 2.4 — đủ để Phase 4 sau prescan key (`code`, `variant_code`, `category_name`, `name`).

### 6.2 `ExcelReceiptImportService` — `previewExcel`

**Test:** `Phase4ReceiptExcelEvidenceIntegrationTest.excel_receipt_preview_statementCount`  
**Fixture:** Workbook `SP Don`, header cột B `"Variant code"` (để `detectNewFormat` = NEW 13 cột), `N` dòng sản phẩm đã seed DB.

| Scenario | N (rows) | Page size | prepareStatements | Kết luận |
|----------|----------:|----------:|------------------:|----------|
| `previewExcel` (SP đơn, đã tồn tại) | 10 | n/a | **31** | ~**3N+1** — query-in-loop theo dòng |
| | 50 | n/a | **151** | |
| | 100 | n/a | **301** | |

---

## 7. Phase 4 implementation boundaries (sau này)

**Được phép:**

- Pre-scan toàn bộ request / sheet trước pass validate/mutate.
- Bulk load product / variant / import unit / category / combo items vào `Map` / `Set`.
- Validate bằng cấu trúc bộ nhớ, **giữ** thứ tự dòng và thông báo lỗi từng dòng như hiện tại.
- **Giữ nguyên** `StockMutationService` cho mọi thay đổi tồn / movement.
- **Giữ** confirmed-on-create, void/delete matrix, hard-delete điều kiện batch, void ledger idempotency/reject như hiện tại.

**Không được:**

- Ghi trực tiếp `stockQty` / `remainingQty` ngoài mutation path.
- Đổi lifecycle receipt, semantics import, ma trận void/delete, DTO/API.

---

## 8. Go / No-Go

| Vùng | Kết luận | Ghi chú |
|------|----------|---------|
| Receipt create — bulk preload (prescan `findById` / combo) | **GO_TO_IMPLEMENT_PHASE_4_RECEIPT_CREATE_BULK_PRELOAD** | Invariant DB + rollback đã có test; list đã bounded với batch. |
| Excel receipt — bulk validation / preview | **GO_TO_IMPLEMENT_PHASE_4_EXCEL_STATIC_BULK_PRELOAD** | Baseline ~3N+1 trên `previewExcel`; static map đủ định hướng prescan. |
| Excel product (`ExcelImportService`) | **GO_TO_IMPLEMENT_PHASE_4_EXCEL_STATIC_BULK_PRELOAD** (kèm điều kiện) | Static evidence đủ; **nên** bổ sung baseline N-row khi có fixture sheet chuẩn (optional). |
| Slice `ReceiptDeletionLockingIntegrationTest` | **Đã xanh** (test harness) | Chỉ thêm bean guard vào `@Import` — không đổi production. |

**Tổng thể Phase 4:** **GO** cho implementation prescan receipt + Excel receipt; product import prescan **GO** trên cơ sở static + cùng pattern với receipt.

---

## 9. Commands tổng hợp

```powershell
cd C:\Work\NhaDanShopBT\NhaDanShop
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase4ReceiptExcelEvidenceIntegrationTest"
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest.baseline_receipts_page_with_batches_statementCount"
# ReceiptDeletionLockingIntegrationTest: hiện fail load context (StockedCatalogGuardService) — xem mục 5
.\gradlew.bat test --tests "com.example.nhadanshop.service.ReceiptDeletionLockingIntegrationTest"
```

---

## 10. Invariant đã assert (test / báo cáo)

- `ProductVariant.stockQty == SUM(ProductBatch.remainingQty)` (sau create/void trong `Phase4ReceiptExcelEvidenceIntegrationTest`).
- Không duplicate `goods_receipt_void` cùng `source_id` khi void lặp (service reject + count movement).
- Void toàn bộ tiêu thụ: không thêm movement void (metadata-only).
- Delete receipt voided: reject; rollback transaction khi Pass1 fail: không tăng số receipt.

---

## 11. Stop conditions (đã kiểm)

- Không cần sửa production để có evidence.
- Không reset DB nguy hiểm — H2 in-memory test.
- Business truth receipt void/delete **không** mâu thuẫn test hiện có.
- Excel: fixture test-only trong code — không phụ thuộc file ngoài repo.
