# Phân tích Gap: NhaDanShop vs KiotViet — Toàn bộ hệ thống

> **Mục đích:** So sánh thiết kế hiện tại của NhaDanShop với KiotViet,
> liệt kê đầy đủ những gì **đã có**, **thiếu**, và **cần làm** để đạt mức
> tương đương một phần mềm quản lý bán lẻ chuyên nghiệp.
>
> **Ngày phân tích:** 04/04/2026
> **Phiên bản DB hiện tại:** V24

---

## PHẦN 1 — HIỂU THIẾT KẾ KIOTVIET

KiotViet được xây dựng xung quanh **5 trụ cột** chính:

```
1. DANH MỤC SẢN PHẨM     → Product + Variant + Attribute + Unit
2. KHO HÀNG               → Warehouse + Batch (FEFO) + Transfer + Adjustment
3. BÁN HÀNG               → Invoice + Order + Customer + Loyalty
4. MUA HÀNG (NHẬP KHO)    → PurchaseOrder + Supplier + Receipt
5. BÁO CÁO                → Revenue + Profit + Stock + Employee
```

---

## PHẦN 2 — SO SÁNH CHI TIẾT TỪNG MODULE

---

### MODULE 1: SẢN PHẨM (Product)

#### KiotViet có:
| Tính năng | Mô tả |
|-----------|-------|
| Product (SP gốc) | Thương hiệu/tên hàng gốc |
| ProductVariant | Biến thể: size/màu/đóng gói — mỗi variant có mã riêng, giá riêng, tồn kho riêng |
| Attribute | Thuộc tính SP: màu sắc, kích cỡ, trọng lượng |
| Unit + UnitConversion | Bộ đơn vị: 1 thùng = 24 hộp = 48 gói. Mua theo thùng, bán theo gói |
| Price List | Bảng giá theo nhóm khách hàng: khách lẻ/sỉ/đại lý |
| Barcode | Mỗi variant có barcode riêng |
| Image Gallery | Nhiều ảnh/variant |
| Min Stock Warning | Cảnh báo khi tồn kho < ngưỡng tối thiểu |
| Max Stock | Tồn kho tối đa (cảnh báo nhập quá nhiều) |

#### NhaDanShop hiện có:
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Product (SP gốc) | ✅ Có | `products` table |
| ProductType (SINGLE/COMBO) | ✅ Có | |
| import_unit + pieces_per_unit | ✅ Có | V7, V20, V21 |
| product_import_units (gợi ý ĐV) | ✅ Có | V21 |
| Barcode | ✅ Có | `BarcodeLabelPrinter.jsx` |
| Image (R2/base64) | ✅ Có | Cloudflare R2 |
| Expiry warning | ✅ Có | `ExpiryWarningService` |
| ProductVariant | ⚠️ Có (V22–V24) | Schema tạo xong, nhưng có 5 lỗi thiết kế cần sửa trong Sprint 0 — xem mục 4.3 |
| Price List (giá theo nhóm KH) | ❌ Chưa có | |
| Min/Max Stock config | ❌ Chưa có | Hardcode <= 5 trong UI |
| Attribute (màu/size) | ❌ Không cần | (không phù hợp ngành thực phẩm) |

---

### MODULE 2: KHO HÀNG (Warehouse & Inventory)

#### KiotViet có:
| Tính năng | Mô tả |
|-----------|-------|
| Multi-warehouse | Nhiều kho: kho chính, kho phụ, kho hàng mẫu |
| Stock Transfer | Chuyển hàng giữa các kho |
| Stock Adjustment | Điều chỉnh tồn kho (kiểm kê, mất mát, hư hỏng) |
| Batch/Lot tracking | Theo dõi lô hàng với HSD |
| FEFO | Xuất kho theo First Expired First Out |
| Stock taking | Kiểm kê kho: nhập số thực tế, so sánh với hệ thống |
| Return to supplier | Trả hàng NCC: tạo phiếu xuất kho, cập nhật tồn |
| Return from customer | Khách trả hàng: tạo phiếu nhập kho ngược |

#### NhaDanShop hiện có:
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Single warehouse | ✅ Có (mặc định 1 kho) | |
| Batch/Lot tracking | ✅ Có | `product_batches` |
| FEFO | ✅ Có | `ProductBatchService.deductStockFEFOAndComputeCost` |
| Multi-warehouse | ❌ Chưa có | |
| Stock Transfer | ❌ Chưa có | |
| Stock Adjustment (kiểm kê) | ❌ Chưa có | Quan trọng |
| Return to supplier | ❌ Chưa có | |
| Return from customer | ❌ Chưa có | |

---

### MODULE 3: MUA HÀNG / NHẬP KHO (Purchase)

#### KiotViet có:
| Tính năng | Mô tả |
|-----------|-------|
| Supplier management | Quản lý NCC: tên, SĐT, địa chỉ, mã số thuế, lịch sử nhập |
| Purchase Order (PO) | Đặt hàng NCC trước khi nhập thực tế |
| PO → Receipt | Nhận hàng từ PO: tạo phiếu nhập từ đặt hàng |
| Partial receipt | Nhận hàng từng phần từ 1 PO |
| Purchase return | Trả hàng NCC |
| Supplier debt | Công nợ NCC: đã trả/còn nợ |
| Import template | Import Excel |

#### NhaDanShop hiện có:
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Import Excel phiếu nhập | ✅ Có | Đầy đủ, 12 cột A-L |
| Tạo phiếu nhập thủ công | ✅ Có | |
| VAT + Shipping fee | ✅ Có | Phân bổ theo tỷ lệ |
| Snapshot pieces_used | ✅ Có | V20 |
| product_import_units | ✅ Có | V21 |
| Supplier management | ❌ Chưa có | Chỉ lưu tên string |
| Purchase Order (PO) | ❌ Chưa có | |
| Supplier debt | ❌ Chưa có | |
| Purchase return | ❌ Chưa có | |

---

### MODULE 4: BÁN HÀNG (Sales)

#### KiotViet có:
| Tính năng | Mô tả |
|-----------|-------|
| POS (Point of Sale) | Giao diện thu ngân: barcode scan, giỏ hàng, thanh toán nhanh |
| Customer management | Quản lý khách hàng: tên, SĐT, địa chỉ, nhóm KH |
| Customer loyalty | Tích điểm, hạng thành viên (Bronze/Silver/Gold) |
| Customer debt | Công nợ khách hàng |
| Order management | Đặt hàng online → giao hàng |
| Delivery | Quản lý giao hàng: đơn vị vận chuyển, mã vận đơn |
| Split payment | Thanh toán nhiều hình thức: tiền mặt + chuyển khoản |
| Invoice print | In hóa đơn, hóa đơn VAT |
| Reservation | Giữ hàng trước khi thanh toán |
| Promotion engine | Giảm giá %, giảm tiền, mua X tặng Y, tặng quà |
| Voucher/Coupon | Mã giảm giá nhập tay |

