# Phân tích Giải pháp 2: Product Variants (Thuộc tính Sản phẩm)

> **Mục đích:** Cho phép 1 mã SP gốc có nhiều dạng đóng gói bán lẻ khác nhau.
> Ví dụ: Muối ABC → bán dạng hủ 100g (1kg=10hủ) VÀ bán dạng gói 50g (1kg=20gói).
>
> **Ngày phân tích:** 03/04/2026
> **Trạng thái:** Đề xuất — chờ cân nhắc triển khai

---

## 1. Vấn đề cần giải quyết

### Ví dụ thực tế

```
Nhập từ NCC: 2 kg Muối Biển ABC — giá 130.000₫ (65.000₫/kg)

Admin muốn chia ra bán 2 loại:
  Variant 1: 1 kg → 10 hủ 100g  → bán 12.000₫/hủ
  Variant 2: 1 kg → 20 gói 50g  → bán 7.000₫/gói

Phiếu nhập Excel:
  Row 1: ABC | 1 kg | 65.000 | pieces=10 | sell_unit=hủ
  Row 2: ABC | 1 kg | 65.000 | pieces=20 | sell_unit=gói
```

### Tại sao kiến trúc hiện tại không xử lý được

| Hạn chế | Lý do |
|---------|-------|
| `products.sell_unit` = 1 giá trị | Không thể vừa là "hủ" vừa là "gói" |
| `products.stock_quantity` = 1 số | Không tách được 10 hủ và 20 gói |
| `UNIQUE(receipt_id, product_id)` | Chỉ 1 dòng/SP/phiếu → gộp sai |
| `UNIQUE(invoice_id, product_id)` | Tương tự khi bán |
| `product_batches.product_id` | 1 lô chỉ thuộc 1 SP → FEFO không biết hủ hay gói |
| `product.costPrice` = 1 giá trị | costPerHủ=6.500 ≠ costPerGói=3.250 → lợi nhuận sai |

---

## 2. Thiết kế Giải pháp 2: Bảng `product_variants`

### Mô hình dữ liệu mới

```
products (SP GỐC — nguyên liệu/thương hiệu)
  id, code, name, category_id
  → KHÔNG còn: sell_unit, stock_quantity, cost_price, sell_price
     (hoặc giữ lại làm fallback/tổng hợp)

product_variants (BIẾN THỂ — từng dạng đóng gói)
  id
  product_id        FK → products
  variant_code      "ABC-HU100", "ABC-GOI50"   — mã bán hàng thực tế
  variant_name      "Muối Hủ 100g", "Muối Gói 50g"
  sell_unit         "hủ" / "gói"
  import_unit       "kg" / "xâu"
  pieces_per_unit   10   / 20
  sell_price        12.000 / 7.000
  cost_price        (cập nhật mỗi lần nhập — giá vốn/đơn vị bán lẻ)
  stock_qty         riêng từng variant
  is_active         TRUE/FALSE
  is_default        TRUE/FALSE (variant chính hiển thị mặc định)
```

### Quan hệ

```
products (1)  ──────────────── (N)  product_variants
                                        ↑
                         (1)  product_batches (lô hàng)
                                variant_id FK
                         (1)  sales_invoice_items
                                variant_id FK
                         (1)  inventory_receipt_items
                                variant_id FK
                         (1)  pending_order_items
                                variant_id FK
```

---

## 3. Danh sách ĐẦY ĐỦ những thứ cần làm

---

### 3.1 DATABASE — Migration SQL

#### File: `V22__add_product_variants.sql`

```sql
-- Bảng product_variants
CREATE TABLE product_variants (
    id                  BIGSERIAL PRIMARY KEY,
    product_id          BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_code        VARCHAR(60) NOT NULL UNIQUE,
    variant_name        VARCHAR(200) NOT NULL,
    sell_unit           VARCHAR(20) NOT NULL,
    import_unit         VARCHAR(20),
    pieces_per_unit     INT NOT NULL DEFAULT 1,
    sell_price          DECIMAL(18,2) NOT NULL DEFAULT 0,
    cost_price          DECIMAL(18,2) NOT NULL DEFAULT 0,
    stock_qty           INT NOT NULL DEFAULT 0,
    expiry_days         INT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    image_url           VARCHAR(500),
    conversion_note     VARCHAR(100),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Mỗi SP chỉ có 1 default variant
CREATE UNIQUE INDEX uq_variant_default
    ON product_variants(product_id) WHERE is_default = TRUE;
```

