# Phase 2A — PendingOrder FE / API Contract Sign-off

**Ngày:** 2026-05-09  
**Vai trò:** Evidence / sign-off only (không tối ưu, không đổi code production).

---

## 1. Scope

- **Đây là sign-off only:** ghi nhận bằng chứng tĩnh + grep lại FE để khóa contract trước Phase 2B.
- **Không thay đổi code production BE** (không `PendingOrderService`, không mapper BE, không migration).
- **Không thay đổi code production FE** (không adapter, không UI).
- **Không thay đổi API contract** trong phạm vi Phase 2A (không đổi DTO/endpoint/field).
- **Không đụng SalesQuote / QuoteContext.**

---

## 2. Sources reviewed (trích dẫn nội bộ)

Các báo cáo evidence sau đã được đọc và được dùng làm cơ sở cho kết luận dưới đây:

| Tài liệu | Nội dung chính liên quan Phase 2A |
|----------|-------------------------------------|
| `docs/performance/evidence/phase0b_fe_contract_audit.md` | Grep FE: không consumer `order.invoice` / `invoice.items` trên pending; `CloudPendingOrderAdapter.backendToOrder` không map `raw.invoice`; confirm đọc `invoice` từ **response confirm**; list admin/account dùng snapshot + `pricingBreakdownSnapshot.total`. Kết luận mục 8: **GO** Phase 2B sau khi Phase 2A sign-off. |
| `docs/performance/evidence/phase0a_backend_evidence.md` | `PendingOrderResponse` BE có **`invoice` (`SalesInvoiceResponse` full khi có)**; rủi ro list: `toResponse` + map invoice nặng + N+1; counts `countAdmin` full filter server-side. |
| `docs/performance/evidence/phase0_go_no_go.md` | PendingOrder: **`BLOCKED_NEEDS_FE_CONTRACT`** cho tới khi **Phase 2A** sign-off chính thức; sau đó mới **Phase 2B**. |
| `docs/performance/evidence/phase1_performance_report.md` | Phase 1 **không** làm PendingOrder 2B; nhắc lại gate theo `phase0_go_no_go.md`. |
| `docs/performance/evidence/phase1_test_stabilization_report.md` | Ổn định test slice (mock bean); **không** liên quan trực tiếp pending contract; xác nhận môi trường test BE có thể chạy baseline sau chỉnh test-only. |

---

## 3. FE usage re-check (grep)

### 3.1 Repo FE và đường dẫn

- **Repo FE (trong monorepo):** `C:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b`
- **Phạm vi quét:** `src/**/*.ts`, `src/**/*.tsx`

### 3.2 Lệnh đã chạy

**A. Workspace search (tương đương ripgrep — Cursor / công cụ nội bộ):** các pattern sau được quét trên `nha-dan-pos-c091ee5b` với glob `*.{ts,tsx}`:

- `pendingOrder.invoice` → **0** khớp
- `order.invoice` → **0** khớp
- `invoice?.items` → **0** khớp
- `invoice.items` → **0** khớp (lưu ý: UI hóa đơn POS dùng `invoice.lines` trong `InvoiceDetailDrawer`, không dùng `invoice.items`)
- `PendingOrderResponse` (tên type BE) → **0** khớp trong TS/TSX (FE dùng `PendingOrder` / payload thô trong adapter)
- `invoiceSummary` → **0** khớp
- `PendingOrderConfirmResponse` → chỉ xuất hiện dưới dạng type nội bộ `BackendPendingOrderConfirmResponse` trong `CloudPendingOrderAdapter.ts`
- `backendToOrder` → `CloudPendingOrderAdapter.ts` (mapper list/get/…)
- `pricingBreakdownSnapshot`, `promotionSnapshot`, `voucherSnapshot`, `loyaltySnapshot`, `shippingQuoteSnapshot`, `giftLines` / `giftLinesSnapshot` → nhiều khớp: pending admin/storefront, quote/checkout, mapping invoice, tests (chi tiết mục 4)