#### NhaDanShop hiện có:
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Storefront (POS đơn giản) | ✅ Có | `StorefrontPage.jsx` |
| Barcode scan khi bán | ✅ Có | `BarcodeScanner.jsx` |
| PendingOrder (giữ hàng) | ✅ Có | 15 phút timeout |
| Invoice print | ✅ Có | HTML print |
| Promotion (4 loại) | ✅ Có | PERCENT/FIXED/BUY_X_GET_Y/FREE_SHIPPING |
| Line discount | ✅ Có | V16 |
| FEFO cost snapshot | ✅ Có | `unitCostSnapshot` |
| Customer management | ❌ Chưa có | Chỉ lưu tên string |
| Customer loyalty | ❌ Chưa có | |
| Customer debt | ❌ Chưa có | |
| Split payment | ❌ Chưa có | |
| Voucher/Coupon | ❌ Chưa có | |
| Return from customer | ❌ Chưa có | |
| Delivery management | ❌ Chưa có | |

---

### MODULE 5: BÁO CÁO (Reports)

#### KiotViet có:
| Báo cáo | Mô tả |
|---------|-------|
| Doanh thu | Theo ngày/tuần/tháng/năm/nhân viên/kênh |
| Lợi nhuận | Gross profit, net profit, theo SP/danh mục |
| Tồn kho | Đầu kỳ/cuối kỳ, nhập/xuất, giá trị tồn |
| Xuất nhập tồn | Chi tiết từng SP theo kỳ |
| Hàng chậm bán | SP không có giao dịch trong N ngày |
| Hàng bán chạy | Top SP theo doanh thu/sản lượng |
| Công nợ NCC | Tổng nợ, lịch sử thanh toán |
| Công nợ khách | Tổng nợ, lịch sử |
| Nhân viên | Doanh số theo nhân viên, hoa hồng |
| Thuế VAT | Tổng VAT đầu vào/đầu ra |

#### NhaDanShop hiện có:
| Báo cáo | Trạng thái | Ghi chú |
|---------|-----------|---------|
| Doanh thu theo ngày/tuần/tháng | ✅ Có | `RevenueService` |
| Doanh thu theo SP | ✅ Có | |
| Doanh thu theo danh mục | ✅ Có | |
| Lợi nhuận | ✅ Có | `ReportService` |
| Tồn kho theo kỳ | ✅ Có | `InventoryStockService` (FEFO-aware) |
| Export Excel báo cáo | ✅ Có | |
| Dashboard tổng quan | ✅ Có | `DashboardPage` |
| Hàng sắp hết hạn | ✅ Có | `ExpiryWarningService` |
| Hàng chậm bán | ❌ Chưa có | |
| Hàng bán chạy | ❌ Chưa có (chỉ doanh thu) | |
| Công nợ NCC/KH | ❌ Chưa có | |
| Báo cáo nhân viên | ❌ Chưa có | |
| Báo cáo VAT đầu vào/ra | ❌ Chưa có | |

---

### MODULE 6: NHÂN VIÊN & PHÂN QUYỀN (Staff & Permission)

#### KiotViet có:
| Tính năng | Mô tả |
|-----------|-------|
| Role-based access | ADMIN, THU_NGAN, KHO, KE_TOAN |
| Permission granular | Từng quyền: xem/thêm/sửa/xóa từng module |
| Staff activity log | Lịch sử thao tác của từng nhân viên |
| Shift management | Ca làm việc, đầu ca/cuối ca |
| Commission | Hoa hồng bán hàng theo % |

#### NhaDanShop hiện có:
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| ROLE: ADMIN / USER | ✅ Có | 2 role cơ bản |
| JWT + Refresh token | ✅ Có | V12 |
| TOTP (2FA) | ✅ Có | `TotpService` |
| Permission granular | ❌ Chưa có | Chỉ ADMIN/USER |
| Staff activity log | ❌ Chưa có | |
| Shift management | ❌ Chưa có | |

---

### MODULE 7: ĐỐI TÁC (Supplier & Customer)

#### NhaDanShop hiện có:
| Tính năng | Trạng thái |
|-----------|-----------|
| Supplier (NCC) | ❌ Chỉ lưu tên string trong phiếu nhập |
| Customer | ❌ Chỉ lưu tên string trong hóa đơn |

---

### MODULE 8: TÍCH HỢP (Integrations)

#### KiotViet có: Zalo OA, Facebook, GHN, GHTK, VNPay, MoMo, ZaloPay, Lazada, Shopee

#### NhaDanShop hiện có:
| Tích hợp | Trạng thái | Ghi chú |
|---------|-----------|---------|
| Cloudflare R2 (ảnh) | ✅ Có | |
| Thanh toán online | ❌ Chưa có | |
| Vận chuyển | ❌ Chưa có | |
| Sàn TMĐT | ❌ Chưa có | |

---

## PHẦN 3 — DANH SÁCH ĐẦY ĐỦ CẦN TRIỂN KHAI (theo độ ưu tiên)

---

### 🔴 NHÓM P0 — Nghiệp vụ cốt lõi còn thiếu (cần làm trước)

#### P0-1: Quản lý Nhà cung cấp (Supplier)
> Hiện tại chỉ lưu tên string. Cần bảng riêng.

**DB:**
- Bảng `suppliers`: id, code, name, phone, address, tax_code, note, is_active

**Backend:**
- Entity `Supplier.java`
- `SupplierRepository.java`, `SupplierService.java`, `SupplierController.java`
- DTO: `SupplierRequest.java`, `SupplierResponse.java`
- Sửa `InventoryReceipt.entity`: `supplierName` → FK `supplier_id` (nullable, giữ `supplier_name` làm snapshot)

**Frontend:**
- `SuppliersPage.jsx` — CRUD NCC
- `ReceiptsPage.jsx` — dropdown chọn NCC thay vì nhập text

**Files: 6 mới + 2 sửa**

---

#### P0-2: Quản lý Khách hàng (Customer)
> Hiện tại chỉ lưu tên string trong hóa đơn.

**DB:**
- Bảng `customers`: id, code, name, phone, address, customer_group, total_spend, debt, note, is_active

**Backend:**
- Entity `Customer.java`
- `CustomerRepository.java`, `CustomerService.java`, `CustomerController.java`
- DTO: `CustomerRequest.java`, `CustomerResponse.java`
- Sửa `SalesInvoice.entity`: thêm FK `customer_id` (nullable)

**Frontend:**
- `CustomersPage.jsx` — CRUD khách hàng, lịch sử mua hàng
- `InvoicesPage.jsx` / `StorefrontPage.jsx` — tìm kiếm + chọn khách

**Files: 6 mới + 3 sửa**

---

#### P0-3: Điều chỉnh tồn kho (Stock Adjustment)
> Không có cách nào điều chỉnh tồn kho khi kiểm kê phát hiện sai lệch.

