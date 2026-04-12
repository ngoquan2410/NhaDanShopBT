# 🛠️ TODO — Fix Issues NhaDanShop UI

> Cập nhật: 12/04/2026 | **Trạng thái: 22/22 issues ✅ hoàn thành**

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

### Phiếu trả hàng NCC (Return to Supplier)
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
