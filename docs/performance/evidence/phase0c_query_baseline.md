# Phase 0C — Query-count Baseline (Before)

## 1. Phương pháp đo

| Mục | Chi tiết |
|-----|----------|
| **Công cụ** | Hibernate `Statistics` — `getPrepareStatementCount()` (tổng JDBC prepared statements trong window đo) |
| **Helper** | `NhaDanShop/src/test/java/com/example/nhadanshop/tooling/HibernateStatementStatsHelper.java` |
| **Test** | `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase0cQueryCountBaselineIntegrationTest.java` |
| **Profile** | H2 in-memory, `ddl-auto=create-drop`, `flyway.enabled=false`, `spring.jpa.properties.hibernate.generate_statistics=true` |
| **Lưu ý** | Đo trực tiếp **service layer** tương đương controller (cùng transaction read). **Không** phản ánh HTTP filter stack. Số liệu dùng so sánh **tương đối** và pattern scaling; không claim tối ưu. |

**Cách chạy lại:**

```powershell
cd C:\Work\NhaDanShopBT\NhaDanShop
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest"
```

Log dòng `PHASE0C\t...` nằm trong `build/test-results/test/TEST-...Phase0cQueryCountBaselineIntegrationTest.xml` (system-out) hoặc report HTML.

---

## 2. Bảng baseline (run: 2026-05-09, workspace local)

### 2.1 `GET /api/customers` — `CustomerService.getAll()` (list không phân trang)

| N (số KH active) | Page size | prepareStatements |
|------------------|-----------|--------------------:|
| 10 | n/a | 31 |
| 50 | n/a | 151 |
| 100 | n/a | 301 |

**Dataset:** `N` bản ghi `customers` (active), không invoice.  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **3N + 1** (31 ≈ 3×10+1, 151 ≈ 3×50+1, 301 ≈ 3×100+1).

---

### 2.2 `GET /api/combos` — `ProductComboService.listAll()`

| N (số combo) | Page size | prepareStatements |
|--------------|-----------|--------------------:|
| 10 | n/a | 24 |
| 50 | n/a | 104 |
| 100 | n/a | 204 |

**Dataset:** `N` combo cùng 1 component product (1 variant + batch sellable).  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **2N + 4** (mỗi combo: load items + thêm chi phí cố định).

---

### 2.3 `POST /api/sales/quote` — `SalesQuoteService.quote` (storefront, N dòng giống nhau)

| N (số dòng quote) | Page size | prepareStatements |
|-------------------|-----------|--------------------:|
| 10 | n/a | 16 |
| 50 | n/a | 56 |
| 100 | n/a | 106 |

**Dataset:** 1 variant + 1 batch; `N` dòng cùng product/variant/batch; shipping address cố định; không promotion/voucher; `@MockBean CustomerLoyaltyService`.  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **N + 6** (linear theo số dòng).

---

### 2.4 `GET /api/pending-orders` — `PendingOrderService.listAdminPage` (1 trang đầy)

| N (rows trên trang) | Page size | prepareStatements |
|---------------------|-----------|--------------------:|
| 10 | 10 | 12 |
| 50 | 50 | 52 |
| 100 | 100 | 102 |

**Dataset:** `N` pending `PENDING_PAYMENT`, mỗi đơn 1 line, không invoice; filter mặc định.  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **N + 2** (đơn chưa gắn invoice; nếu confirmed + embed invoice full, baseline sẽ nặng hơn).

---

### 2.5 `GET /api/stock-adjustments` — `StockAdjustmentService.getAll`

| N (rows trên trang) | Page size | prepareStatements |
|---------------------|-----------|--------------------:|
| 10 | 10 | 14 |
| 50 | 50 | 54 |
| 100 | 100 | 104 |

**Dataset:** `N` phiếu DRAFT, 1 dòng/phiếu, cùng variant.  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **N + 4**.

---

### 2.6 `GET /api/promotions` — `PromotionService.list`

| N (rows trên trang) | Page size | prepareStatements |
|---------------------|-----------|--------------------:|
| 10 | 10 | 32 |
| 50 | 50 | 152 |
| 100 | 100 | 302 |

**Dataset:** `N` promotion `PERCENT_DISCOUNT` tối thiểu, không buyItems phức tạp.  
**Nhận định:** **N+1 / query-in-loop confirmed** — gần **3N + 2** (lazy collections + resolve tên quà trong `toResponse`).

---

### 2.7 `GET /api/receipts` — `InventoryReceiptService.listReceipts`

| N (rows trên trang) | Page size | prepareStatements |
|---------------------|-----------|--------------------:|
| 10 | 10 | 3 |
| 50 | 50 | 3 |
| 100 | 100 | 3 |

**Dataset:** `N` phiếu **không** gắn batch (edge tối thiểu để đo list).  
**Nhận định:** **Không tăng tuyến tính theo N** trong kịch bản này — preload batch theo page đã **bounded**; **không** kết luận toàn bộ receipt thực tế (có batch) mà không đo thêm.

---

## 3. Hạn chế

- **H2 ≠ PostgreSQL** — số tuyệt đối có thể lệch; **xu hướng scaling** là mục tiêu chính.
- Một số scenario **rút gọn** (pending không invoice, receipt không batch) để isolate list pattern; bản ghi production đầy đủ có thể làm tăng số câu lệnh.
- **Không** bật `default_batch_fetch_size` làm fix trong Phase 0 (đúng plan).

---

## 4. Kết luận Phase 0C (ngắn)

- **Customers, combos, quote, pending admin page, stock adjustments, promotions:** scaling **gần tuyến tính** theo N → **N+1 / query-in-loop confirmed** cho baseline.
- **Receipt list (phiếu không batch):** **bounded** trong đoạn đo — cần baseline bổ sung với batch gắn receipt nếu muốn parity đầy đủ.
