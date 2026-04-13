# 🛠️ TODO — Fix Issues NhaDanShop UI

> Cập nhật: 13/04/2026 | **Trạng thái: 22/22 cũ ✅ + Issue 23 ✅ đã fix + Issue 24 ✅ đã fix**

---

## ✅ Issues 1–13
_(Xem lịch sử — đã hoàn thành)_

## ✅ Issue 14 — Soft Cancel hóa đơn (chuẩn KiotViet)

### Backend
**Migration** `V3__invoice_soft_cancel.sql`:
```sql
ALTER TABLE sales_invoices
  ADD COLUMN status        VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN cancelled_at  TIMESTAMP,
  ADD COLUMN cancelled_by  VARCHAR(100),
  ADD COLUMN cancel_reason VARCHAR(500);
CREATE INDEX idx_si_status ON sales_invoices(status);
```

**`SalesInvoice.java`**:
- Thêm `enum Status { COMPLETED, CANCELLED }`
- Thêm fields: `status`, `cancelledAt`, `cancelledBy`, `cancelReason`
- Helper: `isCancelled()`

**`SalesInvoiceResponse.java`**: thêm `status`, `cancelledAt`, `cancelledBy`, `cancelReason`

**`DtoMapper.toResponse(SalesInvoice)`**:
- `totalProfit = 0` nếu HĐ bị hủy (không tính lợi nhuận HĐ đã hủy)
- Map 4 cancel fields vào response

**`InvoiceService.cancelInvoice(id, reason, actor)`**:
- Kiểm tra đã hủy chưa → throw nếu hủy 2 lần
- Audit log: `[AUDIT-CANCEL] Hóa đơn=... | user=... | lý do=...`
- Set `status=CANCELLED`, `cancelledAt`, `cancelledBy`, `cancelReason`
- Hoàn tồn kho: `variant.stockQty++` + `restoreStockFEFOAccurate(item)` (Issue 15)
- Không xóa DB — HĐ vẫn còn trong lịch sử

**`SalesInvoiceController`**:
- `PATCH /api/invoices/{id}/cancel` — nhận `{ reason }` optional

### Frontend
**`invoiceService.js`**: `cancel(id, reason)` → `PATCH /api/invoices/{id}/cancel`

**`useInvoices.js`**: mutation `cancel` — onSuccess toast tên HĐ

**`InvoicesPage.jsx`**:
- Component `CancelModal`: form lý do + thông tin HĐ + cảnh báo
- State `cancelTarget` — HĐ đang chờ xác nhận
- Nút `🚫 Hủy` trong cột thao tác (chỉ hiện khi HĐ chưa hủy)
- Badge `Đã hủy` màu đỏ cạnh số HĐ
- Tổng tiền gạch ngang + màu xám khi HĐ đã hủy
- Mobile card: ẩn action buttons, hiện thông tin hủy (ai hủy, lúc nào, lý do)

## ✅ Issue 15 — Fix FEFO restore batch khi hủy/xóa HĐ

**Vấn đề cũ** (`ProductBatchService.restoreStockOnCancel`):
```
Bán → FEFO deduct lô CŨ NHẤT (sắp hết hạn)
Hủy → restore vào lô ĐẦU TIÊN không expired ← SAI (có thể là lô mới hơn)
```

**Fix** — method `restoreStockFEFOAccurate(item)` trong `InvoiceService`:
```
1. Tìm batch có costPrice == item.unitCostSnapshot → đây là batch đã bị deduct
2. Nếu không tìm được (rare case) → fallback: lô MỚI NHẤT không expired (LIFO)
   → giảm thiểu sai lệch tồn kho kỳ vọng
3. Cộng remainingQty + qty, lưu DB, log debug
```

**Logic ưu tiên**:
| Trường hợp | Restore vào đâu |
|---|---|
| Tìm thấy batch có cost == snapshot | ✅ Đúng batch đã bị bán |
| Không tìm thấy, có batch không expired | Fallback: batch mới nhất |
| Tất cả đều expired | Fallback: batch cuối cùng |

