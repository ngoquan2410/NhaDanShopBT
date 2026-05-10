# Phase 5 — Index / config evidence & recommendations

**Ngày:** 2026-05-09  
**Vai trò:** Evidence + khuyến nghị **chỉ trên giấy** — không Flyway, không apply index trên môi trường thật, không đổi production config, không đổi business logic / FE.

**Bối cảnh:** Sau Phase 1 / 2B / 3B / 4 (A–C) / 6, N+1 chính đã được xử lý bằng batch preload, 2-step ID, QuoteContext, v.v. Báo cáo này đánh giá **index & Hibernate tuning** còn lại dựa trên **audit tĩnh** (repository + Flyway) và **không** có `EXPLAIN ANALYZE` PostgreSQL trong phiên làm việc này (xem mục 7).

---

## 1. Scope

| Cho phép | Không làm trong phase này |
|----------|---------------------------|
| Đọc plan + evidence Phase 1, 2B, 3B, 4A–C, 6 | Tạo migration Flyway |
| Grep / đọc `V*.sql`, entity, repository | `CREATE INDEX` trên DB (kể cả dev có sẵn) |
| Khuyến nghị ưu tiên, risk, lộ trình Phase 5B | Bật `hibernate.default_batch_fetch_size` (hay tương đương) **production** |
| Ghi chú lock / `CONCURRENTLY` / Flyway transaction | Kết nối production / in secret |

---

## 2. Current schema / index audit (rút gọn có chọn lọc)

Nguồn: `NhaDanShop/src/main/resources/db/migration/V1__full_schema.sql` và các migration `V3`–`V36` (grep `CREATE INDEX` / `UNIQUE`).

| Table | Existing relevant indexes / constraints | Source | Notes |
|-------|----------------------------------------|--------|--------|
| `pending_orders` | `order_no` **UNIQUE** (implicit unique index) | V1 | **Không** có index riêng trên `(status, created_at)`, `customer_phone`, `customer_id` (VARCHAR, V9) |
| `pending_order_items` | PK `id`; FK `pending_order_id` → `pending_orders` | V1 | PostgreSQL **không** tự tạo index trên cột FK con — join/hydrate theo `pending_order_id` có thể hưởng lợi index riêng |
| `sales_invoices` | `invoice_no` UNIQUE; `ix_sales_invoices_invoice_date`; `idx_si_status` (`status`); `idx_invoice_customer` **partial** `(customer_id) WHERE customer_id IS NOT NULL`; `ux_sales_invoices_pending_order_id` partial; `idx_sales_invoices_source_type` | V1, V3, V12 | Cột `customer_phone` (V12) **không** thấy index chuyên biệt |
| `sales_invoice_items` | `ix_sales_items_product_id`; `idx_sii_invoice_variant`; `idx_sii_combo_source` partial | V1 | Báo cáo / GROUP BY thường lọc qua join tới invoice `status` + `invoice_date` |
| `product_batches` | `batch_code` **UNIQUE**; `idx_pb_product_expiry` `(product_id, expiry_date, remaining_qty)`; `idx_pb_expiry_date`; `idx_pb_variant_id` `(variant_id, expiry_date, remaining_qty)`; `idx_product_batches_production_order` (V20) | V1, V20 | **Không** có index btree trên `receipt_id` (nullable FK tới `inventory_receipts`) |
| `inventory_receipts` | `ix_inventory_receipts_receipt_date`; `idx_receipt_supplier` partial | V1 | V17 thêm `status` (`confirmed` / `voided`) — **không** thấy index `(status, receipt_date)` |
| `inventory_receipt_items` | `idx_iri_receipt_variant`; `ix_inventory_items_product`; partial `expiry_date_override` | V1 | — |
| `inventory_movements` | `idx_inventory_movements_variant_created_at`; `idx_inventory_movements_batch_created_at`; `idx_inventory_movements_source` `(source_type, source_id)` | V13 | Hỗ trợ `existsBySourceTypeAndSourceId`, aggregate theo `variant_id` + `created_at` |
| `products` | `code` **UNIQUE**; `ix_products_category_id`; `idx_products_type`; `idx_products_type_active` | V1 | Phase 6: `findMaxNumericSuffixForCategoryPrefix` lọc `category_id` + pattern mã |
| `product_variants` | `variant_code` **UNIQUE**; V8 `idx_product_variants_code_lower`; `idx_product_variants_name_unaccent`; `idx_pv_product_id` | V1, V8 | Phase 4B/4C: `LOWER(v.variant_code) IN (...)` |
| `categories` | `name` **UNIQUE** (case-sensitive theo collation DB) | V1 | Phase 4C: `LOWER(TRIM(c.name)) IN (...)` — không khớp trực tiếp unique trên `name` nguyên bản |
| `promotions` | `idx_promotions_active_dates` `(is_active, start_date, end_date)` | V1 | List / active window |
| `promotion_buy_items` | `uq_promotion_buy_items_promo_product`; `idx_promotion_buy_items_promotion` | V33 | — |
| `promotion_categories` / `promotion_products` | PK composite `(promotion_id, …)` | V1 | Đủ cho join từ promotion |
| `customers` | `uq_customer_code`; `idx_customers_code_lower` (V8); phone/name indexes | V1, V8 | Phase 6: MAX `KH` suffix — không có partial index theo pattern |
| `suppliers` | `uq_supplier_code`; V8 lower code/phone | V1, V8 | Phase 6: MAX `NCC` suffix |