**DB:**
- Bảng `stock_adjustments`: id, adj_no, adj_date, reason, note, created_by
- Bảng `stock_adjustment_items`: product_id, system_qty, actual_qty, diff_qty, note

**Backend:**
- Entity, Repository, Service, Controller
- Logic: khi confirm → cộng/trừ `product.stockQty` + tạo/hủy batch

**Frontend:**
- `StockAdjustmentPage.jsx`

**Files: 4 mới + 2 sửa**

---

#### P0-4: Min stock warning (Cảnh báo tồn kho tối thiểu)
> Hiện tại hardcode `<= 5` trong UI. Cần per-product config.

**DB:**
- Thêm cột `min_stock_qty INT DEFAULT 5` vào `products`

**Backend:**
- Thêm field vào `Product.java`, `ProductRequest.java`, `ProductResponse.java`
- Thêm query `findByStockQtyLessThanMinStock()` vào `ProductRepository`
- API endpoint: `GET /api/products/low-stock`

**Frontend:**
- `ProductsPage.jsx` — thêm field "Tồn tối thiểu" trong form
- `DashboardPage.jsx` — widget "Hàng sắp hết" dùng ngưỡng thực

**Files: 0 mới + 5 sửa**

---

### 🟡 NHÓM P1 — Tính năng quan trọng nên có

#### P1-1: Trả hàng từ khách (Customer Return)
> Khách trả hàng → hoàn tồn kho → tạo phiếu nhập ngược.

**DB:**
- Bảng `sales_returns`: id, return_no, invoice_id (FK), return_date, reason, note
- Bảng `sales_return_items`: product_id, quantity, refund_amount

**Backend:**
- Entity, Service, Controller
- Logic: tạo batch mới với costPrice = unitCostSnapshot lúc bán; cộng lại stockQty

**Files: 4 mới + 2 sửa**

---

#### P1-2: Trả hàng cho NCC (Supplier Return)
> Phát hiện hàng lỗi → trả NCC → trừ tồn kho.

**DB:**
- Bảng `purchase_returns`: id, return_no, receipt_id (FK), return_date, supplier_id, note
- Bảng `purchase_return_items`: product_id, quantity, unit_cost

**Files: 4 mới + 2 sửa**

---

#### P1-3: Đặt hàng NCC (Purchase Order)
> Tạo PO trước khi hàng về, khi hàng về confirm PO → tạo phiếu nhập tự động.

**DB:**
- Bảng `purchase_orders`: id, po_no, supplier_id, status (DRAFT/SENT/PARTIAL/DONE/CANCELLED), expected_date
- Bảng `purchase_order_items`: product_id, ordered_qty, received_qty, unit_cost

**Files: 4 mới + 2 sửa**

---

#### P1-4: Công nợ NCC (Supplier Debt)
> Mua hàng chưa trả tiền ngay → ghi nợ.

**DB:**
- Thêm `payment_status`, `paid_amount`, `debt_amount` vào `inventory_receipts`
- Bảng `supplier_payments`: id, supplier_id, receipt_id, amount, payment_date, method, note

**Files: 0 mới + 3 sửa**

---

#### P1-5: Thanh toán nhiều hình thức (Split Payment)
> Khách vừa tiền mặt vừa chuyển khoản.

**DB:**
- Bảng `invoice_payments`: id, invoice_id, method (CASH/TRANSFER/MOMO/ZALO), amount, reference_no

**Backend:**
- Entity, Repository, Service
- Sửa `InvoiceService` để accept list payments

**Frontend:**
- `InvoicesPage.jsx` / `StorefrontPage.jsx` — UI chọn hình thức thanh toán

**Files: 3 mới + 3 sửa**

---

#### P1-6: Product Variants (Biến thể đóng gói)
> Schema đã tạo ở V22–V24. Tuy nhiên qua đánh giá DB_DESIGN_REVIEW (04/04/2026),
> có **5 lỗi thiết kế** cần sửa trước khi dùng Variants làm nền tảng cho Sprint 1+.
> Chi tiết kỹ thuật: xem mục **4.3 Sprint 0** bên dưới.

### ❓ Tại sao Product Variants không có trong sprint plan?

**Lý do 1 — Nó là FOUNDATION, không phải Feature**

Product Variants không phải 1 tính năng thêm vào — nó là **thay đổi kiến trúc cốt lõi**
ảnh hưởng đến TOÀN BỘ hệ thống:

```
Không có Variants:                  Có Variants:
  product_id → product                product_id → product → variants
  batch.product_id                    batch.variant_id
  receipt_item.product_id             receipt_item.variant_id
  invoice_item.product_id             invoice_item.variant_id
  pending_order_item.product_id       pending_order_item.variant_id
  stockQty trên product               stockQty trên variant
  costPrice trên product              costPrice trên variant
  sellPrice trên product              sellPrice trên variant
```

→ **Nếu làm Variants SAU KHI đã làm Supplier, Customer, Return, PO** thì sẽ
phải sửa lại tất cả những module đó một lần nữa để thay `product_id` → `variant_id`.
**Chi phí x2.**

**Lý do 2 — Nó phải làm TRƯỚC hoặc KHÔNG làm**

```
Nếu quyết định LÀM Variants:
  → Phải làm NGAY BÂY GIỜ, trước tất cả P0/P1 khác
  → Vì mọi module sau (Supplier, Customer, Return...) đều cần biết
    "product hay variant" ngay từ đầu thiết kế
  → ~12 ngày, ~46 files (Variants) + ~4 files (5 DB fixes) = ~50 files

Nếu quyết định KHÔNG LÀM Variants:
  → Dùng workaround: 2 mã SP riêng (ABC-HU100, ABC-GOI50)
  → Làm P0/P1 bình thường, không cần lo
  → Tổng thời gian P0+P1: ~6 tuần như kế hoạch

Nếu làm Variants SAU P0/P1:
  → Phải refactor lại toàn bộ P0/P1 đã làm
  → Chi phí tăng gấp đôi
  → Rủi ro regression cao
```

**Lý do 3 — Thực tế nghiệp vụ của NhaDanShop**

Đây là shop thực phẩm nhỏ. Câu hỏi thực tế:
- Shop hiện có bao nhiêu SP cần đóng gói nhiều loại (hủ + gói)?
- Nếu chỉ 2-3 SP → workaround (2 mã) đủ dùng, không cần Variants
- Nếu >10 SP có nhiều loại đóng gói → Variants thực sự cần thiết

### 📋 Quyết định cần bạn xác nhận NGAY BÂY GIỜ:

