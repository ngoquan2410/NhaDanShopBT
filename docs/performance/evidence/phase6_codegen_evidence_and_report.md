# Phase 6 — Code generation cleanup: bằng chứng & báo cáo

## 1. Scope completed

- **CustomerService.generateNextCode** — bỏ `findAll()` + scan in-memory; dùng `MAX` suffix SQL + vòng `existsByCode` (thường 1 lần).
- **AccountService.nextCustomerCode** — cùng pattern KH với `CustomerRepository.findMaxKhAutoNumericSuffix`.
- **AuthService.nextCustomerCode** — cùng pattern KH (đăng ký / gán KH).
- **SupplierService.generateNextCode** — bỏ `findAll()`; dùng `findMaxNccAutoNumericSuffix` + `existsByCode`.
- **ProductComboService.generateComboCode** — bỏ `findByProductTypeOrderByNameAsc(...).size() + 1`; dùng `findMaxComboAutoNumericSuffix` trên mọi dòng `product_type = COMBO` (kể cả inactive), + `existsByCode`.
- **ProductService.generateProductCode** — bỏ `findAllCodesByCategoryId` (load toàn bộ mã category); dùng `findMaxNumericSuffixForCategoryPrefix` (một câu `MAX` theo prefix + category) + `existsByCode` như cũ.
- **Migration / sequence DB**: không thêm.
- **API / DTO / FE**: không đổi contract HTTP hay field JSON.

## 2. Files changed

| File | Thay đổi |
|------|-----------|
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/CustomerRepository.java` | `findMaxKhAutoNumericSuffix()` (native, H2 + PostgreSQL portable) |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/SupplierRepository.java` | `findMaxNccAutoNumericSuffix()` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductRepository.java` | `findMaxNumericSuffixForCategoryPrefix(...)`, `findMaxComboAutoNumericSuffix()`; giữ `findAllCodesByCategoryId` (không còn dùng trong `generateProductCode`) |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/CustomerService.java` | `generateNextCode` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/AccountService.java` | `nextCustomerCode` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/AuthService.java` | `nextCustomerCode` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/SupplierService.java` | `generateNextCode` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductComboService.java` | `generateComboCode` |
| `NhaDanShop/src/main/java/com/example/nhadanshop/service/ProductService.java` | `generateProductCode`; xóa `extractMaxSequence`; `buildPrefix` → `public static` (phục vụ test / tái dùng an toàn) |
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase6CodegenIntegrationTest.java` | Test mới KH / COMBO / SP / NCC + bound prepared statements cho codegen SP |

## 3. Codegen methods changed

- `CustomerService.generateNextCode`
- `AccountService.nextCustomerCode`
- `AuthService.nextCustomerCode`
- `SupplierService.generateNextCode`
- `ProductComboService.generateComboCode`
- `ProductService.generateProductCode`

## 4. Before vs after pattern

| Method | Trước | Sau |
|--------|--------|-----|
| KH (3 chỗ) | `findAll()` + lọc `KH\d+` + max trong JVM | `SELECT MAX(suffix)` một lần (chỉ dòng khớp `KH` + toàn chữ số sau `KH`) |
| NCC | `findAll()` + lọc `NCC\d+` | `SELECT MAX(suffix)` tương tự |
| COMBO | `count = listAllCombo.size() + 1` rồi tăng khi `exists` | `MAX` suffix `COMBO###` trên mọi combo (active/inactive) rồi +1 + `exists` |
| Product theo category | `SELECT` toàn bộ `code` của category → max trong JVM | `MAX` suffix theo `prefix` + `category_id` (prefix khớp `UPPER`, đuôi toàn số) |

**Hình dạng SQL suffix “chỉ số”**: dùng chuỗi `REPLACE` lồng nhau để kiểm tra đuôi toàn chữ số, tránh phụ thuộc toán tử regex khác nhau giữa H2 (test) và PostgreSQL (prod).

## 5. Code format compatibility

- **KH**: `KH%03d` — giữ.
- **NCC**: `NCC%03d` — giữ.
- **COMBO**: `COMBO` + `%03d` — giữ.
- **Product**: `buildPrefix(category)` + `%03d` hoặc `%04d` khi `nextSeq > 999` — giữ; prefix theo category không đổi.

## 6. Concurrency / unique risk