---

## 3. Hot query mapping

| Area | Query / method (đại diện) | Predicates / ORDER BY | Index support hiện tại | Gap |
|------|----------------------------|------------------------|------------------------|-----|
| Pending admin list + counts | `PendingOrderRepository.findAll(spec, pageable)`; `buildAdminListSpec` | `status = ?`, optional `paymentMethod`, `search` → `UPPER(like)` trên `orderNo`, `customerName`, `customerPhone`, `paymentReference`; sort mặc định **`createdAt DESC`** | Chỉ UNIQUE `order_no` khi tìm đúng mã | Thiếu index **lead column** theo `status` + `created_at` cho filter/tab counts + page; search LIKE/OR **khó** index btree thuần (xem DEFER) |
| Pending hydrate lines | `findAllByIdInForListHydrate` | `id IN (...)` + fetch `items`, `items.batch` | PK `pending_orders.id` | `pending_order_items.pending_order_id`: nên có index FK-child (mục 4) |
| Pending scheduler | `findByStatusAndExpiresAtBefore` | `status`, `expires_at` | Không rõ index | Có thể `(status, expires_at)` nếu volume lớn — **P1/P2** |
| Customer batch stats | `findCompletedByCustomerIdIn`, `findCompletedByCustomerPhoneIn` + aggregate trong service | `status = COMPLETED` + `customer.id IN` hoặc `customerPhone IN` | `idx_si_status`; `idx_invoice_customer` (nhánh FK) | Nhánh **phone**: không có index trên `customer_phone`; planner có thể quét rộng trên `status` |
| Invoice identity aggregates | `sumCompletedTotalForCustomerIdentity`, `countCompletedForCustomerIdentity`, `lastCompletedAtForCustomerIdentity` | `status = COMPLETED` + `(customer_id = ? OR customer_phone = ?)` | Tương tự trên | Composite **partial** `(status, customer_id)` và/hoặc partial trên `customer_phone` khi COMPLETED |
| Invoice list / reports | `findInvoiceIdsForList`, `findInvoiceIdsForListFiltered`; nhiều JPQL `invoiceDate BETWEEN` + `status = COMPLETED` | `status`, `invoice_date` | `idx_si_status`; `ix_sales_invoices_invoice_date` **tách** | Kết hợp filter thường gặp: **`(status, invoice_date)`** hoặc partial `WHERE status = 'COMPLETED'` |
| Receipt listing / reports | `findByReceiptDateBetween…`; JPQL `item.receipt.status = 'confirmed'` + `receiptDate` range | `status`, `receipt_date` | Chỉ `receipt_date` | `(status, receipt_date)` cho báo cáo nhập / aggregate |
| Batches by receipt | `findByReceipt_IdIn`, `findByReceiptIdOrderByExpiryDateAsc`, void/delete paths | `receipt_id`, order `expiry_date` | `idx_pb_*` theo product/variant/expiry | **Không** có btree `receipt_id` → risk seq scan khi nhiều batch/receipt |
| Sellable / FEFO | `findSellableByVariantIdForUpdateFefo`, `sumSellableRemainingQtyByVariantIds`, v.v. | `variant_id`, `remaining_qty > 0`, `status = 'active'`, `expiry_date >= :asOf`, join variant/product flags | `idx_pb_variant_id (variant_id, expiry_date, remaining_qty)` | Predicate **`status`** không nằm trong index hiện tại — bitmap/seq + filter hoặc index chồng lấn |
| Inventory movement idempotency | `existsBySourceTypeAndSourceId` | equality `(source_type, source_id)` | `idx_inventory_movements_source` | Đủ cho equality |
| Movement prefix scan | `findBySourceIdStartingWithOrderByIdAsc` | `source_id LIKE 'prefix%'` | Cùng index composite | Prefix scan thường ổn trên cột thứ 2 nếu `source_type` kèm theo — **xác nhận bằng EXPLAIN** khi có DB |
| Product / variant Excel prescan | `findByCodeIn`, `findByVariantCodeLowerIn`, `findCategoryIdAndNameLowerKeysByCategoryIdIn` | `code IN`, `LOWER(variant_code) IN`, `category_id IN` + `LOWER(TRIM(name))` | UNIQUE `products.code`; `idx_product_variants_code_lower`; category: không có functional index | Bulk đã giảm round-trip; index functional `(category_id, lower(trim(name)))` chỉ cần nếu EXPLAIN/show row lớn |
| Promotion admin list | `PromotionRepository` + `Specification` + `findAllByIdInWithDetails` | thường `is_active`, date window | `idx_promotions_active_dates` | Phase 1 đã batch hydrate — index hiện tại thường đủ |
| Codegen MAX suffix | `findMaxNumericSuffixForCategoryPrefix`, `findMaxComboAutoNumericSuffix`, `findMaxKhAutoNumericSuffix`, `findMaxNccAutoNumericSuffix` | `category_id` + `UPPER(SUBSTRING…)` + REPLACE digit-check; `product_type = 'COMBO'`; prefix `KH`/`NCC` | `ix_products_category_id`; `idx_products_type`; unique codes | REPLACE/SUBSTRING làm khó dùng index đơn giản; **`(category_id, code)`** vẫn giúp **narrow** scan trong category |