---

## ✅ Issue 16 — Fix lệch dòng khi có 2 biến thể trong form tạo sản phẩm

**File**: `ProductsPage.jsx`

**Vấn đề**: Grid `grid-cols-2` trong form biến thể bị lệch hàng khi có warning text (⚠️ giá bán) làm các ô không đều chiều cao.

**Fix**:
- Thêm `items-start` vào `grid grid-cols-2` để các cell không bị kéo giãn theo cell cao nhất
- Tách cặp "Giá bán / Giá vốn" vào nested grid riêng `col-span-2 grid grid-cols-2`
- Thêm `div.min-h-[1.25rem]` để placeholder warning — đảm bảo cả 2 cell luôn cao đều nhau dù có hay không có warning

---

## ✅ Issue 17 — Xác nhận logic `active` sản phẩm vs biến thể

**File**: `ProductService.java` → method `update()`

**Câu hỏi**: Bỏ chọn "Hoạt động" trong form sửa sản phẩm có cập nhật `is_active` của variant không?

**Kết luận**: ✅ **Logic ĐÚNG** — chỉ update `product.active`, không đụng đến variant.

| Trường | Ý nghĩa | Độc lập? |
|--------|---------|----------|
| `product.active = false` | Ẩn SP khỏi danh sách, không bán được | ✅ Có |
| `variant.active` | Ẩn biến thể cụ thể đó | ✅ Có |

Backend `update()` chỉ gọi `p.setActive(req.active())` — không loop qua variants. Muốn ẩn từng variant phải vào trang quản lý variant riêng.

---

## ✅ Issue 18 — Thêm mới NCC inline khi tạo phiếu nhập

**Files**: `ReceiptsPage.jsx` — `ReceiptForm` + `ImportReceiptExcelForm`

**Vấn đề**: Khi tìm NCC không có kết quả, không có cách tạo mới → phải thoát ra ngoài vào trang NCC.

**Fix** — Tham khảo pattern customer trong `InvoicesPage.jsx`, áp dụng cho **2 form**:
- `ReceiptForm` — form tạo phiếu nhập thủ công
- `ImportReceiptExcelForm` — form import phiếu nhập bằng Excel

**Logic chung**:
- Thay `<select>` dropdown NCC → search input có debounce 350ms
- Tìm thấy → dropdown kết quả, click để chọn
- Không tìm thấy → hiện panel inline "Tạo NCC mới?" với form: **Tên\* / SĐT / Địa chỉ**
- Sau khi tạo → auto chọn NCC vừa tạo + `invalidateQueries(['suppliers'])`
- Đã chọn NCC → hiện badge xanh + nút ✕ để đổi
- Chưa search → vẫn cho nhập tên NCC thủ công (không bắt buộc lưu)

---

## ✅ Issue 22 — Tự động sinh mã khách hàng khi tạo inline từ hóa đơn

**Files**: `CustomerRequest.java`, `CustomerService.java`

**Vấn đề**: Khi tạo khách hàng mới inline từ form tạo hóa đơn, FE không gửi `code` → backend trả lỗi `400 "code: must not be blank"`.

**Fix**:
- `CustomerRequest.java`: bỏ `@NotBlank` khỏi `code` — cho phép null/blank
- `CustomerService.create()`: tự sinh code nếu không có
  ```
  generateNextCode():
    1. Tìm tất cả code dạng KHxxx, lấy số lớn nhất
    2. +1 và format KH001, KH002, ...
    3. Vòng lặp đảm bảo unique (tránh race condition)
  ```

**Kết quả**: Tạo KH inline không cần nhập mã → mã tự sinh `KH001`, `KH002`...

---

## 🔜 Đề xuất tiếp theo

### Issue 23 — Cho phép nhập kho với ngày trong quá khứ (receiptDate tùy chọn)

