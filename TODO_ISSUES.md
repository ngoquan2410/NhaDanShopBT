# 🛠️ TODO — Fix Issues NhaDanShop UI

> Ngày: 10/04/2026 | Trạng thái: Đang xử lý

---

## ✅ Đã hoàn thành

### Issue 1 — Error popup khi vào trang store
- **Nguyên nhân**: `axios.js` hardcode `baseURL = 'http://localhost:8080'` → request tới backend real IP bị chặn bởi CORS hoặc auth
- **Fix**: 
  - `StorefrontPage` gọi `/api/products`, `/api/categories`, `/api/combos/active` → tất cả cần xác thực
  - Backend route `GET /api/products` đã `permitAll()` nhưng CORS headers thiếu origin public
  - `axios.js`: bỏ fallback `localhost:8080`, luôn dùng `API_BASE = ''` (relative → Vite proxy hoặc Nginx)
  - `vite.config.js`: thêm `Cache-Control: no-store` headers
  - `SecurityConfig.java`: đọc CORS origins từ `application.properties`

### Issue 2 — Mobile UI
- **Fix**:
  - Tạo `AdminTable.jsx` component: table trên desktop, card list trên mobile
  - `AdminLayout.jsx`: thêm Bottom Navigation Bar (5 mục: Dashboard, Sản phẩm, Hóa đơn, Nhập kho, Tồn kho)
  - Refactor: `ProductsPage`, `InvoicesPage`, `ReceiptsPage`, `CategoriesPage`, `UsersPage`, `SuppliersPage`, `DashboardPage`, `ProfitReportPage`, `InventoryReportPage`, `StockAdjustmentPage`

---

## ❌ Còn phải làm

### Issue 3 — Xóa hướng dẫn không cần thiết
**Vị trí**: `ProductsPage.jsx` → `ImageUploader` component
- Xóa box "Cách thêm ảnh: Kéo thả / chọn file — upload lên Cloudflare R2..."
- Xóa text "Upload trực tiếp lên Cloudflare R2 – CDN toàn cầu"
- Giữ lại UI tối giản: chỉ còn drop zone và input URL
- Check các trang khác có hướng dẫn thừa không

**Vị trí**: `ProductsPage.jsx` → Variant form
- Xóa placeholder hint thừa "VD: 1 kg = 10 bịch 100g"  
- Giữ label ngắn gọn

**Vị trí**: `ReceiptsPage.jsx` → Import Excel modal
- Xóa hướng dẫn dài về format file Excel

---

### Issue 4 — Giá bán UI: bỏ spinner, validate nghìn đồng
**Vấn đề**: Input `type="number"` hiển thị spinner arrows (nút lên/xuống)  
**Yêu cầu**:
- Tất cả field tiền: dùng `type="text"` + `inputMode="numeric"` thay vì `type="number"`
- Format hiển thị: `1.000` (dấu chấm phân cách nghìn) thay vì `1000`
- Validate: chỉ cho nhập số nguyên, bội của 1000 (hoặc cảnh báo nếu không phải)
- Bỏ spinner arrows CSS: `[appearance:textfield]` và `[&::-webkit-inner-spin-button]:appearance-none`

**Files cần sửa**:
- `ProductsPage.jsx`: fields `sellPrice`, `costPrice`, `stockQty` (tồn kho ban đầu)
- `ReceiptsPage.jsx`: fields `unitCost`, `shippingFee`
- `PromotionsPage.jsx`: fields `minOrderValue`, `maxDiscount`, `discountValue`
- `InvoicesPage.jsx`: CK% → giữ number, nhưng price display phải đúng format

---

### Issue 5 — Thống nhất ngôn ngữ tiếng Việt
**Vấn đề**: Cột "Pieces" trong VariantManager bảng variants  
**Fix**: Đổi thành "Số lẻ/ĐV" (đã đúng trong header, cần check lại toàn bộ)

**Check list**:
- [ ] `ProductsPage.jsx` VariantManager table: cột "SL/ĐV nhập" — đã OK
- [ ] Tất cả button, label, placeholder phải là tiếng Việt
- [ ] Không còn chữ Anh lẫn lộn trong UI người dùng thấy

---

### Issue 6 — Nhập kho: lệch dòng + không cho sửa phiếu
**Vấn đề 1**: Layout `VariantReceiptRow` bị lệch trên mobile  
**Vấn đề 2**: Sau khi tạo phiếu nhập kho, hiện nút "Xóa" → nên **không có nút Sửa** (phiếu đã xác nhận không được sửa)

**Fix**:
- Ẩn nút edit/sửa trong danh sách phiếu nhập kho (đã tạo xong = immutable)
- Chỉ giữ: "Xem chi tiết" + "In nhãn" + "Xóa" (nếu cần)
- Fix layout row trong form tạo phiếu: các cột align đúng

---

### Issue 7 — Popup tạo hóa đơn thiếu giá bán
**Vấn đề**: Trong form tạo hóa đơn, mỗi dòng sản phẩm không hiển thị rõ **giá bán/đơn vị**  
**Fix**:
- Thêm hiển thị giá bán dưới tên sản phẩm: `35.000 ₫/cái`
- Khi chọn sản phẩm → auto hiển thị: `[Tên SP] | [Giá] ₫/[ĐV] | Tồn: [N]`
- Thêm column "Đơn giá" trong summary rows

---

### Issue 8 — Lệch UI
**Vấn đề**: Header page bị xuống dòng không đẹp trên mobile (ảnh pasted_image_14)  
**Fix**:
- Header `"Quản lý Sản phẩm"` + buttons bị wrap không đúng
- Dùng `flex-wrap` + `min-w-0` để truncate title thay vì wrap
- Buttons nhỏ lại trên mobile: icon only + tooltip

---

### Issue 9 — Tạo hóa đơn quá số lượng tồn: lỗi không rõ
**Vấn đề**: Cho nhập SL > tồn kho → khi submit → backend trả 409/400 → FE chỉ hiện "Lỗi tạo hóa đơn" chung chung  
**Fix**:
1. **Frontend validation**: khi `qty > stockQty` → disable nút submit + hiện cảnh báo đỏ ngay lập tức
2. **Error handling**: parse response lỗi từ backend → hiện message cụ thể: "Sản phẩm [X] chỉ còn [N] trong kho"
3. **Backend** (nếu cần): trả về message rõ ràng hơn trong response body

---

## 📋 Priority Order
1. **Issue 9** → Ưu tiên cao (ảnh hưởng nghiệp vụ)
2. **Issue 7** → Ưu tiên cao (UX)
3. **Issue 4** → Ưu tiên cao (UX + data quality)
4. **Issue 6** → Ưu tiên trung bình
5. **Issue 3** → Ưu tiên trung bình
6. **Issue 5** → Ưu tiên thấp
7. **Issue 8** → Ưu tiên thấp
