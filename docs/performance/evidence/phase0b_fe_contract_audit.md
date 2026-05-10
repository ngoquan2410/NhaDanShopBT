# Phase 0B — FE / API Contract Evidence (`nha-dan-pos-c091ee5b`)

Audit tĩnh theo plan mục 4. **Repo FE:** `nha-dan-pos-c091ee5b/`. Công cụ: ripgrep trên `*.{ts,tsx}` (và một số `.mjs` fixture).

---

## 1. Kết quả grep theo pattern (đường dẫn chính)

### 1.1 `pendingOrder.invoice` / `order.invoice` / `invoice?.items` / `invoice.items`

- **`order.invoice`**: không có khớp trong TS/TSX (pattern không dùng trong FE).
- **`invoice?.items` / `invoice.items`**: chủ yếu trong **invoice mapping / drawer**, không gắn với pending list:
  - `src/components/shared/InvoiceDetailDrawer.tsx` — `giftLines` từ breakdown invoice POS
  - `src/services/adapters/backend/invoiceApiMapping.ts` — map invoice BE → model POS

### 1.2 `PendingOrderResponse` / `PendingOrder` (type)

- `src/services/types.ts` — `PendingOrder` interface (canonical FE): **không** có field `invoice`; có `confirmedInvoiceId` / `confirmedInvoiceNo` (meta sau confirm).
- `src/lib/mock-data.ts` — interface mock `PendingOrder`
- `src/services/pendingOrders/PendingOrderService.ts` — contract service
- Tests: `PendingOrders.serverPagination.test.tsx`, `PendingOrders.staff-actions.test.tsx`, …

### 1.3 `invoiceSummary`

- **Không** có match trong `ts/tsx` (pattern không tồn tại trong codebase).

### 1.4 `invoiceId` / `invoiceNo`

- `invoiceNo`: POS (`src/pages/admin/POS.tsx`), mapping (`invoiceApiMapping.ts`, `pos-quote-receipt.ts`), Account orders (`Account.tsx` — **đơn hàng đã có HĐ**, không phải pending), automation specs, tests.
- `invoiceId`: `src/services/account/accountApi.ts` (`PointHistoryRow.invoiceId`) — lịch sử điểm, không phải pending list.

### 1.5 `pricingBreakdown` / snapshot fields

| Pattern | File tiêu biểu | Cách dùng |
|---------|----------------|-----------|
| `pricingBreakdownSnapshot` | `PendingOrders.tsx`, `PendingPayment.tsx`, `Account.tsx`, `Checkout.tsx`, `UnmatchedPayments.tsx`, `CloudPendingOrderAdapter.ts` | UI list/detail/reconcile; normalize trong adapter |
| `promotionSnapshot` | Pending storefront/admin, `Checkout.tsx`, adapters | UI + checkout |
| `voucherSnapshot` | Tương tự | UI + quote/pending |
| `loyaltySnapshot` | **`salesQuoteApi.ts`**, `Checkout.tsx` | Quote/checkout; pending adapter có normalize pricing loyalty fields trong breakdown |
| `shippingQuoteSnapshot` | Pending pages, checkout, tests | Shipping UI |
| `giftLines` | `InvoiceDetailDrawer`, `promotionEvaluationApi.ts`, `Cart.tsx`, quote tests | POS invoice drawer vs promotion evaluate vs cart preview |

---

## 2. Pending order — luồng dữ liệu quan trọng

### 2.1 `CloudPendingOrderAdapter`

- **`BackendPendingOrder` type** (file `src/services/adapters/cloud/CloudPendingOrderAdapter.ts`): **không** khai báo field `invoice`.
- **`backendToOrder`**: map `lines`, mọi snapshot (`giftLinesSnapshot`, `promotionSnapshot`, `voucherSnapshot`, `shippingQuoteSnapshot`, `pricingBreakdownSnapshot`), **không** đọc `raw.invoice`.
- **`list()`**: `data.content.map(backendToOrder)` — mọi bản ghi list đi qua mapper trên.
- **`get()` / `getByCode()`**: cùng `backendToOrder` — **bỏ qua** nested `invoice` nếu BE gửi.
- **`confirm()`**: đọc **`data.invoice`** từ **`PendingOrderConfirmResponse`** (payload confirm), **không** từ pending order list; lấy `id` + `invoiceNo` → `confirmedInvoiceId` / `confirmedInvoiceNo`.

### 2.2 Admin list `PendingOrders.tsx`

