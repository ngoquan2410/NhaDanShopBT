# 🛠️ TODO — Fix Issues NhaDanShop UI

> Cập nhật: 11/04/2026 | **Trạng thái: 15/15 issues ✅ hoàn thành**

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