---

## 4. Candidate indexes (khuyến nghị — **chưa** implement)

| Priority | Table | Proposed index (PostgreSQL) | Supports query | Benefit | Risk | Apply now? |
|----------|-------|-----------------------------|------------------|---------|------|------------|
| **P0** | `pending_orders` | `(status, created_at DESC)` INCLUDE optional columns nếu cần cover | Admin list + `countAdmin` theo tab `status`; sort `createdAt DESC` | Giảm seq scan khi bảng lớn; counts lặp với cùng filter | Tăng kích thước index; write nhỏ hơn trên pending | **No** — Phase **5B** sau approve + EXPLAIN staging |
| **P0** | `sales_invoices` | **Partial** `CREATE INDEX … ON sales_invoices (customer_phone) WHERE status = 'COMPLETED' AND customer_phone IS NOT NULL` | `findCompletedByCustomerPhoneIn`, identity aggregates nhánh phone | Khớp batch stats Phase 1 trên dataset nhiều HĐ | Duplicate logic nếu đã có index tương tự sau này — review trước apply | **No** — 5B |
| **P0** | `sales_invoices` | **Partial** `(customer_id) WHERE status = 'COMPLETED' AND customer_id IS NOT NULL` *hoặc* composite `(status, customer_id)` (đánh giá trùng với `idx_invoice_customer`) | Batch stats nhánh FK | Planner chọn đường tối ưu cho `status = COMPLETED` + `IN` | `idx_invoice_customer` đã partial theo `customer_id` nhưng **không** lọc `status` — composite/partial mới rõ nghĩa | **No** — 5B; so sánh EXPLAIN với index cũ |
| **P0** | `sales_invoices` | Partial `(invoice_date) WHERE status = 'COMPLETED'` **hoặc** `(status, invoice_date DESC)` | Revenue / daily / top reports, `countByInvoiceDateBetweenAndStatus` | Giảm đọc cho báo cáo theo ngày | Index lớn nếu `COMPLETED` chiếm đa số — vẫn thường đáng | **No** — 5B |
| **P1** | `pending_order_items` | `(pending_order_id)` | FK join, `EntityGraph` items | Tránh nested loop/seq scan trên child | Rất ít downside | **No** — 5B |
| **P1** | `product_batches` | `(receipt_id)` **hoặc** `(receipt_id, expiry_date)` | Receipt page batches, void, `findByReceipt_IdIn` | Hot path sau Phase 4A list receipt | Lock/time build index nếu bảng rất lớn | **No** — 5B; ưu tiên `CONCURRENTLY` prod |
| **P1** | `product_batches` | `(variant_id, status, expiry_date)` **hoặc** partial sellable (`remaining_qty > 0` + `status = 'active'`) | Sellable sums, FEFO locks | Giảm filter sau index range | Phải khớp **chính xác** predicate JPQL (active/blocked/…) | **No** — cần EXPLAIN + thống nhất predicate |
| **P1** | `inventory_receipts` | `(status, receipt_date DESC)` | `sumReceivedQty*` với `status = 'confirmed'` | Báo cáo nhập theo kỳ | Partial `WHERE status = 'confirmed'` có thể gọn hơn | **No** — 5B |
| **P1** | `products` | `(category_id, code)` | `findMaxNumericSuffixForCategoryPrefix`, import lookup theo category | Phase 6: narrow theo category thay vì chỉ `category_id` | Gần trùng: đã có `ix_products_category_id` + UNIQUE `code` — **đánh giá trùng lặp**: composite hỗ trợ sort/prefix trong category tốt hơn pure `category_id` | **No** — verify không duplicate benefit với UNIQUE(code) |
| **P2** | `pending_orders` | `(expires_at) WHERE status IN (…)` cho job hủy | Scheduler `findByStatusAndExpiresAtBefore` | Tùy volume | Cần khớp enum status thực tế | **Defer** |
| **P2** | `categories` | Expression `((lower(trim(name))))` **unique không khả thi** — chỉ index btree expression nếu prescan chậm | `findByTrimmedNameLowerIn` | Chỉ khi EXPLAIN chứng minh | Trùng tên khác case phức tạp | **Defer** |
| **P2** | `products` | Expression `(lower(trim(name)))` + `category_id` | R9 duplicate name prescan | Trùng mục functional — chỉ nếu đo | Kích thước / maintain | **Defer** |
| **DEFER** | `pending_orders` | `pg_trgm` trên `order_no`, `customer_phone`, … | `search` LIKE `%x%` | Admin search | Extension, kích thước index, ops | **Defer** — cần policy extension + sizing |
| **DEFER** | Codegen | Sequence / counter table / generated column numeric suffix | Thay REPLACE chain | Chỉ nếu profiling chứng minh MAX là bottleneck | Thay đổi kiến trúc — ngoài Phase 5B index | **Defer** (đúng hướng dẫn Phase 6) |