#### File: `V23__migrate_products_to_variants.sql`

```sql
-- Tạo 1 variant mặc định cho mỗi SP hiện có
INSERT INTO product_variants (
    product_id, variant_code, variant_name, sell_unit, import_unit,
    pieces_per_unit, sell_price, cost_price, stock_qty,
    expiry_days, is_active, is_default
)
SELECT
    id,
    code,          -- variant_code = product.code hiện tại
    name,
    COALESCE(sell_unit, unit, 'cai'),
    import_unit,
    COALESCE(pieces_per_import_unit, 1),
    sell_price,
    cost_price,
    stock_quantity,
    expiry_days,
    is_active,
    TRUE           -- là default
FROM products WHERE product_type = 'SINGLE';

-- Thêm cột variant_id vào các bảng liên quan
ALTER TABLE product_batches
    ADD COLUMN variant_id BIGINT REFERENCES product_variants(id);

ALTER TABLE inventory_receipt_items
    ADD COLUMN variant_id BIGINT REFERENCES product_variants(id);

ALTER TABLE sales_invoice_items
    ADD COLUMN variant_id BIGINT REFERENCES product_variants(id);

ALTER TABLE pending_order_items
    ADD COLUMN variant_id BIGINT REFERENCES product_variants(id);

-- Backfill variant_id từ product.code → variant.variant_code
UPDATE product_batches pb
SET variant_id = (
    SELECT pv.id FROM product_variants pv
    WHERE pv.product_id = pb.product_id AND pv.is_default = TRUE LIMIT 1
);
-- (tương tự cho 3 bảng còn lại)
```

**Tổng số migration files:** 2 files (V22 + V23)

---

### 3.2 BACKEND — Java

#### A. Entities mới/sửa

| File | Hành động | Mô tả |
|------|-----------|-------|
| `ProductVariant.java` | **TẠO MỚI** | Entity cho bảng product_variants |
| `Product.java` | **SỬA** | Thêm `List<ProductVariant> variants`, bỏ các field đã chuyển sang variant (hoặc giữ làm tổng hợp) |
| `ProductBatch.java` | **SỬA** | Thêm `@ManyToOne ProductVariant variant` thay thế/bổ sung `product` |
| `InventoryReceiptItem.java` | **SỬA** | Thêm `@ManyToOne ProductVariant variant` |
| `SalesInvoiceItem.java` | **SỬA** | Thêm `@ManyToOne ProductVariant variant` |
| `PendingOrderItem.java` | **SỬA** | Thêm `@ManyToOne ProductVariant variant` |

**Tổng: 1 file tạo mới + 5 file sửa**

#### B. DTOs mới/sửa

| File | Hành động | Mô tả |
|------|-----------|-------|
| `ProductVariantRequest.java` | **TẠO MỚI** | Request tạo/sửa variant |
| `ProductVariantResponse.java` | **TẠO MỚI** | Response trả về cho UI |
| `ProductResponse.java` | **SỬA** | Thêm `List<ProductVariantResponse> variants` |
| `ProductRequest.java` | **SỬA** | Thêm optional `List<ProductVariantRequest> variants` |
| `ReceiptItemRequest.java` | **SỬA** | Thêm `variantId` (nullable — nếu null → dùng default variant) |
| `InvoiceItemRequest.java` | **SỬA** | Thêm `variantId` |
| `InvoiceItemResponse / SalesInvoiceItemResponse` | **SỬA** | Thêm `variantId`, `variantCode`, `variantName`, `sellUnit` |
| `InventoryReceiptItemResponse.java` | **SỬA** | Thêm `variantId`, `variantCode` |
| `PendingOrderItemResponse.java` | **SỬA** | Thêm `variantId`, `variantCode` |

**Tổng: 2 file tạo mới + 7 file sửa**

#### C. Repositories mới/sửa

| File | Hành động | Mô tả |
|------|-----------|-------|
| `ProductVariantRepository.java` | **TẠO MỚI** | CRUD + lookup theo productId, variantCode |
| `ProductBatchRepository.java` | **SỬA** | Thêm query theo `variant_id` (FEFO cần tìm lô theo variant) |
| `InventoryReceiptRepository.java` | **SỬA** | `sumReceivedQtyByProductBetween` → thêm group by variant |
| `SalesInvoiceRepository.java` | **SỬA** | Các query doanh thu, lợi nhuận cần tách theo variant |