**B. PowerShell (môi trường local không có `rg` trong PATH):**

```powershell
cd C:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src
$patterns = @(
  'pendingOrder\.invoice','order\.invoice','invoice\?\.items','invoice\.items',
  'PendingOrderResponse','invoiceSummary'
)
foreach ($p in $patterns) {
  $m = Get-ChildItem -Recurse -Include *.ts,*.tsx -File | Select-String -Pattern $p
  Write-Output "PATTERN $p : $($m.Count) matches"
}
```

**Kết quả:** tất cả các pattern trên cho **0** khớp (khớp với audit Phase 0B cho nhóm “nested invoice trên pending”).

**C. Kiểm thử FE tùy chọn (Vitest):**

```powershell
cd C:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b
npm test -- --run src/pages/admin/PendingOrders.serverPagination.test.tsx
```

**Kết quả:** **PASS** — 1 file, **3** tests (tab counts / query list; không assert nested `invoice` từ list).

### 3.3 Tóm tắt re-check

- **Không phát hiện consumer mới** cho `pendingOrder.invoice`, `order.invoice`, hay `invoice.items` / `invoice?.items` trên toàn bộ `src`.
- **Không có** usage `PendingOrderResponse` (tên Java/DTO) trong FE — contract phía FE là `PendingOrder` + `BackendPendingOrder` trong adapter.
- **Confirm path** vẫn chỉ đọc `data.invoice` (id + `invoiceNo`) từ payload confirm, không từ list GET.

---

## 4. FE usage classification

| File | Pattern / field used | Usage type | List / detail / confirm / payment / export | Requires nested `invoice` on pending list? | Notes |
|------|----------------------|------------|---------------------------------------------|---------------------------------------------|--------|
| `src/services/adapters/cloud/CloudPendingOrderAdapter.ts` | `backendToOrder`, snapshots, `lines`; `confirm` reads `data.invoice` (`id`, `invoiceNo`) | adapter / mapper | list + detail + get + **confirm** | **No** | `BackendPendingOrder` không khai báo `invoice`; `backendToOrder` không đọc `raw.invoice` |
| `src/services/types.ts` | `PendingOrder`, snapshots, `lines`, `confirmedInvoiceId` / `confirmedInvoiceNo` | type-only | — | **No** | Không có field `invoice` trên model FE canonical |
| `src/services/pendingOrders/PendingOrderService.ts` | `PendingOrder` interface | type-only | — | **No** | Contract service |
| `src/pages/admin/PendingOrders.tsx` | `pricingBreakdownSnapshot.total`, snapshots, `lines`, drawer breakdown; sau confirm dùng `confirmedInvoiceNo` để điều hướng | list/table + detail/drawer + **confirm flow** (gọi service) | list + detail + confirm | **No** | Không truy cập `order.invoice` |
| `src/pages/storefront/PendingPayment.tsx` | `pricingBreakdownSnapshot`, promo/voucher/ship, `giftLinesSnapshot` | detail + **payment** | payment | **No** | |
| `src/pages/storefront/Account.tsx` | Pending slice: `code`, dates, `paymentMethod`, `pricingBreakdownSnapshot.total` | **account page** | list (account) | **No** | `invoiceNo` ở section “Đơn hàng gần đây” là **đơn đã có HĐ**, không phải pending nested invoice |
| `src/pages/admin/UnmatchedPayments.tsx` | `pricingBreakdownSnapshot.total` | **payment/reconciliation** | payment | **No** | |
| `src/pages/admin/Dashboard.tsx` | `pricingBreakdownSnapshot?.total` | list/table (snippet) | list | **No** | |
| `src/services/adapters/local/LocalPendingOrderAdapter.ts` | snapshots, `lines` | adapter | test / local | **No** | |
| `src/services/adapters/backend/invoiceApiMapping.ts` | `pricingBreakdownSnapshot`, snapshots, `giftLinesSnapshot` | adapter | invoice mapping (POS/backend invoice) | **No** | Không phải pending list consumer |
| `src/pages/storefront/Checkout.tsx`, `src/services/sales/salesQuoteApi.ts` | quote snapshots, `loyaltySnapshot`, … | quote/checkout | — | **No** | Ngoài phạm vi pending list; không đổi QuoteContext trong phase này |
| `src/components/shared/InvoiceDetailDrawer.tsx` | `invoice.lines`, `breakdown.giftLines` | detail/drawer | invoice UI | **No** | Model `Invoice` POS, không phải `PendingOrderResponse.invoice` từ API pending list |
| `src/test/pendingOrderConfirmInvoice.test.ts` | parse `invoice` object confirm | test/fixture | confirm | **No** | Kiểm tra parity parse id/`invoiceNo` |
| `*.test.tsx` / `*.test.ts` (pending, pagination, staff-actions, loyalty) | fixtures snapshots | test/fixture | — | **No** | |

