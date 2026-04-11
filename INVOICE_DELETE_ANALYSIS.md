# 📋 Phân tích: Xóa Hóa Đơn — KiotViet vs NhaDanShop

> Ngày: 11/04/2026

---

## 1. KiotViet có cho xóa hóa đơn không?

### ✅ Có — nhưng rất hạn chế và có điều kiện

| Tình huống | KiotViet |
|---|---|
| Hóa đơn vừa tạo (trong ca bán) | ✅ Cho xóa / hủy |
| Hóa đơn đã in, khách đã thanh toán | ⚠️ Chỉ Admin mới xóa được, cần xác nhận 2 bước |
| Hóa đơn đã qua ngày / qua kỳ kế toán | ❌ Không cho xóa — chỉ cho tạo phiếu trả hàng |
| Hóa đơn có liên kết đổi trả | ❌ Không cho xóa |

### Cách KiotViet xử lý "hủy hóa đơn":
- **Không xóa vật lý (hard delete)** khỏi DB
- **Đánh trạng thái `CANCELLED`** → hóa đơn vẫn còn trong lịch sử
- **Tạo bút toán đảo ngược**: cộng lại tồn kho, ghi nhận doanh thu âm
- **Audit trail**: ghi lại ai hủy, lúc nào, lý do
- Báo cáo vẫn thấy hóa đơn bị hủy — không mất lịch sử

---

## 2. NhaDanShop hiện tại xử lý xóa hóa đơn như thế nào?

### Code hiện tại (`InvoiceService.deleteInvoice`):

```java
@Transactional
public void deleteInvoice(Long id) {
    SalesInvoice inv = invoiceRepo.findById(id)...
    for (SalesInvoiceItem item : inv.getItems()) {
        // 1. Cộng lại stockQty của variant
        item.getVariant().setStockQty(item.getVariant().getStockQty() + item.getQuantity());
        variantRepo.save(item.getVariant());
        // 2. Khôi phục remainingQty trong batch (FEFO restore)
        batchService.restoreStockOnCancel(item.getProduct().getId(), variantId, item.getQuantity());
    }
    // 3. XÓA VĨNH VIỄN khỏi DB
    invoiceRepo.delete(inv);
    // 4. Refresh combo virtual stock
    comboService.refreshCombosContaining(...);
}
```

### Điểm tốt ✅:
- Cộng lại `variant.stockQty` đúng
- Restore `batch.remainingQty` theo FEFO
- Refresh combo stock

---

## 3. Vấn đề nghiêm trọng khi xóa hóa đơn (Hard Delete)

### 🔴 Vấn đề 1: Mất lịch sử doanh thu vĩnh viễn
- Xóa hóa đơn → xóa luôn `SalesInvoice` + `SalesInvoiceItem` khỏi DB
- Báo cáo doanh thu theo ngày/tháng **bị thay đổi ngược về quá khứ**
- Không thể audit: "Hóa đơn INV-20260401-00001 đâu rồi?"
- Khách hàng kiện → không có bằng chứng

### 🔴 Vấn đề 2: Restore batch không chính xác (Bug tiềm ẩn)
```java
// restoreStockOnCancel lấy batch ĐANG CÒN HÀNG hoặc batch đầu tiên
ProductBatch target = batches.stream()
    .filter(b -> !b.isExpired())
    .findFirst()
    .orElse(batches.get(0));
target.setRemainingQty(target.getRemainingQty() + qty);
```
**Vấn đề**: Khi bán, FEFO deduct từ lô **cũ nhất** (sắp hết hạn). Nhưng khi restore, nó cộng vào lô **đầu tiên không expired** — có thể là lô **mới hơn**. → Dữ liệu lô hàng bị sai.

### 🔴 Vấn đề 3: Lợi nhuận báo cáo bị ảnh hưởng
- `SalesInvoiceItem.unitCostSnapshot` lưu giá vốn FEFO tại thời điểm bán
- Xóa hóa đơn → xóa luôn snapshot này
- Báo cáo lợi nhuận kỳ trước **bị thay đổi** — vi phạm nguyên tắc kế toán