```
Option A: KHÔNG làm Variants
  → Workaround: Admin tạo 2 mã SP riêng
  → Tiếp tục Sprint 1-6 như kế hoạch
  → Tổng: ~6 tuần

Option B: LÀM Variants TRƯỚC
  → Đây là Sprint 0 (trước tất cả)
  → ~2 tuần cho Variants
  → Sau đó tiếp tục Sprint 1-6 (~6 tuần)
  → Tổng: ~8 tuần
  → Tất cả P0/P1 sau sẽ thiết kế đúng ngay từ đầu
```

> ✅ **ĐÃ QUYẾT ĐỊNH: Option B — Shop có >5 SP cần đa đóng gói → LÀM VARIANTS TRƯỚC**

**Đánh giá:** ~50 files, ~12 ngày. **Phải làm SPRINT 0 trước tất cả mọi thứ.**

---

#### P1-7: Báo cáo hàng bán chạy / chậm bán

**Backend:**
- Query: top 10 SP theo doanh số trong kỳ
- Query: SP không có giao dịch trong N ngày

**Frontend:**
- Widget trong `DashboardPage.jsx`
- Tab mới trong `RevenuePage.jsx`

**Files: 0 mới + 3 sửa**

---

### 🟢 NHÓM P2 — Nâng cao UX / Tương lai

#### P2-1: Loyalty / Tích điểm khách hàng
> Mỗi 10.000₫ = 1 điểm. Hạng Bronze/Silver/Gold.

**DB:**
- Thêm `loyalty_points`, `customer_tier` vào `customers`
- Bảng `loyalty_transactions`

**Files: 0 mới + 4 sửa**

---

#### P2-2: Voucher / Mã giảm giá
> Khách nhập mã GIAM50K → giảm 50.000₫.

**DB:**
- Bảng `vouchers`: code UNIQUE, type, value, min_order, max_uses, used_count, expires_at

**Files: 4 mới + 2 sửa**

---

#### P2-3: Nhiều kho (Multi-warehouse)
> Kho chính + kho phụ. Chuyển hàng giữa kho.

**DB:**
- Bảng `warehouses`
- Thêm `warehouse_id` vào `product_batches`, `inventory_receipt_items`
- Bảng `stock_transfers`

**Files: 5 mới + 5 sửa | Độ phức tạp: Cao**

---

#### P2-4: Báo cáo VAT đầu vào/đầu ra
> Tổng VAT nhập kho (đầu vào) và VAT bán ra.

**Backend:**
- Query aggregate từ `inventory_receipt_items.vat_allocated` (đầu vào)
- VAT bán ra: hiện chưa có field — cần thêm vào `sales_invoices`

**Files: 0 mới + 4 sửa**

---

#### P2-5: Phân quyền chi tiết (Granular Permission)
> Mỗi user có thể xem nhưng không được xóa, hoặc chỉ xem báo cáo...

**DB:**
- Bảng `permissions`: module, action (VIEW/CREATE/EDIT/DELETE)
- Bảng `role_permissions`

**Files: 4 mới + 3 sửa | Độ phức tạp: Cao**

---

#### P2-6: Activity Log (Lịch sử thao tác)
> Ai làm gì lúc mấy giờ.

**DB:**
- Bảng `activity_logs`: user_id, action, entity_type, entity_id, detail (JSON), created_at

**Backend:**
- `@Aspect` AOP để intercept các service method

**Files: 3 mới + 0 sửa**

---

#### P2-7: Tích hợp thanh toán online
> VNPay / MoMo / ZaloPay.

**Backend:**
- Webhook handler cho từng cổng
- Sửa `PendingOrderService`: confirm khi nhận callback

**Files: 3 mới + 1 sửa | Phụ thuộc vào cổng thanh toán**

---

## PHẦN 4 — TỔNG KẾT & ĐÁNH GIÁ

### 4.1 Trạng thái hiện tại của NhaDanShop

```
Đã hoàn thiện tốt (~80% core):
  ✅ Product + Batch (FEFO) + Import Excel (12 cột)
  ✅ Sales Invoice + Promotion engine (4 loại)
  ✅ PendingOrder + Barcode scan
  ✅ Revenue + Profit + Stock report + Export Excel
  ✅ JWT + TOTP (2FA) + Role ADMIN/USER
  ✅ Combo (KiotViet model)
  ✅ Snapshot pieces_used (tính tồn kho đúng mọi trường hợp)
  ✅ product_import_units (UX gợi ý ĐV)

Còn thiếu — theo thứ tự ưu tiên triển khai:
  🚀 Sprint 0: Product Variants    ← NỀN TẢNG, phải làm TRƯỚC
  🏃 Sprint 1: Supplier + Min Stock + Stock Adjustment
  🏃 Sprint 2: Customer + Top/Slow report
  🏃 Sprint 3: Supplier/Customer Debt + Return
  🏃 Sprint 4: Split Payment + Purchase Order
  🏃 Sprint 5: Loyalty + Voucher
  🐢 Sprint 6+: Multi-warehouse, VAT, Permission, Gateway
```

### 4.2 Bảng tổng hợp công việc

| Sprint | Nhóm | Tính năng | DB | BE | FE | Tổng | Ghi chú |
|--------|------|-----------|----|----|-----|------|---------|
| **S0** | **NỀN TẢNG** | **Product Variants + 5 DB Fixes (V25)** | **3** | **46** | **9** | **~50** | **✅ Làm TRƯỚC** |
| S1 | P0 | Supplier management | 1 | 5 | 2 | 8 | |
| S1 | P0 | Min stock per variant | 0 | 2 | 1 | 3 | |
| S1 | P0 | Stock adjustment | 2 | 4 | 1 | 7 | |
| S2 | P0 | Customer management | 1 | 5 | 3 | 9 | |
| S2 | P1 | Top/slow product report | 0 | 2 | 2 | 4 | |
| S3 | P1 | Supplier debt | 1 | 2 | 1 | 4 | |
| S3 | P1 | Customer return | 2 | 4 | 1 | 7 | |
| S3 | P1 | Supplier return | 2 | 4 | 1 | 7 | |
| S4 | P1 | Split payment | 1 | 3 | 2 | 6 | |
| S4 | P1 | Purchase Order (PO) | 2 | 4 | 2 | 8 | |
| S5 | P2 | Customer loyalty | 1 | 3 | 2 | 6 | |
| S5 | P2 | Voucher / Mã giảm giá | 1 | 3 | 2 | 6 | |
| S6+ | P2 | Multi-warehouse | 3 | 8 | 3 | 14 | Tùy nhu cầu |
| S6+ | P2 | VAT report | 0 | 2 | 1 | 3 | |
| S6+ | P2 | Granular permission | 2 | 5 | 3 | 10 | |
| S6+ | P2 | Activity log | 1 | 2 | 0 | 3 | |
| S6+ | P2 | Payment gateway | 0 | 3 | 1 | 4 | |
| **TỔNG S0→S5** | | | **21** | **78** | **32** | **~128** | ~8 tuần |

### 4.3 Kế hoạch Sprint CHÍNH THỨC (Option B — Variants trước)