- **Đọc MAX rồi ghi**: hai transaction có thể chọn cùng candidate; ràng buộc **unique** trên `code` (customers / products / suppliers) vẫn là lớp cuối.
- **Vòng `existsByCode`**: giảm xác suất trùng trong cùng process; không thay thế serializable isolation.
- **Không** giảm an toàn so với trước: trước đây cũng đọc snapshot rồi sinh mã; không thêm sequence DB theo yêu cầu.

## 7. Tests run + results

Lệnh (Windows):

```text
gradlew test --tests com.example.nhadanshop.integration.Phase6CodegenIntegrationTest
gradlew test --tests com.example.nhadanshop.service.ExcelImportServiceSlice5IntegrationTest
  --tests com.example.nhadanshop.integration.Phase4cExcelProductImportQueryCountIntegrationTest
  --tests com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest
```

**Kết quả**: tất cả **PASS** (exit code 0).

`Phase6CodegenIntegrationTest` bao phủ:

- KH: nối tiếp KH003; gap KH001+KH003 → KH004; `KH00X` không tham gia MAX.
- COMBO: seed `COMBO010` inactive → mã mới `COMBO011` (max suffix gồm cả inactive).
- Product: 40 mã cùng prefix category → `generateProductCode` = prefix + `041`; `prepareStatementCount` ≤ 8 (không scale theo N mã đã lưu).
- NCC: gap → `NCC004`.

## 8. API changed?

**Không** (endpoint / payload không đổi).

## 9. FE changed?

**Không**.

## 10. Business semantics changed?

- **Customer / Supplier / Product auto-code**: semantics **max suffix + 1** trên các mã **đúng pattern** (giữ nguyên ý nghĩa “không reuse lỗ hổng số trong dãy pattern”, không fill lại số đã xóa mềm trừ khi trùng tồn tại).
- **COMBO**: trước đây dùng **`số combo (rows) + 1`**, không phải max suffix — **đã chỉnh** theo plan Phase 6 sang **max suffix** (đúng COMBO### cao nhất + 1). Trường hợp hiếm (ít combo nhưng mã suffix lớn) có thể khác mã so với bản count-based; chấp nhận theo hướng dẫn “MAX suffix pattern”.
- **Import / receipt / sales / stock**: không đổi luồng nghiệp vụ ngoài cách đọc max mã.

## 11. Deferred items

- `findAllCodesByCategoryId`: có thể gỡ hoặc deprecate sau nếu không còn call site (hiện không dùng trong codegen).
- **Order / phiếu** dùng `count()` thay vì MAX: vẫn ngoài scope Phase 6 (cần thiết kế sequence/unique riêng).
- **Phase 5** index Flyway: chưa làm trong phase này; có thể đánh giá index `(category_id, code)` / `code LIKE prefix%` sau EXPLAIN thực tế.

## 12. Final verdict

**PASS — triển khai Phase 6 codegen đạt mục tiêu**: loại bỏ `findAll` / list-all trong đường sinh mã đã liệt kê; giữ format và retry `exists`; không migration; test H2 + gate regression đã chạy xanh.

Phụ lục — audit từng điểm (trước khi sửa):

| File / method | Pattern cũ | findAll / count loop? | Format | Repo MAX có sẵn? | Risk concurrency | Fix |
|---------------|------------|------------------------|--------|------------------|------------------|-----|
| `CustomerService.generateNextCode` | `findAll` + stream | Có | `KH%03d` | Chưa | Giống cũ + unique DB | `findMaxKhAutoNumericSuffix` |
| `AccountService.nextCustomerCode` | `findAll` | Có | `KH%03d` | Chưa | Giống cũ | Dùng chung MAX KH |
| `AuthService.nextCustomerCode` | `findAll` | Có | `KH%03d` | Chưa | Giống cũ | Dùng chung MAX KH |
| `SupplierService.generateNextCode` | `findAll` | Có | `NCC%03d` | Chưa | Giống cũ | `findMaxNccAutoNumericSuffix` |
| `ProductComboService.generateComboCode` | `size(list)+1` | List all combo | `COMBO%03d` | Chưa | Giống cũ | `findMaxComboAutoNumericSuffix` |
| `ProductService.generateProductCode` | `findAllCodesByCategoryId` | Load all codes/category | prefix + `%03d/%04d` | Chưa | Giống cũ | `findMaxNumericSuffixForCategoryPrefix` |