**Trùng lặp / không đề xuất:** Không đề xuất thêm UNIQUE trên `product_batches.batch_code` (đã có). Không đề xuất index mới cho `inventory_movements (source_type, source_id)` (đã có).

---

## 5. PostgreSQL lock / Flyway notes

- **`CREATE INDEX` thường**: chặn ghi (`ShareLock`) trên bảng trong lúc build — trên bảng lớn (`sales_invoices`, `product_batches`) có thể ảnh hưởng SLA.
- **`CREATE INDEX CONCURRENTLY`**: giảm chặn nhưng **không được** chạy trong transaction block — Flyway mặc định bọc migration trong transaction → dễ fail hoặc phải tách script.
- **Khuyến nghị vận hành (khi approve Phase 5B):**
  - Staging: đo thời gian build + `EXPLAIN (ANALYZE, BUFFERS)` trước/sau.
  - Production: ưu tiên **`CONCURRENTLY`** cho index mới trên bảng nóng; cân nhắc chạy **ngoài Flyway** (runbook) hoặc migration Flyway `non-transactional` + lệnh tách.
- **Partial index**: nhớ khớp **đúng** literal `status` / điều kiện với entity (ví dụ `COMPLETED`, `confirmed`) để planner dùng index.

---

## 6. Hibernate config recommendation