#### 🔍 Hiện trạng — Tại sao chưa hỗ trợ?

Backend hard-code `LocalDateTime.now()` tại **2 chỗ**:

```java
// InventoryReceiptService.java:47 — form thủ công
receipt.setReceiptDate(LocalDateTime.now());

// ExcelReceiptImportService.java:702 — import Excel
receipt.setReceiptDate(LocalDateTime.now());
```

FE (`ReceiptForm` + `ImportReceiptExcelForm`) cũng **không có field chọn ngày** — hoàn toàn chưa hỗ trợ.

---

#### 🎯 Tại sao cần?

| Tình huống thực tế | Hậu quả hiện tại |
|---|---|
| Hàng về thứ 6, thứ 2 mới vào máy | Phiếu ghi ngày thứ 2 → báo cáo nhập kỳ sai 3 ngày |
| Có phiếu giấy tồn đọng nhiều ngày | Lịch sử nhập kho không phản ánh thực tế |
| Kế toán đối soát hàng tháng | Tồn đầu kỳ / cuối kỳ sai vì ngày nhập sai |
| Import Excel hàng loạt phiếu cũ | Tất cả đều ghi ngày hôm nay, mất dữ liệu lịch sử |

---

#### ⚠️ PHÂN TÍCH ẢNH HƯỞNG KHI NHẬP KHO NGÀY QUÁ KHỨ

##### 1. `variant.costPrice` — ✅ KHÔNG ảnh hưởng

```java
// InventoryReceiptService.java ~line 222
variant.setCostPrice(finalCostWithVat);   // ghi đè giá vốn MỚI NHẤT
variant.setStockQty(variant.getStockQty() + addedRetailQty);
variant.setUpdatedAt(LocalDateTime.now()); // ← vẫn dùng now() — đúng
```

`costPrice` là **"giá vốn hiện tại"** của variant — luôn là giá của lô nhập **gần nhất**,
không phụ thuộc `receiptDate`. Nếu nhập phiếu ngày quá khứ, `costPrice` vẫn được cập nhật
đúng theo giá của lô đó → **không bị ảnh hưởng**.

---

##### 2. `variant.stockQty` — ✅ KHÔNG ảnh hưởng

`stockQty` chỉ là **số đếm thực tế hiện tại**, không phụ thuộc thời gian.
Dù phiếu ghi ngày nào, `+= addedRetailQty` vẫn chạy đúng → **tồn kho thực luôn chính xác**.

---

##### 3. `ProductBatch.expiryDate` — ⚠️ ẢNH HƯỞNG NẾU KHÔNG có `expiryDateOverride`

```java
// InventoryReceiptService.java ~line 231
} else if (variant.getExpiryDays() != null && variant.getExpiryDays() > 0) {
    expiryDate = LocalDate.now().plusDays(variant.getExpiryDays()); // ← dùng now()!
}
```

**Vấn đề**: Nếu nhập phiếu ngày quá khứ mà **không điền `expiryDateOverride`**,
batch sẽ tính HSD từ **ngày hôm nay** (ngày tạo phiếu), không phải ngày hàng thực sự về.

**Ví dụ**:
```
Hàng về: 05/04 | Expirydays = 30 ngày
Vào máy: 13/04 (hôm nay)
→ receiptDate = 05/04 (chọn đúng)
→ expiryDate  = 13/04 + 30 = 13/05  ← SAI! (đúng phải là 05/04 + 30 = 05/05)
```

**Giải pháp**: Khi user chọn ngày quá khứ, nếu không có `expiryDateOverride`:
- Dùng `receiptDate.toLocalDate().plusDays(variant.expiryDays)` thay vì `LocalDate.now()`

---

##### 4. FEFO (First Expired First Out) — ⚠️ ẢNH HƯỞNG NẾU expiryDate sai