---

## 5. PendingOrder API contract conclusion (trả lời trực tiếp)

| Câu hỏi | Kết luận |
|---------|----------|
| FE pending **list** có dùng `PendingOrderResponse.invoice.items` không? | **Không** — không có reference `invoice.items` / `invoice?.items`; adapter không map `invoice`; list dùng snapshot + `lines`. |
| FE pending **detail/get** có dùng nested `invoice` không? | **Không** — cùng mapper `backendToOrder`; UI drawer dùng snapshot fields + `lines`, không đọc nested invoice từ BE. |
| FE **confirm** có phụ thuộc invoice từ **pending list** không? | **Không** — confirm đọc **`invoice` từ response confirm** (`POST .../confirm`), chỉ cần `id` + `invoiceNo` để set `confirmedInvoiceId` / `confirmedInvoiceNo`. |
| FE **account** pending orders có phụ thuộc nested `invoice` không? | **Không** — chỉ hiển thị meta + `pricingBreakdownSnapshot.total`. |
| Nếu Phase 2B **bỏ hoặc slim** full invoice embedding trên **list**, FE hiện tại có vỡ không? | **Không** — với codebase hiện tại và grep lại 2026-05-09, không có consumer list/detail GET phụ thuộc nested `invoice`. *Cảnh báo:* client ngoài repo hoặc tích hợp chưa quét vẫn là rủi ro vận hành; nếu nghi ngờ, dùng chiến lược tương thích mục 6. |

---

## 6. Recommended Phase 2B strategy (an toàn)

**Ưu tiên (khớp plan & 0B):**

- Tối ưu **list / admin / account list path** để **không load full invoice items / allocations** khi không cần.
- **GET detail** (`/api/pending-orders/{id}`) giữ đủ **snapshot fields** đã dùng UI (`promotionSnapshot`, `voucherSnapshot`, `loyalty` trong breakdown, `giftLinesSnapshot`, `shippingQuoteSnapshot`, `pricingBreakdownSnapshot`, `lines`, …).
- **Confirm response** vẫn trả **`invoice`** (ít nhất `id` + `invoiceNo`) như hiện tại — FE **bắt buộc** các field này sau confirm.
- Nếu cần thêm thông tin tổng hợp trên list: thêm **scalar summary** hoặc giữ field hiện có **không breaking**.
- **Không remove/rename** field đang được FE/types/tests dùng nếu chưa có contract test / cờ tương thích.

**Nếu có nghi ngờ consumer ngoài repo:**

- **A.** Endpoint summary riêng cho list; hoặc  
- **B.** `includeInvoiceDetails` (default **giữ hành vi hiện tại** = tương thích ngược).

---

## 7. BE contract guard cho Phase 2B

Phase 2B **chỉ** được triển khai nếu tuân thủ:

- **Không đổi** DTO/field mà FE đang đọc sau adapter (snapshots, `lines`, `status`, payment fields, totals, v.v.).
- **Không đổi** ý nghĩa / shape bắt buộc của các snapshot:  
  `promotionSnapshot`, `voucherSnapshot`, `loyalty` (trong `pricingBreakdownSnapshot` / breakdown đã normalize), `giftLinesSnapshot`, `shippingQuoteSnapshot`, `pricingBreakdownSnapshot`, `lines`, `status`, payment fields — trừ khi có slice migration + test có chủ đích.
- **Không đổi** hành vi **`PendingOrderConfirmResponse` / confirm**: vẫn trả `invoice` đủ để FE lấy `id` + `invoiceNo`.
- **Không đổi** `totalElements` / **`countAdmin`** semantics (full filter server-side).
- **Không đổi** semantics **confirm / cancel / payment** pending.

---

## 8. Query baseline reference (Phase 0C — PendingOrder)

Nguồn: `docs/performance/evidence/phase0c_query_baseline.md` (run 2026-05-09).

| N (rows/page) | Page size | `prepareStatements` (before) | Ghi chú |
|---------------|-----------|------------------------------|---------|
| 10 | 10 | 12 | |
| 50 | 50 | 52 | |
| 100 | 100 | 102 | |

- **Nhận định:** pattern ~**N + 2**, **N+1 / query-in-loop confirmed** trên `PendingOrderService.listAdminPage`.
- **Dataset baseline:** pending `PENDING_PAYMENT`, mỗi đơn 1 line, **không invoice** — baseline **chưa** phản ánh đầy đủ chi phí **embed invoice full** trên list.
- **Khuyến nghị Phase 2B:** nếu optimization chạm embed invoice, **bổ sung** test đếm query cho **pending rows có `invoice`** (before/after), không chỉ dựa baseline “no invoice”.

---

## 9. Phase 2B Go / No-Go

**Kết luận:** `GO_TO_IMPLEMENT_PHASE_2B`

**Điều kiện (bắt buộc):**

- Chỉ tối ưu **list path** (admin + account list tương đương) để tránh load full invoice/allocations trên page list.
- **Detail** giữ đủ snapshot như cam kết.
- **Confirm response** giữ hành vi `invoice` cho FE.
- **Bắt buộc** đo **query count before/after** (và bổ sung scenario **có invoice** nếu chạm embed).
- **Không đổi UI** trong slice perf thuần.

**Rủi ro còn lại (không chặn GO trong repo này):** ứng dụng khách ngoài git chưa được grep — nếu xuất hiện, chuyển sang `BLOCKED_NEEDS_API_COMPAT_STRATEGY` và áp dụng mục 6 (A/B).

---

## 10. Suggested Phase 2B acceptance criteria

- Số query list pending **bounded / gần hằng số** theo kích thước trang (không scale theo N invoice embed nếu đã slim).
- **Không** load full **invoice items / allocations** trên list **trừ** khi có flag/endpoint rõ ràng.
- **Detail** endpoint vẫn có đủ snapshot data cho drawer/UI hiện tại.
- **FE:** tests hiện có + audit usage (hoặc thêm contract test nhẹ nếu team chọn) **PASS**.
- **`totalElements` / `countAdmin`** không đổi semantics.
- **Không đổi** semantics nghiệp vụ confirm/cancel/payment.

---

## Sign-off metadata

| Mục | Giá trị |
|-----|---------|
| Production BE changed? | **No** |
| Production FE changed? | **No** |
| API contract changed (Phase 2A)? | **No** |
| Phase 2B gate | **`GO_TO_IMPLEMENT_PHASE_2B`** với điều kiện mục 9 |

**Người / quy trình:** báo cáo evidence do agent/tooling tạo theo plan; merge gate nội bộ theo `phase0_go_no_go.md` (PendingOrder: unblock 2B sau 2A).