- Bảng: `order.pricingBreakdownSnapshot.total`, status, payment, search, pagination.
- Drawer chi tiết: `pricingBreakdownSnapshot`, `promotionSnapshot`, `voucherSnapshot`, `giftLinesSnapshot`, `shippingQuoteSnapshot`, **lines** — **không** truy cập `order.invoice` hoặc `invoice.items`.

### 2.3 Storefront `Account.tsx` (GET `/api/account/pending-orders`)

- `adminFetchJson<PendingOrder[]>` — **không** qua `CloudPendingOrderAdapter`; runtime JSON có thể chứa field thừa nhưng UI chỉ dùng: `code`, `createdAt`, `paymentMethod`, `expiresAt`, **`pricingBreakdownSnapshot.total`**.

### 2.4 `PendingPayment.tsx`

- Dùng snapshot breakdown, gift, promo, voucher, shipping — **không** grep thấy `invoice.items`.

---

## 3. Phân loại usage (tóm tắt)

| Khu vực | List/table | Detail/drawer | Confirm/payment | Adapter/type | In tests/fixtures |
|---------|------------|---------------|-----------------|--------------|-------------------|
| Pending snapshots | Có (`PendingOrders`, `Account`) | Có (`PendingOrders` drawer) | Có (`PendingPayment`, `UnmatchedPayments`) | `CloudPendingOrderAdapter` | Nhiều |
| Nested `invoice` trên pending | **Không thấy** consumer TS | **Không** qua `backendToOrder` | **Chỉ** `confirm` đọc invoice **top-level** response | Type `BackendPendingOrder` không có `invoice` | `pendingOrderConfirmInvoice.test.ts` |

---

## 4. FE có cần full nested `invoice` / `invoice.items` / allocation trên **pending list** không?

**Không** — theo code hiện tại:

- List admin và account chỉ cần snapshot + lines đã có trên `PendingOrderResponse` (không cần object `invoice` đầy đủ).
- Adapter chuẩn hóa **loại bỏ** `invoice` khỏi model FE cho list/get.

**Lưu ý:** Nếu tương lai có consumer **raw fetch** không qua adapter, cần grep lại; hiện tại các path `/api/pending-orders` trong repo đều qua `CloudPendingOrderAdapter` hoặc `accountApi` với usage hẹp.

---

## 5. Có thể slim pending list (bỏ/giảm embed `SalesInvoiceResponse`) không?

**Có điều kiện — từ góc nhìn FE hiện tại:** UI và adapter không phụ thuộc `invoice` nested trên list/detail GET. **Rủi ro** nằm ở: client ngoài repo, logging/monitoring, hoặc Phase 2A phát hiện thêm consumer.

**Chiến lược đề xuất (khớp plan Phase 2B):**

- **Option A:** Endpoint summary riêng (backward compatible).
- **Option B:** `includeInvoiceDetails` default `true` cho đến khi FE/consumer xác nhận.
- Giữ `GET /api/pending-orders/{id}` đủ snapshot như cam kết plan.

---

## 6. Có cần FE adapter migration không?

- **Nếu** chỉ slim payload list và FE vẫn nhận cùng field đã map (`backendToOrder` không đổi): **không bắt buộc**.
- **Nếu** thêm field summary hoặc đổi shape: chỉnh adapter + types trong cùng slice.

---

## 7. Có cần đổi UI không?

**Không** cho slice perf thuần — màn hình đã dùng snapshot/lines; không phụ thuộc invoice nested.

---

## 8. Kết luận bắt buộc — PendingOrder Phase 2B

**GO** (điều kiện: Phase **2A** vẫn phải chạy để **sign-off** ma trận chính thức và bắt kịch bản ngoài scope grep).

Lý do ngắn:

- Không có usage `invoice.items` / allocation trên pending list trong FE đã grep.
- `backendToOrder` **không** expose `invoice` từ BE cho list/get.
- Confirm flow dùng invoice từ **response confirm**, không phụ thuộc list payload.

**Nếu Phase 2A phát hiện consumer ẩn:** đổi kết luận sang **BLOCKED_NEEDS_FE_CONTRACT** và áp dụng Option A/B ở trên.

---

## 9. Lệnh grep đã chạy (mẫu)

```text
rg "pendingOrder\\.invoice|order\\.invoice|invoice\\?\\.items|invoice\\.items|PendingOrderResponse|invoiceSummary|invoiceId|invoiceNo|pricingBreakdown|promotionSnapshot|voucherSnapshot|loyaltySnapshot|shippingQuoteSnapshot|giftLines" nha-dan-pos-c091ee5b --glob "*.{ts,tsx}"
```

(Đã thực thi trong phiên làm evidence; kết quả tổng hợp trong các mục trên.)