> ✅ **Đã xác nhận: Shop có >5 SP cần đa đóng gói → Option B**

---

#### 🚀 SPRINT 0 — Product Variants (Nền tảng kiến trúc)
**Thời gian: ~2 tuần | ~50 files**
**Trạng thái: ✅ HOÀN THÀNH** _(cập nhật 07/04/2026)_

##### Checklist Sprint 0:

| Hạng mục | Trạng thái | Ghi chú |
|----------|-----------|---------|
| **DB** | | |
| V22 — CREATE TABLE product_variants | ✅ Done | 18 cột đầy đủ |
| V23 — Backfill variant_id vào 4 bảng GD | ✅ Done | 100% rows có variant_id |
| V24 — Fix orphan variants | ✅ Done | |
| V25 — Fix #1 Dual source of truth (comment deprecated) | ✅ Done | product.sell_price marked deprecated |
| V25 — Fix #3 Drop uq_invoice_variant | ✅ Done | Constraint đã bỏ |
| V25 — Fix #4 product_batches.variant_id NOT NULL | ✅ Done | variant_id=NOT NULL, product_id=NULLABLE |
| V25 — Fix #5 COMBO default variant | ⚠️ Partial | CBM001 vẫn chưa có variant (chưa được tạo variant từ UI) |
| **BE** | | |
| ProductVariant entity | ✅ Done | |
| ProductVariantRepository | ✅ Done | Đủ queries FEFO, avg cost, low stock |
| ProductVariantService | ✅ Done | CRUD + createDefaultVariantFromProduct |
| ProductVariantRequest/Response DTO | ✅ Done | |
| Fix #2 variant_code namespace validation | ✅ Done | validateVariantCodeNamespace() |
| Fix #4 FEFO chỉ dùng variant_id | ✅ Done | findByVariantIdForUpdateFEFO |
| Fix #5 COMBO tạo variant khi tạo SP | ✅ Done | ProductService + ProductVariantService guard đã bỏ |
| ExcelReceiptImportService (13-col + variant logic) | ✅ Done | Pass1+Pass2, smart-match, create variant mới |
| InventoryStockService (report theo variant) | ✅ Done | openingStock + closingValue = avgCostPrice × qty |
| ProductBatchService (FEFO expired fix) | ✅ Done | expiryDate > CURRENT_DATE |
| ReportService (lợi nhuận theo variant) | ✅ Done | |
| InvoiceService (deduct FEFO theo variant) | ✅ Done | unitCostSnapshot |
| PendingOrderService (giữ chỗ theo variant) | ✅ Done | |
| **FE** | | |
| ProductsPage.jsx — tạo SP + variant ngay khi tạo (SINGLE + COMBO) | ✅ Done | |
| ReceiptsPage.jsx — chọn variant khi nhập hàng | ✅ Done | |
| InvoicesPage.jsx — chọn variant khi bán | ✅ Done | |
| StorefrontPage.jsx — hiển thị variant | ✅ Done | |
| InventoryReportPage.jsx — báo cáo theo variant + date validation | ✅ Done | toDate ≤ today, toDate ≥ fromDate |

##### Issues phát hiện trong Sprint 0 (đã fix):
- ✅ `closingValue` tồn kho không đổi theo kỳ → fix: dùng `avgCostPrice × closingStock`
- ✅ FEFO deduct batch đã hết hạn → fix: thêm `expiryDate > CURRENT_DATE`
- ✅ COMBO guard block variant tạo → fix: xóa guard trong ProductVariantService
- ✅ ExcelImport không xử lý COMBO như SINGLE → fix: bỏ COMBO expand block
- ✅ InventoryReportPage không validate toDate > today → fix: thêm validation FE+BE

##### Còn 1 item tồn đọng:
- ⚠️ **CBM001** (COMBO) chưa có variant vì chưa được tạo lại từ UI sau khi fix. Admin cần tạo lại hoặc chạy migration tạo default variant cho CBM001.

---

#### 🏃 SPRINT 1 — Nền tảng đối tác + Tồn kho
**Thời gian: ~1.5 tuần | ~25 files**
**Trạng thái: 🔴 CHƯA BẮT ĐẦU**

```
P0-4: Min stock per variant (3 files)
  - min_stock_qty đã có trên product_variants ✅ (đã implement trong Sprint 0)
  - API GET /api/variants/low-stock → kiểm tra
  - Dashboard widget dùng ngưỡng thực

P0-1: Supplier management (8 files)
  - Bảng suppliers (id, code, name, phone, address, tax_code)
  - Entity, Repository, Service, Controller
  - DTO: SupplierRequest, SupplierResponse
  - ReceiptsPage: dropdown chọn NCC

P0-3: Stock Adjustment (7 files — chỉ logic cơ bản)
  - Bảng stock_adjustments + stock_adjustment_items
  - Entity, Service, Controller
  - StockAdjustmentPage.jsx
  - Logic: confirm → cộng/trừ variant.stockQty + tạo/hủy batch
  - reason: EXPIRED / DAMAGED / LOST / STOCKTAKE / OTHER

P1-EXPIRY: expiryDate override khi nhập kho (3 files) ← MỚI THÊM
  - Vấn đề hiện tại: expiryDate = importDate + variant.expiryDays (tự tính)
    → Không phản ánh đúng ngày HSD thực tế in trên bao bì
    → KiotViet cho phép admin nhập tay ngày HSD từng lô
  - Giải pháp:
    DB:
      ALTER TABLE inventory_receipt_items
        ADD COLUMN expiry_date_override DATE NULL;
      -- Nếu có giá trị → dùng ngày này thay vì tính tự động
    BE:
      ~ InventoryReceiptService.java
        expiryDate = itemReq.expiryDateOverride() != null
            ? itemReq.expiryDateOverride()
            : (variant.getExpiryDays() > 0 ? now + expiryDays : now + 10years)
      ~ ExcelReceiptImportService.java — tương tự, đọc từ cột Excel (cột N mới)
      ~ InventoryReceiptItemRequest.java — thêm field expiryDateOverride
    FE:
      ~ ReceiptsPage.jsx — thêm field "Ngày HSD thực tế" khi thêm item
      Excel template: thêm cột N: "Ngày HSD (ghi đè)" — optional
  - Files: 1 DB migration (V26) + 3 BE sửa + 1 FE sửa = 5 files
```

---

---

##### 🔴 SPRINT 0 — PHẦN A: Sửa 5 lỗi thiết kế DB (DB_DESIGN_REVIEW fixes)

> **Nguồn:** DB_DESIGN_REVIEW.md — đánh giá ngày 04/04/2026
> **Ưu tiên:** Phải hoàn thành **trước** khi implement bất kỳ tính năng variant nào.

---

**Fix #1 — [NGUY HIỂM 🔴] Hai nguồn truth cho giá và tồn kho**

