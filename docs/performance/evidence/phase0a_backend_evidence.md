# Phase 0A — Backend Evidence Baseline (NhaDanShop)

Tài liệu ghi nhận **hành vi BE hiện tại** (read path + contract DTO) phục vụ gate performance. **Không** thay đổi code production trong Phase 0.

**Tham chiếu plan:** `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`

---

## 1. CustomerService / Customer APIs

| Mục | Chi tiết |
|-----|----------|
| **Service** | `CustomerService` |
| **Repository** | `CustomerRepository`, `SalesInvoiceRepository` (3 aggregate query / customer trong `toResponse`) |
| **Controller** | `CustomerController` — `GET /api/customers?q=`, `GET /api/customers/{id}`, CRUD còn lại |
| **Response** | `CustomerResponse`: id, code, name, phone, address, email, group, **totalSpend**, **debt**, **orderCount**, **lastPurchaseAt**, note, active, createdAt, updatedAt |
| **DB** | `customers`; thống kê từ `sales_invoices` (predicate COMPLETED + identity id + phone normalize — mirror repository hiện tại) |
| **Business truth** | `totalSpend` / `orderCount` / `lastPurchaseAt` chỉ từ hóa đơn **COMPLETED**; identity khách id + phone chuẩn hóa |
| **Test liên quan** | Integration domain: `Phase6BeDomainRegressionIntegrationTest`; không có suite riêng chỉ Customer N+1 |
| **Invariant** | Không đổi công thức aggregate; không mix CANCELLED vào spend |
| **Risk nếu optimize sai** | Sai identity (phone-only vs id) → sai totalSpend / orderCount |

---

## 2. ProductComboService / Combo APIs

| Mục | Chi tiết |
|-----|----------|
| **Service** | `ProductComboService` |
| **Repository** | `ProductRepository`, `ProductComboRepository`, `ProductVariantRepository`, `ProductBatchRepository`, … |
| **Controller** | `ProductComboController` — `GET /api/combos` (listAll admin), `GET /api/combos/active`, `GET /api/combos/{id}`, CRUD, import |
| **Response** | `ProductComboResponse` + `ComboItemResponse`: id, code, name, sellPrice, **stockQty (virtual)**, defaultVariantId, items (component lines + retail/cost), … |
| **DB** | `products` (type COMBO), `product_combo_items`, batches của component default variant |
| **Business truth** | Virtual stock từ **sellable batch** component; `ProductVariant.stockQty` là projection; không dùng raw `stockQty` làm sellable truth khi đã chốt rule batch (plan PERF-005) |
| **Test liên quan** | `SalesQuotePromotionFlowIntegrationTest`, `Slice6cQuotePaymentIntegrationTest`, … |
| **Invariant** | Combo list phải giữ đủ field; virtual stock cùng predicate với bán hàng |
| **Risk** | Bulk preload sai map → thiếu item hoặc sai virtual stock |

---

## 3. StockAdjustmentService / List API

| Mục | Chi tiết |
|-----|----------|
| **Service** | `StockAdjustmentService` |
| **Repository** | `StockAdjustmentRepository` (page `findAllByOrderByAdjDateDesc` — **không** EntityGraph) |
| **Controller** | `StockAdjustmentController` — `GET /api/stock-adjustments` (page default size 20), `GET /api/stock-adjustments/{id}`, create/confirm/reverse/delete |
| **Response** | `StockAdjustmentResponse` + dòng item: variant, product, sourceBatch, system/actual/diff qty, … |
| **DB** | `stock_adjustments`, `stock_adjustment_items`, `product_batches` (allocation trace) |
| **Business truth** | Reversal theo **allocation trace**, không chạy lại FEFO; movement qua `StockMutationService` |
| **Test liên quan** | Nhiều integration adjustment/reversal trong `src/test/java/.../integration` và service tests |
| **Invariant** | Read path không được che giấu field; mutation path không đổi |
| **Risk** | EntityGraph / fetch sai → thiếu batch hoặc variant cho audit |

---

## 4. PromotionService / List API

| Mục | Chi tiết |
|-----|----------|
| **Service** | `PromotionService` |
| **Repository** | `PromotionRepository` (Specification + Page; không preload collections) |
| **Controller** | `PromotionController` — `GET /api/promotions` (page), `/active`, CRUD, evaluate/pick-best |
| **Response** | `PromotionResponse`: type, dates, discount, **categories**, **products**, **buyItems**, gift product name resolve, … |
| **DB** | `promotions`, join tables categories/products, `promotion_buy_items`, … |
| **Business truth** | Promotion/voucher/loyalty/shipping là **bucket riêng**; gift không là discount tiền; free shipping chỉ shipping bucket |
| **Test liên quan** | `Phase5CommercialPromotionsVouchersMvcIntegrationTest`, `SalesQuotePromotionFlowIntegrationTest`, `Slice7CommercialFlowIntegrationTest` |
| **Invariant** | List admin phải trả đủ collection đã expose; không đổi semantics evaluate |
| **Risk** | N+1 khi `toResponse` đọc lazy + `findById` tên quà |