FEFO sort theo `expiry_date ASC`:
```java
// ProductBatchService.java
List<ProductBatch> batches = batchRepo.findByVariantIdForUpdateFEFO(variantId);
// → ORDER BY expiry_date ASC, id ASC
```

Nếu `expiryDate` của batch nhập quá khứ bị tính sai (xem mục 3), batch đó sẽ
**nằm sai vị trí** trong hàng đợi FEFO → bán sai thứ tự lô → giá vốn snapshot sai.

**Mức độ**: Chỉ ảnh hưởng khi `expiryDays > 0` VÀ không điền `expiryDateOverride`.
Nếu admin luôn điền ngày HSD thực tế khi nhập quá khứ → FEFO vẫn đúng.

---

##### 5. Báo cáo tồn kho kỳ (`InventoryStockService`) — ✅ TỰ ĐỘNG ĐÚNG

```java
// InventoryStockService.java — công thức:
// openingStock = currentStock - recv(from→∞) + sold(from→∞)
// totalReceived = sumReceivedQtyByVariantBetween(fromDt, toDt)  ← dùng receiptDate
// closingStock  = openingStock + totalReceived - totalSold
```

Báo cáo tồn kho dùng `item.receipt.receiptDate BETWEEN :from AND :to` để tính
**Nhập kỳ** và **Tồn đầu kỳ**. Khi `receiptDate` phản ánh đúng ngày thực tế,
báo cáo sẽ **tự động tính đúng** hơn so với hiện tại (ghi sai ngày).

→ Đây chính là lý do chính cần tính năng này: **báo cáo kho đúng theo kỳ**.

---

##### 6. Báo cáo doanh thu (`RevenueService`) — ✅ KHÔNG ảnh hưởng

Báo cáo doanh thu dùng `invoice.invoiceDate`, không liên quan `receiptDate` → **an toàn**.

---

##### 7. `updateReceiptMeta` — ⚠️ CẦN BỔ SUNG

Hiện tại `PATCH /api/receipts/{id}/meta` chỉ cho sửa `note` + `supplier`.
Nếu admin nhập sai ngày → không có cách sửa lại → phải xóa + tạo lại (nguy hiểm nếu đã bán).

**Cần thêm**: Cho phép sửa `receiptDate` qua `updateReceiptMeta` (chỉ khi chưa có lô nào đã bán).

---

#### 📊 Tóm tắt mức độ rủi ro

| Thành phần | Ảnh hưởng | Điều kiện | Giải pháp |
|---|---|---|---|
| `variant.costPrice` | ✅ Không | — | Không cần làm gì |
| `variant.stockQty` | ✅ Không | — | Không cần làm gì |
| `batch.expiryDate` | ⚠️ Trung bình | Khi `expiryDays > 0` và không có `expiryDateOverride` | Tính từ `receiptDate` thay vì `now()` |
| FEFO thứ tự lô | ⚠️ Trung bình | Kế thừa từ lỗi `expiryDate` | Fix từ mục trên |
| Báo cáo tồn kho kỳ | ✅ Tự đúng | Khi `receiptDate` đúng | Đây là lý do chính cần tính năng |
| Báo cáo doanh thu | ✅ Không | — | Không cần làm gì |
| Sửa ngày sau khi tạo | ⚠️ Thiếu | Khi nhập sai ngày | Thêm vào `updateReceiptMeta` |

---

#### 🔧 Các file cần thay đổi khi triển khai

**Backend** (4 file):

| File | Thay đổi |
|---|---|
| `InventoryReceiptRequest.java` | Thêm field `LocalDateTime receiptDate` (optional, null → now()) |
| `InventoryReceiptService.java` | (1) Dùng `req.receiptDate()` nếu hợp lệ; (2) Tính `expiryDate` từ `receiptDate` thay vì `now()` |
| `ExcelReceiptImportService.java` | Nhận thêm param `LocalDateTime receiptDate`, dùng tương tự |
| `ReceiptMetaUpdateRequest.java` | Thêm field `LocalDateTime receiptDate` (optional) |
| `InventoryReceiptService.updateReceiptMeta()` | Cho phép sửa `receiptDate` nếu không null |