*Vấn đề:* Bảng `products` vẫn giữ `sell_price, cost_price, stock_quantity,
sell_unit, import_unit, pieces_per_import_unit` song song với `product_variants`.
Không rõ bảng nào là master → risk inconsistency khi cập nhật giá.

*Giải pháp:*
- Xác định `product_variants` là **master duy nhất** cho giá, tồn, đơn vị
- Deprecate (và về sau drop) các cột tương ứng trong `products`
- Mọi service/controller đọc/ghi giá và tồn **chỉ qua `product_variants`**

```
DB (V25):
  -- Đánh dấu deprecated (giữ NULL-able để backward compat, không drop ngay)
  COMMENT ON COLUMN products.sell_price    IS 'DEPRECATED — use product_variants.sell_price';
  COMMENT ON COLUMN products.cost_price    IS 'DEPRECATED — use product_variants.cost_price';
  COMMENT ON COLUMN products.stock_quantity IS 'DEPRECATED — use product_variants.stock_qty';

Backend:
  ~ ProductService.java           — đọc/ghi giá & tồn qua variant, không qua product
  ~ ProductRequest/Response.java  — price/stock fields map sang default variant
  ~ InventoryReceiptService.java  — cập nhật variant.cost_price (không còn product.cost_price)
  ~ InvoiceService.java           — deduct variant.stock_qty (không còn product.stock_quantity)
```

*Files ảnh hưởng: 1 SQL + 4 BE*

---

**Fix #2 — [SAI THIẾT KẾ 🔴] `variant_code = product.code` — Namespace trùng lặp**

*Vấn đề:* V23 backfill `variant_code = product.code` cho default variant.
Kết quả: `products.code = "MUOI-ABC"` và `product_variants.variant_code = "MUOI-ABC"`
cùng tồn tại → scan barcode không biết tra bảng nào → V24 phải vá bug orphan.

*Giải pháp:* Tách biệt 2 namespace. Convention mới:
- `products.code` = mã catalog SP gốc (dùng trong PO, quản lý nhóm)
- `product_variants.variant_code` = mã bán hàng thực tế (barcode, scan)
- Với SP chỉ có 1 variant: `variant_code = product.code + "-V1"` hoặc giữ
  nguyên = `product.code` nhưng **thêm ràng buộc unique cross-table** tại application layer

```
DB (V25):
  -- Thêm constraint ứng dụng: không cho tạo variant_code trùng product.code
  -- của product KHÁC (chỉ được trùng của chính product đó, nếu muốn)
  -- Về lâu dài: migrate variant_code sang "<product_code>-<suffix>" hoặc barcode riêng

Backend:
  ~ ProductVariantService.java  — validate variant_code không trùng product.code của SP khác
  ~ ProductService.java         — khi tạo SP mới → auto default variant_code = code + "-V1"
  ~ ExcelReceiptImportService   — lookup theo variant_code, fallback product.code chỉ khi
                                   không tìm thấy variant (backward compat)
```

*Files ảnh hưởng: 1 SQL comment + 3 BE*

---

**Fix #3 — [BUG TIỀM ẨN 🟡] `UNIQUE(invoice_id, variant_id)` trong `sales_invoice_items` quá cứng**

*Vấn đề:* Constraint `uq_invoice_variant` ngăn 1 hóa đơn có 2 dòng cùng variant.
Nhưng nghiệp vụ thực tế cần:
- Dòng hàng mua + dòng hàng tặng kèm (buy X get Y) cùng variant
- Chiết khấu theo dòng khác nhau trên cùng 1 variant

KiotViet không có constraint này — mỗi dòng invoice là độc lập.

```
DB (V25):
  ALTER TABLE sales_invoice_items
      DROP CONSTRAINT IF EXISTS uq_invoice_variant;
  -- Thay bằng index thường để query performance vẫn tốt
  CREATE INDEX IF NOT EXISTS idx_sii_invoice_variant
      ON sales_invoice_items (invoice_id, variant_id);

Backend: không cần sửa
```

*Files ảnh hưởng: 1 SQL*

---

**Fix #4 — [DƯ THỪA NGUY HIỂM 🟡] `product_batches` giữ cả `product_id` lẫn `variant_id`**

*Vấn đề:* Sau V22, `product_batches` có 2 FK:
- `product_id BIGINT NOT NULL` — cột cũ
- `variant_id BIGINT NULL` — cột mới (từ V22, backfill ở V23)

Nếu 2 FK lệch nhau (variant thuộc SP khác) → FEFO query trả kết quả sai.
Cột `product_id` thực ra là redundant vì đã có `variant.product_id`.

```
DB (V25):
  -- Bước 1: Verify toàn bộ variant_id đã backfill đúng
  -- SELECT COUNT(*) FROM product_batches WHERE variant_id IS NULL; -- phải = 0

  -- Bước 2: Đặt NOT NULL
  ALTER TABLE product_batches ALTER COLUMN variant_id SET NOT NULL;

  -- Bước 3: Xóa NOT NULL của product_id (giữ cột để backward compat tạm thời)
  ALTER TABLE product_batches ALTER COLUMN product_id DROP NOT NULL;

  -- Bước 4 (Sprint 1 sau khi ổn định): DROP COLUMN product_id

Backend:
  ~ ProductBatchService.java    — FEFO query chỉ dùng variant_id, bỏ product_id
  ~ ProductBatchRepository.java — update query signatures
```

*Files ảnh hưởng: 1 SQL + 2 BE*

---

**Fix #5 — [CODE PHỨC TẠP 🟡] COMBO products không có variant → 2 code path khi bán hàng**

*Vấn đề:* V23 chỉ tạo default variant cho `product_type = 'SINGLE'`, bỏ qua COMBO.
Kết quả: code bán hàng phải phân nhánh:
```java
if (product.isCombo()) {
    // xử lý theo product
} else {
    // xử lý theo variant
}
```
→ Phức tạp, dễ sai, khó maintain.

```
DB (V25):
  -- Tạo default variant cho COMBO products chưa có variant
  INSERT INTO product_variants (product_id, variant_code, variant_name,
      sell_unit, sell_price, cost_price, stock_qty, min_stock_qty,
      is_active, is_default, created_at, updated_at)
  SELECT p.id, p.code, p.name,
      COALESCE(p.sell_unit, p.unit, 'combo'),
      p.sell_price, p.cost_price, p.stock_quantity, 5,
      p.is_active, TRUE, NOW(), NOW()
  FROM products p
  WHERE p.product_type = 'COMBO'
    AND NOT EXISTS (
        SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
    )
  ON CONFLICT (variant_code) DO NOTHING;

Backend:
  ~ InvoiceService.java         — xóa nhánh isCombo(), xử lý uniform qua variant
  ~ PendingOrderService.java    — xóa nhánh isCombo()
  ~ ProductBatchService.java    — FEFO uniform qua variant_id
```

*Files ảnh hưởng: 1 SQL + 3 BE*