**Tổng: 1 file tạo mới + 3 file sửa**

#### D. Services sửa (quan trọng nhất)

| File | Hành động | Chi tiết thay đổi |
|------|-----------|-------------------|
| `ProductService.java` | **SỬA LỚN** | CRUD product + CRUD variants; `findAll()` trả về cả variants; `deleteProduct()` check variant có lô/hóa đơn không |
| `InventoryReceiptService.java` | **SỬA LỚN** | `createReceipt()`: resolve variant từ `variantId` hoặc default; tạo batch gắn với variant; cập nhật `variant.stockQty` thay vì `product.stockQty` |
| `InvoiceService.java` | **SỬA LỚN** | `createInvoice()`: check `variant.stockQty` không đủ; deduct từ variant batch FEFO; snapshot `variant.costPrice` vào `unitCostSnapshot` |
| `ProductBatchService.java` | **SỬA** | `deductStock()`: tìm lô theo `variant_id` (FEFO); cập nhật `variant.stockQty` |
| `ExcelReceiptImportService.java` | **SỬA LỚN** | Pass 1: lookup/tạo variant; Pass 2: ghi `variant_id` vào item, batch; tạo variant mới nếu chưa có |
| `InventoryStockService.java` | **SỬA LỚN** | Report tồn kho: group by variant thay vì product; `openingStock`, `closingStock` tính theo variant |
| `ReportService.java` | **SỬA** | Lợi nhuận: `unitCostSnapshot` lấy từ variant tại thời điểm bán |
| `RevenueService.java` | **SỬA** | Doanh thu theo SP: có thể hiển thị chi tiết từng variant |
| `DtoMapper.java` | **SỬA** | Các hàm `toResponse()` cần map thêm variant fields |
| `ExcelTemplateService.java` | **SỬA** | Template nhập hàng: thêm cột variant_code hoặc sell_unit |
| `PendingOrderService.java` | **SỬA** | Kiểm tra và giữ chỗ tồn kho theo variant |
| `ExpiryWarningService.java` | **SỬA** | Cảnh báo hết hạn: lô gắn với variant |

**Tổng: 11 file sửa (7 file sửa lớn)**

#### E. Controllers sửa

| File | Hành động | Mô tả |
|------|-----------|-------|
| `ProductController.java` | **SỬA** | Thêm endpoints: `GET /products/{id}/variants`, `POST /products/{id}/variants`, `PUT /products/{id}/variants/{vid}`, `DELETE /products/{id}/variants/{vid}` |
| `InventoryReceiptController.java` | **SỬA NHỎ** | Truyền variantId trong request |
| `SalesInvoiceController.java` | **SỬA NHỎ** | Truyền variantId trong request |

**Tổng: 3 file sửa**

---

### 3.3 FRONTEND — React/JSX

#### A. Services

| File | Hành động | Mô tả |
|------|-----------|-------|
| `productService.js` | **SỬA** | Thêm: `getVariants(productId)`, `createVariant()`, `updateVariant()`, `deleteVariant()` |
| `receiptService.js` | **SỬA** | Thêm `variantId` vào item request |
| `invoiceService.js` | **SỬA** | Thêm `variantId` vào item request |

**Tổng: 3 file sửa**

#### B. Hooks

| File | Hành động | Mô tả |
|------|-----------|-------|
| `useProducts.js` | **SỬA** | Thêm query/mutation cho variants |

**Tổng: 1 file sửa**

#### C. Pages/Components

| File | Hành động | Chi tiết thay đổi |
|------|-----------|-------------------|
| `ProductsPage.jsx` | **SỬA LỚN** | - Bảng SP: thêm cột "Biến thể" / expand row<br>- Form thêm/sửa SP: thêm tab "Biến thể đóng gói"<br>- Mỗi variant: sell_unit, pieces, sell_price, stock riêng<br>- Dropdown chọn SP → hiện cả variant |
| `ReceiptsPage.jsx` | **SỬA LỚN** | - Form tạo phiếu nhập: dropdown SP hiển thị cả variant<br>- Khi chọn SP → chọn thêm variant (hủ/gói)<br>- Import Excel: cột mới "variant_code" hoặc "sell_unit" |
| `InvoicesPage.jsx` | **SỬA LỚN** | - Form tạo HĐ: dropdown chọn SP+variant<br>- Hiển thị đúng sell_unit của variant đang bán<br>- Kiểm tra tồn kho theo variant |
| `PendingOrdersTab.jsx` | **SỬA** | Chọn variant khi tạo đơn chờ |
| `InventoryReportPage.jsx` | **SỬA** | Báo cáo tồn kho: hiển thị từng variant riêng hoặc gộp theo SP gốc |
| `RevenuePage.jsx` | **SỬA** | Doanh thu theo SP: có thể drill-down xuống từng variant |
| `ProfitReportPage.jsx` | **SỬA** | Lợi nhuận: hiển thị chi tiết variant nếu cần |