**Frontend** (3 file):

| File | Thay đổi |
|---|---|
| `ReceiptsPage.jsx` — `ReceiptForm` | Thêm input `type="date"` với `max={today}`, default = hôm nay |
| `ReceiptsPage.jsx` — `ImportReceiptExcelForm` | Thêm tương tự |
| `receiptService.js` | Truyền `receiptDate` trong payload |

**Không cần migration DB** — cột `receipt_date` đã tồn tại.

---

#### ✅ Acceptance Criteria
- [x] Form tạo phiếu nhập có ô "Ngày nhập" — mặc định = hôm nay
- [x] Cho phép chọn ngày ≤ hôm nay, không cho chọn ngày tương lai (`max={today}`)
- [x] Cảnh báo khi chọn ngày quá khứ: nhắc điền Ngày HSD để FEFO chính xác
- [x] `expiryDate` của batch tính từ `receiptDate` (không phải `now()`), khi không có `expiryDateOverride`
- [x] Báo cáo tồn kho kỳ phản ánh đúng khi nhập phiếu ngày quá khứ
- [x] Có thể sửa `receiptDate` qua PATCH meta (validate không tương lai)
- [x] Form import Excel cũng hỗ trợ chọn ngày
- [x] Backward compatible: không truyền ngày → vẫn dùng `now()`

#### 🔧 Đã fix tại
| File | Thay đổi |
|---|---|
| `InventoryReceiptRequest.java` | Thêm field `LocalDateTime receiptDate` (optional) |
| `ReceiptMetaUpdateRequest.java` | Thêm field `LocalDateTime receiptDate` (optional) |
| `InventoryReceiptService.createReceipt()` | Dùng `req.receiptDate()` nếu hợp lệ; tính `expiryDate` từ `receiptDate` |
| `InventoryReceiptService.updateReceiptMeta()` | Cho phép sửa `receiptDate`, validate không tương lai |
| `ExcelReceiptImportService.importReceiptFromExcel()` | Thêm param `receiptDate`; tính `expiryDate` từ `finalReceiptDate` |
| `InventoryReceiptController.java` | Thêm `@RequestParam receiptDate` (optional) vào `/import-excel` |
| `receiptService.js` | Thêm `receiptDate` vào `importExcel()` |
| `ReceiptsPage.jsx` — `ReceiptForm` | Thêm state + input date + truyền vào payload |
| `ReceiptsPage.jsx` — `ImportReceiptExcelForm` | Thêm state + input date + truyền vào `importExcel` |

---

### Issue 24 — Import Excel: lỗi `importUnit` không khớp bị bypass Pass 1

#### 🐛 Triệu chứng (từ ảnh lỗi thực tế)

API trả về **422 với 32 lỗi** dạng:
```
❌ Dòng 14 [SP Don]: Variant 'COMCHAYLONCHABONG' có importUnit='Cái', Excel nhập='Bịch' — không khớp.
❌ Dòng 25 [SP Don]: Variant 'MUOIVOTRI' có importUnit='Hủ', Excel nhập='Kg' — không khớp.
❌ Dòng 50 [SP Don]: Variant 'BTXIKETOI' có importUnit='Bịch', Excel nhập='Kg' — không khớp.
...
```

**Điều kỳ lạ**: Đây là lỗi Pass 1 trả về đúng — nhưng tại sao các lỗi này lại **bị bỏ qua khi preview**
(`/api/receipts/preview-excel`) mà chỉ xuất hiện lúc import thật (`/api/receipts/import-excel`)?

---

#### 🔍 Root Cause — 2 code path khác nhau giữa Preview và Import