---

##### Tổng hợp Phần A — DB fixes cần migration V25

```sql
-- V25__fix_variant_design.sql  (gộp tất cả 5 fixes vào 1 migration)

-- Fix #1: Đánh dấu deprecated columns trong products
COMMENT ON COLUMN products.sell_price     IS 'DEPRECATED — master: product_variants.sell_price';
COMMENT ON COLUMN products.cost_price     IS 'DEPRECATED — master: product_variants.cost_price';
COMMENT ON COLUMN products.stock_quantity IS 'DEPRECATED — master: product_variants.stock_qty';

-- Fix #3: Bỏ unique constraint quá cứng trên sales_invoice_items
ALTER TABLE sales_invoice_items DROP CONSTRAINT IF EXISTS uq_invoice_variant;
CREATE INDEX IF NOT EXISTS idx_sii_invoice_variant ON sales_invoice_items (invoice_id, variant_id);

-- Fix #4: Enforce variant_id NOT NULL trong product_batches
ALTER TABLE product_batches ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE product_batches ALTER COLUMN product_id DROP NOT NULL;

-- Fix #5: Tạo default variant cho COMBO products
INSERT INTO product_variants (product_id, variant_code, variant_name,
    sell_unit, sell_price, cost_price, stock_qty, min_stock_qty,
    is_active, is_default, created_at, updated_at)
SELECT p.id, p.code, p.name,
    COALESCE(p.sell_unit, p.unit, 'combo'),
    p.sell_price, p.cost_price, p.stock_quantity, 5,
    p.is_active, TRUE, NOW(), NOW()
FROM products p
WHERE p.product_type = 'COMBO'
  AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id)
ON CONFLICT (variant_code) DO NOTHING;
```

| Fix | Mức độ | DB | BE | FE | Tổng |
|-----|--------|----|----|-----|------|
| #1 Dual source of truth | 🔴 | 1 | 4 | 0 | 5 |
| #2 variant_code namespace | 🔴 | 0 | 3 | 0 | 3 |
| #3 uq_invoice_variant | 🟡 | 1 | 0 | 0 | 1 |
| #4 product_batches dual FK | 🟡 | 1 | 2 | 0 | 3 |
| #5 COMBO no variant | 🟡 | 1 | 3 | 0 | 4 |
| **Tổng Phần A** | | **1** | **12** | **0** | **~16** |

---

##### 🟢 SPRINT 0 — PHẦN B: Implement Variant features (sau khi Phần A xong)

```
DB (V22–V24 đã tạo, V25 ở Phần A):
  ✅ CREATE TABLE product_variants
  ✅ UNIQUE INDEX uq_variant_default
  ✅ ADD COLUMN variant_id vào 4 bảng giao dịch
  ✅ BACKFILL variant_id
  ✅ (V25) Gộp 5 DB fixes

Backend Java (tiếp ~34 files):
  Entities (5):
    ✅ ProductVariant.java (V22)
    ~ Product.java         — đã có List<ProductVariant>, sửa getDefaultVariant()
    ~ ProductBatch.java    — sau Fix #4: chỉ dùng variant FK
    ~ InventoryReceiptItem.java — variant FK đã có
    ~ SalesInvoiceItem.java     — variant FK đã có, unique constraint đã bỏ (Fix #3)
    ~ PendingOrderItem.java     — variant FK đã có

  DTOs (9):
    + ProductVariantRequest.java  (mới)
    + ProductVariantResponse.java (mới)
    ~ ProductRequest.java         (thêm variants list)
    ~ ProductResponse.java        (thêm variants list + price từ default variant)
    ~ ReceiptItemRequest.java     (thêm variantId)
    ~ InvoiceItemRequest.java     (thêm variantId)
    ~ SalesInvoiceItemResponse.java
    ~ InventoryReceiptItemResponse.java
    ~ PendingOrderItemResponse.java

  Repositories (4):
    + ProductVariantRepository.java (mới)
    ~ ProductBatchRepository.java   (query theo variant_id, bỏ product_id — Fix #4)
    ~ InventoryReceiptRepository.java
    ~ SalesInvoiceRepository.java

  Services (11):
    ~ ProductService.java            (CRUD variant + đọc giá từ variant — Fix #1)
    ~ InventoryReceiptService.java   (resolve variant, cập nhật variant.stockQty — Fix #1)
    ~ InvoiceService.java            (deduct variant batch FEFO, xóa nhánh COMBO — Fix #5)
    ~ ProductBatchService.java       (FEFO theo variant_id, xóa product_id — Fix #4)
    ~ ExcelReceiptImportService.java (lookup variant_code, validate namespace — Fix #2)
    ~ InventoryStockService.java     (report theo variant)
    ~ ReportService.java             (lợi nhuận theo variant)
    ~ RevenueService.java            (doanh thu theo variant)
    ~ DtoMapper.java                 (map variant fields)
    ~ ExcelTemplateService.java      (thêm cột variant)
    ~ PendingOrderService.java       (giữ chỗ theo variant, xóa nhánh COMBO — Fix #5)

  Controllers (3):
    ~ ProductController.java
    ~ InventoryReceiptController.java
    ~ SalesInvoiceController.java

Frontend React (9 files):
  ~ productService.js    (getVariants, createVariant, updateVariant)
  ~ receiptService.js    (thêm variantId)
  ~ invoiceService.js    (thêm variantId)
  ~ useProducts.js       (query/mutation cho variants)
  ~ ProductsPage.jsx     (tab Biến thể, dropdown variant)
  ~ ReceiptsPage.jsx     (chọn variant khi nhập hàng)
  ~ InvoicesPage.jsx     (chọn variant khi bán)
  ~ StorefrontPage.jsx   (hiển thị variant)
  ~ InventoryReportPage.jsx (báo cáo theo variant)
```

**Kết quả sau Sprint 0 (Phần A + B):**
- ✅ 5 lỗi thiết kế DB đã được vá — `variants` là master duy nhất cho giá/tồn
- ✅ Namespace `product.code` vs `variant_code` tách biệt rõ ràng
- ✅ 1 mã SP gốc có thể có N variant: `ABC → [ABC-HU100, ABC-GOI50, ABC-KG]`
- ✅ Mỗi variant: mã riêng, giá riêng, tồn kho riêng, FEFO riêng
- ✅ COMBO products xử lý uniform qua variant (không còn 2 code path)
- ✅ Import Excel: chọn variant_code trực tiếp
- ✅ Bán hàng: chọn SP rồi chọn variant (dropdown)
- ✅ Báo cáo: xem theo SP gốc hoặc drill-down variant

---

#### 🏃 SPRINT 1 — Nền tảng đối tác + Tồn kho
**Thời gian: ~1 tuần | ~18 files**

