# Phase 5B — Local index migration (Flyway)

**Ngày:** 2026-05-09  
**Phạm vi:** Thêm index PostgreSQL theo Phase 5 (P0/P1); **không** đổi Java/FE/API/business logic; **không** `CREATE INDEX CONCURRENTLY` trong script Flyway.

---

## 1. Scope completed

- Một file migration mới **`V37__performance_indexes_phase5b.sql`**.
- Literal `sales_invoices.status`: **`COMPLETED` / `CANCELLED`** (`SalesInvoice.Status`, `@Enumerated(EnumType.STRING)`).
- Literal `inventory_receipts.status`: **`confirmed` / `voided`** (`InventoryReceipt` constants, V17).
- Literal `pending_orders.status`: tên enum **STRING** (vd. `PENDING_PAYMENT`, …).
- `product_batches.status`: chuỗi theo V18 (`active`, `depleted`, `voided`, `blocked`, `archived`).

---

## 2. Migration file created

| File |
|------|
| `NhaDanShop/src/main/resources/db/migration/V37__performance_indexes_phase5b.sql` |

Version kế tiếp sau **`V36__role_staff_customer_compat.sql`**.

---

## 3. Indexes added (intended objects)

| Index name | Table | Definition (tóm tắt) |
|------------|-------|----------------------|
| `idx_pending_orders_status_created_at` | `pending_orders` | `(status, created_at DESC)` |
| `idx_pending_orders_status_expires_at` | `pending_orders` | `(status, expires_at)` |
| `idx_pending_order_items_pending_order_id` | `pending_order_items` | `(pending_order_id)` |
| `idx_sales_invoices_completed_customer_phone` | `sales_invoices` | `(customer_phone)` **partial** `WHERE status = 'COMPLETED' AND customer_phone IS NOT NULL` |
| `idx_sales_invoices_completed_customer_id` | `sales_invoices` | `(customer_id)` **partial** `WHERE status = 'COMPLETED' AND customer_id IS NOT NULL` |
| `idx_sales_invoices_completed_invoice_date` | `sales_invoices` | `(invoice_date DESC)` **partial** `WHERE status = 'COMPLETED'` |
| `idx_product_batches_receipt_id` | `product_batches` | `(receipt_id)` **partial** `WHERE receipt_id IS NOT NULL` |
| `idx_product_batches_receipt_expiry` | `product_batches` | `(receipt_id, expiry_date)` **partial** `WHERE receipt_id IS NOT NULL` |
| `idx_product_batches_variant_status_expiry_remaining` | `product_batches` | `(variant_id, status, expiry_date, remaining_qty)` |
| `idx_inventory_receipts_status_receipt_date` | `inventory_receipts` | `(status, receipt_date DESC)` |
| `idx_products_category_code` | `products` | `(category_id, code)` |

**Ghi chú thiết kế:** Hai index receipt (`receipt_id` và `receipt_id, expiry_date`) **chồng một phần** — composite có leading `receipt_id` thường đủ cho lookup theo phiếu; giữ cả hai theo spec Phase 5B để ưu tiên kế hoạch planner đơn giản cho equality-only; có thể gộp một index sau EXPLAIN production nếu dư thừa.

---

## 4. Indexes skipped (already existed)

- **Không** tạo object trùng tên: grep `idx_pending_orders_*`, `idx_sales_invoices_completed_*`, `idx_product_batches_receipt*`, `idx_inventory_receipts_status_receipt_date`, `idx_products_category_code` trong `db/migration` trước V37 → **0** khớp.
- Các index cũ **khác tên** vẫn giữ nguyên (vd. `idx_si_status`, `idx_invoice_customer`, `idx_pb_variant_id`, …) — **không** xóa, không trùng định nghĩa.

---

## 5. Overlap với index hiện có (có chủ đích)

| Index mới | Index / ràng buộc hiện có | Lý do vẫn thêm |
|-----------|---------------------------|----------------|
| `idx_sales_invoices_completed_customer_id` | `idx_invoice_customer` partial `(customer_id) WHERE customer_id IS NOT NULL` | Mới **lọc thêm `status = 'COMPLETED'`** → nhỏ hơn, khớp batch stats / báo cáo COMPLETED. |
| `idx_sales_invoices_completed_invoice_date` | `ix_sales_invoices_invoice_date` (toàn bộ status) | Partial COMPLETED → ít row hơn cho revenue/daily queries. |
| `idx_product_batches_variant_status_expiry_remaining` | `idx_pb_variant_id` `(variant_id, expiry_date, remaining_qty)` | Thêm **`status` làm cột 2** cho predicate sellable / JPQL `b.status IN ('active','blocked')` / `= 'active'`. |

---

## 6. Commands run + result

