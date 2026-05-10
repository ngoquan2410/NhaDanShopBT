# Phase 4A — `InventoryReceiptService.createReceipt` bulk preload

**Ngày:** 2026-05-09  
**Phạm vi:** Chỉ nhập kho `createReceipt` (prescan + bulk load). Không Excel import, không đổi list/void/delete/API/FE/migration.

**Tham chiếu:** `phase4_receipt_excel_evidence_pack.md`, `be_performance_n+1_fix_de8140c2.plan.md`, `phase0a_backend_evidence.md`, `phase0_go_no_go.md`, `phase3b_sales_quote_quotecontext_report.md`.

---

## 1. Scope completed

- Prescan `productId` / combo / dòng sau expansion.
- Bulk load `Product`, `ProductImportUnit`, `ProductVariant` (default), `ProductComboItem` (theo combo).
- Pass 1 + Pass 2 không còn `productRepo.findById` theo từng dòng; lookup import unit không còn query per-line từ repository.
- Combo expansion dùng `findByComboProduct_IdIn` + sort ổn định theo `ProductComboItem.id` (tương đương thứ tự deterministic thay cho `findByComboProduct` không khai báo sort).
- Giữ `variantRepo.findByIdForUpdate`, `StockMutationService`, `appendGoodsReceiptMovement`, rollback atomic khi lỗi validation.

---

## 2. Files changed

| File | Thay đổi |
|------|----------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/InventoryReceiptService.java` | Prescan + map; `expandComboLinesIntoAllItems`; index ĐV nhập; bỏ findById/importUnit per-line |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductImportUnitRepository.java` | `findByProductIdIn` (bulk + ORDER BY default-first) |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase4aReceiptCreateQueryCountIntegrationTest.java` | Baseline `prepareStatements` cho N dòng (1 SP lặp) |
| `docs/performance/evidence/phase4a_receipt_create_bulk_preload_report.md` | Báo cáo (file này) |

---

## 3. Prescan / bulk preload design

1. **Direct items** → `allItems`.
2. **Combo:** tập `comboId` distinct → `productRepo.findAllById` (validate tồn tại + `isCombo`) → `comboRepo.findByComboProduct_IdIn` → group + sort theo `id` → expand từng `ComboReceiptRequest` giữ công thức cost/qty/pieces như cũ.
3. **Tập `lineProductIds`** từ `allItems` → `findAllById` → `productById`; thiếu id → `EntityNotFoundException` cùng message dạng cũ.
4. **`importUnitRepo.findByProductIdIn`** → map default PIU + map `(productId, normalized unit)` cho lookup ignore-case.
5. **`variantRepo.findByProductIdInWithProduct`** → `defaultVariantByProductId` (first `isDefault` per product — khớp `getDefaultVariant()`).
6. **Pass 1 / Pass 2:** chỉ đọc từ map; không gọi `findById` / `findByProductIdAndImportUnitIgnoreCase` / `findByProductIdAndIsDefaultTrue` per dòng.

---

## 4. Query-in-loop removed

| Trước (per-line / per-combo) | Sau |
|------------------------------|-----|
| `productRepo.findById` mỗi combo + mỗi dòng Pass 1 + mỗi dòng Pass 2 | `findAllById` combo set + `findAllById` line products (2 bulk tối đa) |
| `comboRepo.findByComboProduct` mỗi combo request | `findByComboProduct_IdIn(comboIdSet)` một lần |
| `importUnitRepo.findByProductIdAndImportUnitIgnoreCase` / `findByProductIdAndIsDefaultTrue` mỗi dòng | `findByProductIdIn` một lần + map trong memory |
| `product.getDefaultVariant()` (lazy variants per product) | `findByProductIdInWithProduct` một lần + map default variant |

---

## 5. Cố ý giữ per-line (và lý do)

| Thành phần | Lý do |
|-------------|--------|
| `variantRepo.findByIdForUpdate(variantId)` | Lock pessimistic theo từng variant — tránh đổi thứ tự lock so với luồng bán hàng / deadlock |
| `stockMutationService.updateStockWithBatches` + `appendGoodsReceiptMovement` | Đúng mutation path; mỗi lô một lần cập nhật |
| `variantRepo.save(variant)` / tạo `ProductBatch` / `InventoryReceiptItem` | Ghi DB theo dòng — INSERT/UPDATE tự nhiên scale theo N |
| `buildBatchCode` → `batchRepo.existsByBatchCode` | Hành vi cũ (tránh trùng mã lô); vẫn có thể gọi theo dòng — **không** đổi trong Phase 4A |

**Ghi chú:** Tổng `prepareStatements` vẫn **tăng mạnh theo N** vì ghi (batch, movement, sync stock nội bộ trong mutation). Mục tiêu Phase 4A là **bỏ read N+1** (product / import unit / combo items), không claim tổng JDBC cố định.

---

## 6. Business truth guardrails verified

- Confirmed-on-create, một transaction `createReceipt`.
- `StockMutationService` + `goods_receipt` `source_id` giữ format `receipt:{id}:batch:{batchId}`.
- Không ghi trực tiếp `remainingQty`/`stockQty` ngoài mutation path.
- Tests: `Phase4ReceiptExcelEvidenceIntegrationTest` (create/rollback/void/delete/metadata), `ReceiptDeletionLockingIntegrationTest`, `Phase0cQueryCountBaselineIntegrationTest.baseline_receipts_page_with_batches_statementCount`, `Phase6BeDomainRegressionIntegrationTest` — **PASS** sau đổi.

---

## 7. Query / read baseline (`createReceipt`)

**Test:** `Phase4aReceiptCreateQueryCountIntegrationTest` — N dòng cùng một `productId`/`variantId`, `importUnit=cai`, H2 + Hibernate `Statistics.getPrepareStatementCount()`.

| N lines | prepareStatements (tổng, gồm INSERT/mutation) |
|--------:|-----------------------------------------------:|
| 10 | 175 |
| 50 | 1834 |
| 100 | 6159 |

**Diễn giải:** Tổng **không** constant — chủ yếu do **ghi theo dòng** + `existsByBatchCode` theo dòng. Phần **đọc** catalog (product / PIU / variant / combo items) được gom **không scale theo N** cho cùng một tập sản phẩm; với dataset “1 SP lặp N lần”, trước đây vẫn có ~**2N** `findById` sản phẩm thừa — đã loại.

**Before:** không có baseline số đo cùng fixture trong repo; so sánh định tính theo bảng mục 4.

---

## 8. Tests run + kết quả

| Lệnh / class | Kết quả |
|--------------|--------|
| `Phase4ReceiptExcelEvidenceIntegrationTest` | PASS |
| `ReceiptDeletionLockingIntegrationTest` | PASS |
| `Phase0cQueryCountBaselineIntegrationTest.baseline_receipts_page_with_batches_statementCount` | PASS |
| `Phase4aReceiptCreateQueryCountIntegrationTest` | PASS |
| `Phase6BeDomainRegressionIntegrationTest` | PASS |

---

## 9. API / FE changed?

**Không.**

---

## 10. Business semantics changed?

**Không** — chỉ thay cơ chế load dữ liệu; combo sort dùng `ProductComboItem.id` ASC để ổn định (thay cho thứ tự JDBC không rõ của `findByComboProduct`).

---

## 11. Final verdict

**Phase 4A hoàn thành:** `createReceipt` đã prescan + bulk preload đúng guardrail; read path product/import unit/combo không còn per-line như trước. **Phase 4B (Excel)** có thể tiếp tục độc lập.