```
P0-4: Min stock per variant (3 files)
  - Thêm min_stock_qty vào product_variants (thay vì products)
  - API GET /api/products/low-stock → dựa variant.stockQty
  - Dashboard widget dùng ngưỡng thực

P0-1: Supplier management (8 files)
  - Bảng suppliers (id, code, name, phone, address, tax_code)
  - Entity, Repository, Service, Controller
  - DTO: SupplierRequest, SupplierResponse
  - ReceiptsPage: dropdown chọn NCC

P0-3: Stock Adjustment (7 files — chỉ logic cơ bản)
  - Bảng stock_adjustments + stock_adjustment_items
  - Entity, Service, Controller
  - StockAdjustmentPage.jsx
  - Logic: confirm → cộng/trừ variant.stockQty + tạo/hủy batch
```

---

#### 🏃 SPRINT 2 — Khách hàng + Báo cáo nâng cao
**Thời gian: ~1 tuần | ~16 files**

```
P0-2: Customer management (9 files)
  - Bảng customers (id, code, name, phone, address, group)
  - Entity, Repository, Service, Controller
  - DTO: CustomerRequest, CustomerResponse
  - SalesInvoice: thêm FK customer_id
  - CustomersPage.jsx, lịch sử mua hàng
  - InvoicesPage + StorefrontPage: tìm/chọn khách

P1-7: Top/slow product report (4 files)
  - Query top 10 SP bán chạy theo kỳ (tính theo variant)
  - Query SP không có GD trong N ngày
  - Widget Dashboard + tab RevenuePage
```

---

#### 🏃 SPRINT 3 — Công nợ + Trả hàng
**Thời gian: ~1.5 tuần | ~18 files**

```
P1-4: Supplier debt (4 files)
  - Thêm payment_status, paid_amount, debt_amount vào inventory_receipts
  - Bảng supplier_payments
  - UI: tab công nợ trong SuppliersPage

P1-1: Customer return (7 files)
  - Bảng sales_returns + sales_return_items
  - Logic: hoàn variant.stockQty + tạo batch ngược
  - UI: nút "Trả hàng" từ hóa đơn

P1-2: Supplier return (7 files)
  - Bảng purchase_returns + purchase_return_items
  - Logic: trừ variant.stockQty + hủy batch
  - UI: nút "Trả NCC" từ phiếu nhập
```

---

#### 🏃 SPRINT 4 — Thanh toán + Đặt hàng
**Thời gian: ~1 tuần | ~14 files**

```
P1-5: Split payment (6 files)
  - Bảng invoice_payments (CASH/TRANSFER/MOMO/ZALO)
  - UI: chọn hình thức thanh toán khi tạo HĐ

P1-3: Purchase Order - PO (8 files)
  - Bảng purchase_orders + purchase_order_items
  - Status: DRAFT → SENT → PARTIAL → DONE
  - UI: tạo PO → confirm hàng về → tự tạo phiếu nhập
```

---

#### 🏃 SPRINT 5 — Loyalty + Voucher
**Thời gian: ~1 tuần | ~12 files**

```
P2-1: Customer Loyalty (6 files)
  - Thêm loyalty_points, tier vào customers
  - Bảng loyalty_transactions
  - Tích điểm tự động khi tạo HĐ

P2-2: Voucher / Mã giảm giá (6 files)
  - Bảng vouchers (code UNIQUE, type, value, max_uses)
  - UI: nhập mã tại StorefrontPage
```

---

#### 🏃 SPRINT 6+ — Nâng cao (tùy nhu cầu)
```
P2-3: Multi-warehouse    (~14 files)
P2-4: VAT report         (~3 files)
P2-5: Granular permission (~10 files)
P2-6: Activity log       (~3 files)
P2-7: Payment gateway    (~4 files)
```

---

### Tổng kết kế hoạch Option B

| Sprint | Nội dung | Files | Thời gian | Trạng thái |
|--------|---------|-------|----------|-----------|
| Sprint 0 | **Product Variants + 5 DB Fixes (V25)** (nền tảng) | ~50 | 2 tuần | ✅ **DONE** |
| Sprint 1 | Supplier + Min Stock + Stock Adjustment + **ExpiryDate Override** | ~25 | 1.5 tuần | 🔴 Todo |
| Sprint 2 | Customer + Top/Slow report | 16 | 1 tuần | 🔴 Todo |
| Sprint 3 | Supplier/Customer debt + Return | 18 | 1.5 tuần | 🔴 Todo |
| Sprint 4 | Split Payment + Purchase Order | 14 | 1 tuần | 🔴 Todo |
| Sprint 5 | Loyalty + Voucher | 12 | 1 tuần | 🔴 Todo |
| **Tổng P0→P1** | | **~135 files** | **~8 tuần** | |
| Sprint 6+ | Multi-warehouse, VAT, Permission... | ~34 | Tùy nhu cầu | 🔴 Todo |

> 🎯 **Sau 8 tuần:** NhaDanShop đạt ~90% tính năng cốt lõi của KiotViet
> cho phân khúc shop thực phẩm nhỏ-vừa.

---

### 4.4 Điều KHÔNG cần làm (khác với KiotViet)

| Tính năng KiotViet | Lý do bỏ qua |
|-------------------|--------------|
| Product Attributes (màu/size) | Ngành thực phẩm không cần |
| Shift management | Shop nhỏ, 1-2 người |
| Commission/Hoa hồng | Chưa cần |
| Sàn TMĐT (Lazada/Shopee) | Ngoài phạm vi |
| Franchise management | Không áp dụng |

---

*File phân tích này được tạo bởi GitHub Copilot ngày 03/04/2026.*
*Cập nhật 04/04/2026: Bổ sung Sprint 0 với 5 DB fixes từ DB_DESIGN_REVIEW.md.*
*Cập nhật 07/04/2026: Sprint 0 HOÀN THÀNH (93% — 27/29 items). Sprint 1 bổ sung tính năng ExpiryDate Override. 2 items tồn đọng: StorefrontPage variant check + ExpiryDateOverride chuyển vào Sprint 1.*

### Sprint 1 — Danh sách việc cần làm (07/04/2026)

| Task | Nội dung | Files | Ngày | Trạng thái |
|------|----------|-------|------|-----------|
| S1-1 | StorefrontPage hiển thị variant selector | 1 sửa | 0.5d | 🔴 Todo |
| S1-2 | ExpiryDate Override (V27 + 3 BE + 2 FE) | 5 | 1.5d | 🔴 Todo |
| S1-3 | Supplier Management (V28 + 6 BE mới + 4 FE) | 10 | 2d | 🔴 Todo |
| S1-4 | Stock Adjustment/Kiểm kê (V29 + 5 BE mới + 2 FE) | 9 | 2.5d | 🔴 Todo |
| S1-5 | Docs update | 1 | 0.5d | ✅ Done |
| **Tổng** | | **~26** | **~7 ngày** | |

**Thứ tự thực hiện:** S1-1 → S1-2 → S1-3 → S1-4