| Command | Result |
|---------|--------|
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest" --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest"` | **BUILD SUCCESSFUL** (2026-05-09) |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.FlywayPostgresMigrationSmokeIntegrationTest"` | **SKIPPED** (`disabledWithoutDocker = true` — không có Docker/Testcontainers chạy) |

---

## 7. Flyway migration result (local)

- **Test H2 / đa số integration:** `spring.flyway.enabled=false` → **không** apply V37 trên H2; **không** phát sinh lỗi partial index trên H2 trong các test đã chạy.
- **PostgreSQL thật:** xem **§ PostgreSQL local verification** bên dưới (verify sau Phase 5B artifact).
- **Docker Desktop:** daemon không chạy → `FlywayPostgresMigrationSmokeIntegrationTest` vẫn có thể **SKIP**; verify thực tế dùng **PostgreSQL 14 local** + `psql` + `bootRun`.

---

## 8. EXPLAIN result

- **Trước verify Postgres:** chưa chạy (Docker/psql PATH).
- **Sau verify Postgres (2026-05-09):** đã chạy `EXPLAIN` — tóm tắt trong **§ PostgreSQL local verification** (cột EXPLAIN).

---

## 9. API / FE / business logic changed?

| Hạng mục | Đổi? |
|----------|------|
| API / DTO | **Không** |
| FE | **Không** |
| Java business logic | **Không** |
| Semantics pending / invoice / stock / receipt | **Không** |

---

## 10. Production readiness note

- **Local / branch:** migration V37 sạch, idempotent ở mức `IF NOT EXISTS`, chỉ thêm index.
- **Production sau này:** bảng lớn nên cân nhắc **`CREATE INDEX CONCURRENTLY`** + runbook **ngoài** transaction Flyway mặc định; bắt buộc **staging EXPLAIN** trước merge release DB.

---

## 11. Final verdict

**PASS** — migration **V37** trong repo; **VERIFIED_ON_LOCAL_POSTGRES** (chi tiết § PostgreSQL local verification): chuỗi Flyway apply tới V37, **11/11** index có trong `pg_indexes`, không lỗi SQL; regression **Phase0c** + **Phase6BeDomainRegression** xanh sau verify.

---

## PostgreSQL local verification

**Ngày verify:** 2026-05-09

| Mục | Chi tiết |
|-----|----------|
| **PostgreSQL setup** | Instance **native** Windows: `localhost:5432`, DB `nhadanshop`, user `postgres` (khớp `application.properties` / `docker-compose.yml`). **Docker Desktop** không kết nối được daemon → không dùng `docker compose` / Testcontainers trong phiên verify. |
| **Client** | `C:\Program Files\PostgreSQL\14\bin\psql.exe` (không có `psql` trong PATH). |
| **DB reset** | **Có** — `DROP DATABASE nhadanshop` + `CREATE DATABASE nhadanshop` (terminate session trước). |
| **Flyway run method** | **`.\gradlew.bat bootRun`** (Spring Boot `spring.flyway.enabled=true` mặc định) chạy nền ~36s; poll `flyway_schema_history` đến khi `version = '37' AND success = true` rồi dừng tiến trình bootRun. **Không** dùng Testcontainers. |
| **Lỗi SQL** | **Không** — V37 apply `success = true`. |
| **flyway_schema_history (TOP 5)** | `37 performance indexes phase5b` ✓ `success = t`; 36, 35, 34, 33 ✓ |
| **pg_indexes** | **11/11** dòng cho đúng 11 tên index Phase 5B (đủ). |
| **EXPLAIN** | **Có** — `EXPLAIN` (không `ANALYZE`) trên DB gần như rỗng sau migrate: **pending_orders** dùng `idx_pending_orders_status_created_at`; **product_batches** `receipt_id = 1` dùng `idx_product_batches_receipt_expiry`; **inventory_receipts** `status = confirmed` dùng `idx_inventory_receipts_status_receipt_date`. Truy vấn **sales_invoices** mẫu `COMPLETED` + `customer_phone IN (...)` trên bảng rất nhỏ: planner chọn `idx_sales_invoices_completed_invoice_date` + **Filter** phone — hợp lý khi ít row; với dữ liệu lớn kỳ vọng planner ưu tiên partial `idx_sales_invoices_completed_customer_phone` khi predicate khớp. |
| **Regression tests** | `Phase0cQueryCountBaselineIntegrationTest` + `Phase6BeDomainRegressionIntegrationTest` → **BUILD SUCCESSFUL** (sau verify). |
| **Thay đổi code/migration** | **Không** — chỉ verify + cập nhật báo cáo. |

**Final PostgreSQL verification verdict:** **`VERIFIED_ON_LOCAL_POSTGRES`**

---

## References

- `docs/performance/evidence/phase5_index_config_evidence_report.md`
- `docs/performance/evidence/final_be_performance_consolidation_report.md`