**Tổng: 7 file sửa (3 file sửa lớn)**

---

## 4. Đánh giá tổng thể

### 4.1 Quy mô thay đổi

| Hạng mục | Tạo mới | Sửa nhỏ | Sửa lớn | Tổng |
|---------|---------|---------|---------|------|
| Migration SQL | 2 | — | — | 2 |
| Java Entities | 1 | 5 | — | 6 |
| Java DTOs | 2 | 7 | — | 9 |
| Java Repositories | 1 | 3 | — | 4 |
| Java Services | — | 4 | 7 | 11 |
| Java Controllers | — | 3 | — | 3 |
| JS Services/Hooks | — | 4 | — | 4 |
| React Pages | — | 4 | 3 | 7 |
| **TỔNG** | **6** | **30** | **10** | **46** |

### 4.2 Rủi ro

| Rủi ro | Mức độ | Ghi chú |
|--------|--------|---------|
| Migration data cũ sai | 🔴 Cao | Cần test kỹ backfill V23 |
| FEFO deduct sai variant | 🔴 Cao | Logic batch phức tạp hơn |
| UI khi chọn SP phải chọn thêm variant | 🟡 Trung bình | UX thay đổi nhiều |
| Report tồn kho lộn variant | 🟡 Trung bình | Cần test báo cáo |
| Combo chứa variant | 🟡 Trung bình | Combo items cần trỏ variant_id |

### 4.3 Thời gian ước tính

| Giai đoạn | Ước tính |
|-----------|---------|
| Migration DB + Entity | 1 ngày |
| Services (ReceiptService, InvoiceService) | 2–3 ngày |
| Services (Report, Stock, Excel) | 2 ngày |
| Controllers + DTOs | 1 ngày |
| Frontend (ProductsPage, ReceiptsPage, InvoicesPage) | 3–4 ngày |
| Testing + Fix | 2–3 ngày |
| **Tổng** | **~11–14 ngày** |

---

## 5. So sánh với Giải pháp 1 (2 mã SP riêng)

| Tiêu chí | Giải pháp 1 (2 mã SP) | Giải pháp 2 (Variants) |
|---------|----------------------|----------------------|
| Độ phức tạp | ✅ Thấp — không cần thay đổi code | 🔴 Rất cao — ~46 files |
| Thời gian | ✅ 0 ngày dev | 🔴 ~12 ngày dev |
| UX admin | ⚠️ Phải nhớ 2 mã SP liên quan | ✅ 1 SP gốc, chọn variant |
| Báo cáo | ⚠️ Phải filter 2 mã để xem cùng loại | ✅ Xem theo SP gốc + drill-down |
| Tồn kho | ✅ Rõ ràng từng mã | ✅ Rõ ràng từng variant |
| Giá vốn | ✅ Đúng từng mã | ✅ Đúng từng variant |
| Lợi nhuận | ✅ Đúng | ✅ Đúng |
| Rủi ro khi triển khai | ✅ Không có | 🔴 Cao (migration, logic phức tạp) |
| Phù hợp quy mô | ✅ Shop nhỏ/vừa | ⚠️ Shop vừa/lớn |

---

## 6. Khuyến nghị

### Ngắn hạn (ngay bây giờ)
> **Dùng Giải pháp 1** — tạo 2 mã SP riêng.
> Zero code change. Admin tự đặt tên có ý nghĩa: `ABC-HU100`, `ABC-GOI50`.
> Đủ dùng cho shop quy mô nhỏ-vừa.

### Khi shop phát triển (>50 SP, >5 variant/SP)
> **Triển khai Giải pháp 2** — khi đó lợi ích UX mới bù đắp được độ phức tạp.
> Nên làm theo thứ tự: DB → Entity → Service → API → UI.
> Quan trọng nhất: test kỹ `InvoiceService` (FEFO deduct đúng variant) và `InventoryStockService` (báo cáo đúng).

---

*File phân tích này được tạo bởi GitHub Copilot ngày 03/04/2026.*