Sau khi N+1 chính đã fix, các property sau là **tối ưu phụ**, không thay thế query tuning.

| Property | Recommendation | Reason | Apply now? |
|----------|----------------|--------|------------|
| `hibernate.default_batch_fetch_size` (vd. `32`) | **Chỉ** `test` / `perf` profile hoặc thử nghiệm local; **không** bật production theo yêu cầu phase này | Giảm lazy batch nhỏ còn sót; rủi ro memory + surprise fetch size | **No** (prod) — **optional** dev/test sau baseline |
| `hibernate.jdbc.batch_size` (vd. `50`) | Thử trên **test** khi đo insert/update hàng loạt | Tăng throughput batch DML | **No** prod — đo trước |
| `hibernate.order_inserts` / `hibernate.order_updates` | Thử kết hợp `jdbc.batch_size` trên test | Giúp batching hiệu quả hơn | **No** prod — đo trước |

**Lưu ý:** Plan gốc đã coi `default_batch_fetch_size` là **không** dùng để che N+1 trước khi fix root — hiện root đã xử lý nhiều path; vẫn nên **đo** trước khi production.

---

## 7. EXPLAIN results

**PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` không chạy** trong phase evidence này.

- **Lý do:** Môi trường agent Windows hiện **không có `psql` trong PATH**; test tích hợp trong repo dùng **H2** — không dùng làm bằng chứng kế hoạch thực thi PostgreSQL.
- **Việc tiếp theo (Phase 5B / staging):** chạy EXPLAIN cho các mẫu: pending admin list + count; `findCompletedByCustomerPhoneIn`; báo cáo `dailyRevenue`; `findByReceipt_IdIn`; `sumSellableRemainingQtyByVariantIds` (native SQL tương đương).

---

## 8. Final decision

| Mục | Kết luận |
|-----|----------|
| **Implement ngay trong repo?** | **Không** — chỉ evidence; chờ approve riêng. |
| **Phase 5B (migration riêng) nếu approve** | Ưu tiên: **`pending_orders (status, created_at)`**, **`pending_order_items (pending_order_id)`**, **`product_batches (receipt_id)`**, **partial index `sales_invoices` cho COMPLETED + `customer_phone` / `(status, invoice_date)`**, **`inventory_receipts (status, receipt_date)`**. |
| **Defer** | GIN/trgm search pending; functional index category/product name; redesign codegen sequence — chỉ khi có số liệu. |
| **Hibernate batch / batch_fetch** | Thử **test profile** sau khi có baseline JDBC/CPU; **không** đề xuất bật production trong phase này. |

**Stop conditions:** Không cần credential production; không chạy lệnh destructive; không tạo migration trong phase này; schema index đã xác định được qua Flyway; không đề xuất index trùng UNIQUE/`idx_inventory_movements_source` hiện có.

---

## References (đã đọc)

- `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`
- `docs/performance/evidence/phase1_performance_report.md`
- `docs/performance/evidence/phase2b_pending_order_performance_report.md`
- `docs/performance/evidence/phase3b_sales_quote_quotecontext_report.md`
- `docs/performance/evidence/phase4a_receipt_create_bulk_preload_report.md`
- `docs/performance/evidence/phase4b_excel_receipt_prescan_report.md`
- `docs/performance/evidence/phase4c_excel_product_import_prescan_report.md`
- `docs/performance/evidence/phase6_codegen_evidence_and_report.md`