**Vấn đề cốt lõi**: `previewExcel()` và `importReceiptFromExcel()` dùng **2 code path TÁCH BIỆT**
để validate — logic validate importUnit chỉ nằm trong `importReceiptFromExcel()` (Pass 1 thật),
**KHÔNG có trong** `previewExcel()`.

```
previewExcel()  →  parseSingleSheet()
                     → validate cơ bản: mã SP, qty, giá, chiết khấu
                     → ❌ KHÔNG check importUnit khớp DB
                     → ❌ KHÔNG check variant.active
                     → ❌ KHÔNG check importUnit của variant_code cụ thể
                     → Trả về isValid=true cho user thấy "✅ Hợp lệ"

importReceiptFromExcel()  →  Pass 1 (inline trong method)
                              → validate cơ bản ✅
                              → check importUnit khớp DB ✅  ← CHỈ CÓ Ở ĐÂY
                              → check variant_code + importUnit ✅
                              → throw ExcelImportValidationException nếu có lỗi
```

---

#### 🔬 Phân tích chi tiết từng trường hợp lỗi

**Case A — Có `variant_code` (NEW format, cột B)** — `importReceiptFromExcel()` dòng ~660:
```java
boolean isLegacy = ev.getImportUnit() == null || ev.getImportUnit().isBlank();
if (!isLegacy && passImportUnit != null
        && !passImportUnit.equalsIgnoreCase(ev.getImportUnit())) {
    errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '" + variantCode
        + "' có importUnit='" + ev.getImportUnit()
        + "', Excel nhập='" + passImportUnit + "' — không khớp.");
    continue;  // ← đúng: reject dòng này
}
```
→ Logic này **ĐÚNG** nhưng chỉ có trong `importReceiptFromExcel()`, không có trong `parseSingleSheet()`.

**Case B — Không có `variant_code` (OLD format / bỏ trống cột B)** — `importReceiptFromExcel()` dòng ~644:
```java
boolean isLegacy = matchedVar != null
    && (matchedVar.getImportUnit() == null || matchedVar.getImportUnit().isBlank());
if (!isLegacy && matchedVar != null && passImportUnit != null
        && !passImportUnit.equalsIgnoreCase(matchedVar.getImportUnit())) {
    passImportUnit = null; passSellUnit = null; passPieces = null;
    // ← KHÔNG error! Chỉ silently clear importUnit → chấp nhận dòng này
}
```
→ **Logic SAI**: khi importUnit không khớp mà không có `variant_code`, code **silently drop** thông tin
đơn vị rồi vẫn nhập kho với variant mặc định — không báo lỗi, không warning rõ ràng.

---

#### ⚠️ Tóm tắt 2 lỗi cần fix

| # | Lỗi | Nơi xảy ra | Mức độ |
|---|---|---|---|
| **A** | `previewExcel()` không validate importUnit → user thấy "OK" nhưng import thật thì fail | `parseSingleSheet()` | 🔴 Cao — UX tệ, phải upload lại 2 lần |
| **B** | Khi không có `variant_code`, importUnit không khớp bị silently ignore thay vì báo lỗi hoặc warning rõ | `importReceiptFromExcel()` ~line 644 | 🟡 Trung bình — dữ liệu kho sai thầm lặng |

---

#### 🔧 Fix cần làm

**Fix A — Đồng bộ validate vào `parseSingleSheet()`** (preview):

Hiện tại `parseSingleSheet()` validate cơ bản. Cần bổ sung:
```java
// Sau khi xác định product tồn tại:
if (variantCode != null && !variantCode.isBlank()) {
    // Tìm variant theo code
    var varOpt = variantRepo.findByVariantCodeIgnoreCase(variantCode);
    if (varOpt.isPresent()) {
        ProductVariant ev = varOpt.get();
        boolean legacy = ev.getImportUnit() == null || ev.getImportUnit().isBlank();
        if (!legacy && importUnit != null
                && !importUnit.equalsIgnoreCase(ev.getImportUnit())) {
            errorMsg = "Variant '" + variantCode + "' có importUnit='"
                + ev.getImportUnit() + "', Excel nhập='" + importUnit + "' — không khớp.";
        }
    }
    // Nếu variant chưa tồn tại → sẽ tạo mới (OK, không lỗi)
} else {
    // Không có variant_code → smart-match
    // Nếu không khớp bất kỳ variant nào → warning thay vì silent drop
}
```