### 🔴 Vấn đề 4: Không giới hạn ai được xóa, khi nào
- Hiện tại `DELETE /api/invoices/{id}` — bất kỳ user có role ADMIN đều xóa được
- Không có kiểm tra thời gian (hóa đơn hôm qua, tuần trước đều xóa được)
- Không có xác nhận 2 bước
- Không có audit log

### 🟡 Vấn đề 5: Điểm tích lũy khách hàng (nếu có)
- Nếu hệ thống sau này thêm loyalty points → xóa hóa đơn không tự động trừ điểm

---

## 4. So sánh Hard Delete vs Soft Delete (Cancel)

| Tiêu chí | Hard Delete (hiện tại) | Soft Cancel (nên làm) |
|---|---|---|
| Lịch sử hóa đơn | ❌ Mất vĩnh viễn | ✅ Còn nguyên, đánh CANCELLED |
| Báo cáo doanh thu | ❌ Bị thay đổi ngược quá khứ | ✅ Hiện doanh thu âm / ghi chú hủy |
| Audit trail | ❌ Không có | ✅ Ghi ai/khi nào/lý do |
| Tồn kho | ✅ Cộng lại | ✅ Cộng lại |
| Batch FEFO | ⚠️ Restore không chính xác | ✅ Có thể fix chính xác |
| Phức tạp kỹ thuật | Đơn giản | Phức tạp hơn một chút |

---

## 5. Đề xuất: Nên làm gì cho NhaDanShop?

### Phương án A — Giữ Hard Delete nhưng thêm bảo vệ (Dễ làm, ~2h)
Phù hợp với shop nhỏ, không cần audit nghiêm ngặt.

**Thay đổi**:
1. Chỉ cho xóa hóa đơn **trong ngày** (invoiceDate = today)
2. Yêu cầu xác nhận với lý do
3. Ghi log ra file/console khi xóa

```java
// Backend kiểm tra
if (!inv.getInvoiceDate().toLocalDate().equals(LocalDate.now())) {
    throw new IllegalStateException(
        "Chỉ được xóa hóa đơn trong ngày. " +
        "Hóa đơn cũ hơn 1 ngày cần tạo phiếu đổi trả thay thế.");
}
```

### Phương án B — Soft Delete / Cancel (Chuẩn, ~1 ngày)
Phù hợp nếu muốn chuẩn hóa như KiotViet.

**Thay đổi Backend**:
- Thêm field `status ENUM('COMPLETED', 'CANCELLED')` vào `SalesInvoice`
- Thêm fields `cancelledAt`, `cancelledBy`, `cancelReason`
- `DELETE /api/invoices/{id}` → đổi thành `PATCH /api/invoices/{id}/cancel`
- Báo cáo filter `WHERE status = 'COMPLETED'`

**Thay đổi Frontend**:
- Nút "Xóa" → đổi thành "🚫 Hủy hóa đơn"
- Modal xác nhận + nhập lý do hủy
- Hóa đơn bị hủy vẫn hiển thị trong danh sách với badge "Đã hủy"

---

## 6. Kết luận & Khuyến nghị

### Ngắn hạn (làm ngay):
> **Thêm kiểm tra `invoiceDate = today`** trước khi cho xóa — ngăn xóa hóa đơn cũ gây sai báo cáo.

### Trung hạn:
> **Migrate sang Soft Cancel** — thêm `status` field, đổi DELETE thành PATCH cancel.
> Đây là cách KiotViet, MISA, và mọi phần mềm kế toán chuyên nghiệp đều làm.

### Không nên:
> ❌ Không cho phép xóa hóa đơn đã qua ngày mà không có audit trail.
> ❌ Không để FEFO restore logic thiếu chính xác như hiện tại khi restore batch.

---

## 7. Priority cho TODO_ISSUES.md

```
Issue 13 — Bảo vệ xóa hóa đơn (Ngắn hạn)         ← ƯU TIÊN CAO
Issue 14 — Soft Cancel hóa đơn (Trung hạn)        ← ƯU TIÊN TRUNG BÌNH  
Issue 15 — Fix FEFO restore batch khi hủy HĐ      ← ƯU TIÊN TRUNG BÌNH
```
