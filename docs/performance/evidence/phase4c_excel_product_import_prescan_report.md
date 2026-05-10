# Phase 4C — Excel product import preview/import prescan + bulk preload

## 1. Scope completed

- **`ExcelImportService`**: prescan sheet (cùng rule skip/header/empty như `parseSheet`), gom distinct mã SP (upper), tên danh mục (lower trim key), bulk load product / variant / category / cặp (categoryId, LOWER(TRIM(name))) cho R9 skip.
- **`parseSheet`**: thay mọi lookup per-row trong nhánh validate bằng map/context; không đổi layout cột, rule R1–R11, hay shape `ParsedRow`.
- **`previewProducts`**: một lần `parseSheet` + `assemblePreviewFromParsedRows` (logic preview giữ nguyên, chỉ tách method).
- **`importProducts`**: một lần `parseSheet` + cùng preview assembly; cache category theo lower key + seed tập trùng tên từ bulk; `assignedCodesInBatch` để tránh trùng mã trong cùng batch; vẫn `existsByCode` khi ghi DB (trùng cross-transaction); `generateProductCode` không đổi.
- **Không đổi**: `ExcelReceiptImportService`, `InventoryReceiptService`, API/DTO/FE, migration, semantics nghiệp vụ tạo SP/variant/category.

## 2. Files changed

| File | Change |
|------|--------|
| `CategoryRepository.java` | `findByTrimmedNameLowerIn` |
| `ProductRepository.java` | `findCategoryIdAndNameLowerKeysByCategoryIdIn` |
| `ExcelImportService.java` | `ProductSheetCatalog`, `buildProductSheetCatalog`, `assemblePreviewFromParsedRows`, prescan trong `parseSheet`, import path cache |
| `Phase4cExcelProductImportQueryCountIntegrationTest.java` | Test đếm `prepareStatementCount` (N=10/50/100) |
| `docs/performance/evidence/phase4c_excel_product_import_prescan_report.md` | Báo cáo này |

## 3. Prescan / context design

1. **Scan** (giống vòng lặp parse: `detectStartRow`, `isRowEmpty`, `isLegendRow`): gom `manualCodesUpper`, `categoryLowerKeys`.
2. **Bulk**:
   - `productRepository.findByCodeIn(manualCodesUpper)` → `productByUpperCode`
   - `variantRepository.findByVariantCodeLowerIn` (reuse Phase 4B) → `variantByNormalizedCode` (key `normalizeVariantCodeKey`, đồng bộ R11)
   - `categoryRepository.findByTrimmedNameLowerIn` → `categoryByLowerName`
   - `productRepository.findCategoryIdAndNameLowerKeysByCategoryIdIn(catIds)` → `existingProductNameInCategoryKeys` (`"categoryId|nameLower"`)
3. **Parse row**: map lookup thay cho `existsByCode`, `findByVariantCodeIgnoreCase` (×2), `findByNameIgnoreCase` (×2), `existsByNameIgnoreCaseAndCategoryId`.
4. **Import**: seed `categoryByLower` + `importedNameKeys` từ cùng bulk; lazy tạo category mới + `findByNameIgnoreCase` fallback nếu chưa có trong map; sau mỗi dòng import thành công cập nhật `importedNameKeys` / `assignedCodesInBatch`.

**Scaling**: số câu lệnh đọc (preview) scale theo **distinct keys**, không theo N khi bulk ổn định.

## 4. Query-in-loop removed

| Trước (ước lượng static / per row) | Sau |
|-----------------------------------|-----|
| `productRepository.existsByCode` | `productByUpperCode.containsKey` |
| `variantRepository.findByVariantCodeIgnoreCase` (gọi 2 lần) | `variantByNormalizedCode.get` |
| `categoryRepository.findByNameIgnoreCase` (isNewCat + R9) | `categoryByLowerName` |
| `productRepository.existsByNameIgnoreCaseAndCategoryId` | `existingProductNameInCategoryKeys.contains` (preview); import: set đã seed + cập nhật sau save |

**Import path**: vẫn có `existsByCode`, `findByNameIgnoreCase` (fallback category), `save` — không còn lặp category/name existence **theo từng dòng** như trước khi cache đã seed.

## 5. Query count before / after

**Preview** (`previewProducts` → `parseSheet`), H2 + `hibernate.generate_statistics`, fixture: N dòng, **N mã SP distinct**, một danh mục đã có trong DB.

| Scenario | N | Before (static / mô hình) | After (đo) | Pass |
|----------|---|---------------------------|------------|------|
| Product preview | 10 | ~5×N SELECT-style lookups/row (exists, variant×2, category×2, exists name) | **4** | Pass |
| Product preview | 50 | ~250 | **4** | Pass |
| Product preview | 100 | ~500 | **4** | Pass |

Test: `Phase4cExcelProductImportQueryCountIntegrationTest` — chặn `prepareStatementCount` ≤ 25 (dư địa Hibernate).

**Import write path**: INSERT/UPDATE vẫn tăng theo số dòng import; không dùng cùng metric “preview-only” để so sánh trực tiếp.

## 6. Row-level validation parity (mục tiêu)

- **Trùng mã trong file / hệ thống / namespace variant (R8/R11)**: cùng thông báo, dùng map product + variant bulk.
- **Trùng tên trong DM (R9)**: skip khi key `categoryId|lower(trim(name))` khớp tập bulk; import dùng set động sau mỗi lần tạo SP.
- **Danh mục mới**: `isNewCat` khi không có trong `categoryByLowerName` sau bulk (tương đương không tìm thấy category trong DB trước parse).
- **Field bắt buộc / giá / sellable**: không đổi (parse cell giữ nguyên).

**Lưu ý**: Khớp tên bulk dùng `LOWER(TRIM(p.name))` vs `name.trim().toLowerCase(Locale.ROOT)` trên sheet — căn chỉnh với `existsByNameIgnoreCaseAndCategoryId` cho trường hợp thường gặp; locale edge (e.g. Turkish I) hiếm trong dữ liệu DM SP.

## 7. Import path impact

- **Preview + import**: một lần parse file cho import (sau đó assemble preview từ `ParsedRow`); không còn `previewProducts(file)` đọc file lần hai trước vòng lặp ghi.
- **Sinh mã**: `productService.generateProductCode(category)` giữ nguyên; không tối ưu thêm codegen (ghi nhận deferred nếu cần phase riêng).

## 8. Tests run

- `Phase4cExcelProductImportQueryCountIntegrationTest`
- `ExcelImportServiceSlice5IntegrationTest`
- `Phase4ReceiptExcelEvidenceIntegrationTest`
- `ExcelReceiptImportServiceSlice5IntegrationTest`
- `Phase6BeDomainRegressionIntegrationTest`

## 9. API / FE changed?

**Không.**

## 10. Business semantics changed?

**Không** (rule skip/error, auto code preview prefix, tạo category/product/variant qua service giữ như cũ).

## 11. Known deferred

- Tối ưu sâu **`generateProductCode`** / giảm hotspot khi import hàng loạt auto-code — phase codegen riêng nếu đo được bottleneck.
- Nếu cần parity 100% với mọi collation DB cho tên SP, có thể bổ sung test đặc thù hoặc alignment query (không làm trong 4C).

## 12. Final verdict

**Go.** Preview sản phẩm không còn pattern query-per-row cho catalog lookup; đo được **4** prepared statements cho mọi N trong fixture Phase 4C. Receipt Excel / Phase 4B không bị ảnh hưởng (test regression PASS).