---

## 5. PendingOrderService — list / detail / counts

| Mục | Chi tiết |
|-----|----------|
| **Service** | `PendingOrderService` |
| **Repository** | `PendingOrderRepository` (JpaSpecificationExecutor + Page) |
| **Controller** | `PendingOrderController` — `GET /api/pending-orders` (admin/staff list + filters), `GET /api/pending-orders/counts`, `GET /api/pending-orders/{id}`, `by-code`, create, confirm, cancel, … |
| **Account** | `AccountController` — `GET /api/account/pending-orders` → `listRecoverableForCustomer` (cùng `PendingOrderResponse`) |
| **Response** | `PendingOrderResponse`: id, code, dates, status, customer\*, shippingAddress, payment\*, **lines** (`PendingOrderItemResponse` + commercial snapshot), **giftLinesSnapshot**, **promotionSnapshot**, **voucherSnapshot**, **shippingQuoteSnapshot**, **pricingBreakdownSnapshot**, note, audit fields, **`invoice`** (`SalesInvoiceResponse` **full** khi có) |
| **DB** | `pending_orders`, `pending_order_items`, snapshot JSON columns, optional `invoice_id` → `sales_invoices` + lines + allocations |
| **Business truth** | Pending **không** trừ stock; **confirm** idempotent, sole authority tạo invoice; manual payment link không tạo invoice; snapshot không recompute từ master hiện tại |
| **Counts** | `countAdmin`: 5 count theo status + tổng — **full filter** server-side |
| **Test liên quan** | `Slice6cQuotePaymentIntegrationTest`, payment/pending flows; FE `PendingOrders.serverPagination.test.tsx` (adapter/UI) |
| **Invariant** | `totalElements` page = filter server; tab counts = full filter; detail giữ đủ snapshot |
| **Risk** | `toResponse` + `DtoMapper.toResponse(SalesInvoice)` trên list → payload nặng + N+1 |

---

## 6. SalesQuoteService / Quote

| Mục | Chi tiết |
|-----|----------|
| **Service** | `SalesQuoteService` |
| **Controller** | `SalesQuoteController` — `POST /api/sales/quote` |
| **Response** | `SalesQuoteResponse`: quoteId, lines, pricingBreakdownSnapshot, promotion/voucher/loyalty/shipping snapshots, reward lines, … |
| **DB** | Đọc catalog/batch; có thể persist quote snapshot (public id) tùy flow |
| **Business truth** | Bucket commercial tách biệt; snapshot cho storefront; không leak manual discount sai source |
| **Test liên quan** | `SalesQuotePromotionFlowIntegrationTest`, `Phase6BeDomainRegressionIntegrationTest`, `Slice6cQuotePaymentIntegrationTest` |
| **Invariant** | Parity golden trước Phase 3B (plan 8.F) |
| **Risk** | Loop `findById` / combo / promotion helper → query bùng nổ |

---

## 7. InventoryReceiptService — list / create (tóm tắt)

| Mục | Chi tiết |
|-----|----------|
| **Service** | `InventoryReceiptService` |
| **Controller** | `InventoryReceiptController` — `GET /api/receipts`, date range, `POST` create, void/delete matrix |
| **Response** | `InventoryReceiptResponse` + batches; list dùng `mapReceiptPage` **batch preload** batches theo `receiptIds` |
| **DB** | `inventory_receipts`, `product_batches`, movements append-only |
| **Business truth** | Confirmed-on-create trong transaction; void/delete matrix không đổi; không bypass `StockMutationService` |
| **Test liên quan** | `ReceiptDeletionLockingIntegrationTest`, … |
| **Invariant** | List read đã tối ưu batch; create/import vẫn có loop findById (plan PERF-009/010) — tách phase |

---

## 8. Money / stock / history — DB tables & assert gợi ý

Khi chạm mutation sau này, evidence pack nên assert (plan mục 1):

- `product_batches.remaining_qty` (truth), `product_variants.stock_qty` (projection = SUM batch sau sync)
- `inventory_movements` append-only
- `sales_invoice_item_batch_allocations` cho exact batch / cancel restore
- Snapshot JSON quote/pending/invoice
- Pending confirm không duplicate invoice/movement

---

## 9. Regression tests đã chạy (Phase 0)

- `Phase0cQueryCountBaselineIntegrationTest` (baseline perf, H2) — **PASS** sau khi thêm helper Phase 0C.
- Toàn bộ suite khác: **không** bắt buộc chạy full trong task evidence-only; khuyến nghị CI hiện có.