**Fix B — Không silently drop khi importUnit không khớp** (import):

Thay vì:
```java
// Dòng ~644: khi không có variantCode và importUnit không khớp
passImportUnit = null; passSellUnit = null; passPieces = null; // ← silent
```

Sửa thành:
```java
// Thêm warning rõ ràng để admin biết:
warnings.add("⚠️ Dòng " + lineNum + ": importUnit Excel='" + passImportUnit
    + "' không khớp variant '" + matchedVar.getVariantCode()
    + "' (DB='" + matchedVar.getImportUnit() + "') → bỏ qua importUnit Excel, dùng DB.");
passImportUnit = null; passSellUnit = null; passPieces = null;
```

Hoặc **reject luôn** (nghiêm ngặt hơn, tránh nhập sai đơn vị):
```java
errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '"
    + matchedVar.getVariantCode() + "' có importUnit='"
    + matchedVar.getImportUnit() + "', Excel nhập='" + passImportUnit
    + "' — không khớp. Sửa Excel hoặc điền variant_code đúng.");
continue;
```

---

#### 🔧 Các file cần thay đổi

| File | Thay đổi |
|---|---|
| `ExcelReceiptImportService.java` | **Fix A**: bổ sung validate importUnit vào `parseSingleSheet()` |
| `ExcelReceiptImportService.java` | **Fix B**: thay silent drop bằng warning rõ hoặc reject |

**Không cần thay đổi FE, DB, hay migration.**

---

#### ✅ Acceptance Criteria
- [x] Preview Excel báo lỗi importUnit không khớp ngay từ đầu (trước khi import)
- [x] Không còn tình trạng preview "OK" nhưng import thật lại fail
- [x] Khi không có `variant_code`, importUnit không khớp trả về error rõ ràng (không silent drop)
- [x] Các lỗi trong ảnh (32 lỗi) sẽ xuất hiện ngay ở bước preview

#### 🔧 Đã fix tại
- `ExcelReceiptImportService.parseSingleSheet()` — thêm validate variant_code + importUnit khớp DB (Fix A)
- `ExcelReceiptImportService.importReceiptFromExcel()` Pass 1 ~line 703 — thay silent drop bằng `errors.add()` + `continue` (Fix B)

---


- Entity `SupplierReturn` + items
- `POST /api/receipts/{id}/return`
- Trừ `variant.stockQty` + `batch.remainingQty`
- UI: nút "↩️ Trả hàng" trong chi tiết phiếu nhập

### Báo cáo lọc HĐ theo status
- Hiện tại báo cáo doanh thu vẫn đang tính cả HĐ CANCELLED
- Cần thêm `WHERE status = 'COMPLETED'` vào revenue queries

---

## 🔧 Patterns chuẩn

### Input tiền tệ (không spinner)
```jsx
<input type="text" inputMode="numeric"
  value={val === 0 || val === '' ? '' : Number(val).toLocaleString('vi-VN')}
  onChange={e => {
    const raw = e.target.value.replace(/\./g,'').replace(/,/g,'')
    if (raw===''||/^\d+$/.test(raw)) setState(raw===''?0:Number(raw))
  }}
/>
```

### Xóa vs Hủy hóa đơn
| Action | Khi nào | Kết quả |
|---|---|---|
| 🗑️ Xóa | Chỉ HĐ **hôm nay** | Xóa vật lý khỏi DB, hoàn kho |
| 🚫 Hủy | Bất kỳ HĐ nào | CANCELLED trong DB, hoàn kho, còn lịch sử |
