# Final consolidation — BE performance (N+1 / query-in-loop)

**Loại tài liệu:** Report only — **không** phản ánh diff runtime mới; không thay thế từng báo cáo phase.  
**Ngày tổng hợp:** 2026-05-09  
**Tham chiếu plan:** `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`

---

## 1. Executive Summary

### Phase đã hoàn thành (theo chuỗi evidence)

- **Phase 0:** 0A backend evidence, 0B FE/API contract audit, 0C query baseline, 0 go/no-go — **hoàn thành** (evidence-only / baseline).
- **Phase 1:** Read-path tối ưu (customer batch stats, combo bulk, stock adjustment 2-step, promotion list hydrate) + **Phase 1 test stabilization** (slice mock bean) — **hoàn thành**.
- **Phase 2A:** PendingOrder FE contract sign-off — **hoàn thành** (evidence-only).
- **Phase 2B:** PendingOrder list/read-path (slim invoice trên list, batch hydrate) — **hoàn thành**.
- **Phase 3A:** SalesQuote golden baseline (test-only, không đổi production) — **hoàn thành**.
- **Phase 3B:** SalesQuote QuoteContext (data-access refactor) — **hoàn thành**.
- **Phase 4:** Evidence pack (receipt/Excel map + baseline receipt có batch) — **hoàn thành** (evidence trước code 4A–C).
- **Phase 4A–C:** Receipt create bulk preload; Excel receipt prescan; Excel product import prescan — **hoàn thành**.
- **Phase 6:** Codegen MAX suffix (KH/NCC/COMBO/product category) — **hoàn thành**.
- **Phase 5:** Index / Hibernate config — **evidence-only** (không migration, không apply index) — **hoàn thành** theo phạm vi “recommendation”.

### Mục tiêu ban đầu

- Giảm **N+1** và **query trong vòng lặp** trên các hot path đã xác định.
- Ưu tiên **bulk preload / Map / 2-step ID + EntityGraph** thay vì JOIN FETCH nguy hiểm trên `Page`.
- **Giữ business truth** (stock batch, snapshot, pending confirm, mutation path, bucket thương mại) — không đổi semantics cố ý ngoài các điểm đã ghi nhận (mục 8).

### Kết luận tổng thể

**PASS** cho phạm vi đã implement + gate test đã ghi trong các báo cáo phase: baseline 0C cho thấy scaling tuyến tính trước đổi; sau các phase, các vùng đo chính **bounded** hoặc **giảm mạnh** số `prepareStatements` (H2). **Không** kết luận “production performance đạt mục tiêu tuyệt đối” thiếu **PostgreSQL EXPLAIN / staging load** (Phase 5).

---

## 2. Scope completed by phase

| Phase | Scope | Status | Report file |
|-------|--------|--------|-------------|
| 0A | Backend behavior / API / invariant baseline | Done | `docs/performance/evidence/phase0a_backend_evidence.md` |
| 0B | FE contract audit (pending, snapshots, adapter) | Done | `docs/performance/evidence/phase0b_fe_contract_audit.md` |
| 0C | Query-count baseline (before) | Done | `docs/performance/evidence/phase0c_query_baseline.md` |
| 0 | Go / no-go matrix | Done | `docs/performance/evidence/phase0_go_no_go.md` |
| 1 | Customer combo / adjustment / promotion read-path | Done | `docs/performance/evidence/phase1_performance_report.md` |
| 1 stab | `StockAdjustmentServiceSlice5b` context (`@MockBean` guard) | Done | `docs/performance/evidence/phase1_test_stabilization_report.md` |
| 2A | PendingOrder contract sign-off | Done | `docs/performance/evidence/phase2a_pending_order_contract_signoff.md` |
| 2B | PendingOrder list optimization | Done | `docs/performance/evidence/phase2b_pending_order_performance_report.md` |
| 3A | SalesQuote golden baseline (tests) | Done | `docs/performance/evidence/phase3a_sales_quote_golden_baseline.md` |
| 3B | QuoteContext refactor | Done | `docs/performance/evidence/phase3b_sales_quote_quotecontext_report.md` |
| 4 | Receipt / Excel evidence pack | Done | `docs/performance/evidence/phase4_receipt_excel_evidence_pack.md` |
| 4A | `createReceipt` bulk preload | Done | `docs/performance/evidence/phase4a_receipt_create_bulk_preload_report.md` |
| 4B | Excel receipt prescan | Done | `docs/performance/evidence/phase4b_excel_receipt_prescan_report.md` |
| 4C | Excel product import prescan | Done | `docs/performance/evidence/phase4c_excel_product_import_prescan_report.md` |
| 6 | Codegen MAX suffix | Done | `docs/performance/evidence/phase6_codegen_evidence_and_report.md` |
| 5 | Index / Hibernate evidence (no migration) | Done | `docs/performance/evidence/phase5_index_config_evidence_report.md` |

---

## 3. Files changed summary (theo nhóm)

> Tổng hợp từ báo cáo từng phase; **không** thay thế `git log` / full diff.

### Production BE — services

- **Phase 1:** `CustomerService`, `ProductComboService`, `StockAdjustmentService`, `PromotionService`
- **Phase 2B:** `PendingOrderService`
- **Phase 3B:** `SalesQuoteService` (QuoteContext / preload)
- **Phase 4A:** `InventoryReceiptService`
- **Phase 4B:** `ExcelReceiptImportService`
- **Phase 4C:** `ExcelImportService`
- **Phase 6:** `CustomerService`, `AccountService`, `AuthService`, `SupplierService`, `ProductComboService`, `ProductService`

### Repositories

- **Phase 1:** `SalesInvoiceRepository`, `ProductComboRepository`, `ProductVariantRepository`, `StockAdjustmentRepository`, `PromotionRepository`
- **Phase 2B:** `PendingOrderRepository`
- **Phase 3B:** `ProductBatchRepository` (bulk fetch batch+variant+product)
- **Phase 4A:** `ProductImportUnitRepository`
- **Phase 4B:** `ProductRepository`, `ProductVariantRepository`
- **Phase 4C:** `CategoryRepository`, `ProductRepository`
- **Phase 6:** `CustomerRepository`, `SupplierRepository`, `ProductRepository`

### Tests

- `Phase0cQueryCountBaselineIntegrationTest` (cập nhật theo các phase)
- `Phase3aSalesQuoteGoldenBaselineIntegrationTest` (Phase 3A)
- `Phase4aReceiptCreateQueryCountIntegrationTest`, `Phase4ReceiptExcelEvidenceIntegrationTest`, `Phase4cExcelProductImportQueryCountIntegrationTest`
- `Phase6CodegenIntegrationTest`
- `StockAdjustmentServiceSlice5bIntegrationTest` (stabilization)
- Các suite regression đã liệt kê mục 7

### Evidence docs

- Toàn bộ file trong `docs/performance/evidence/phase*.md` và báo cáo này.

### FE files

- **Không** có thay đổi FE trong phạm vi tối ưu BE đã báo cáo (Phase 0B / 2A xác nhận consumer; test Vitest pending pagination chạy trên FE hiện có).

### Flyway / production config

- **Không** có migration Flyway mới trong chuỗi tối ưu N+1 đã mô tả.
- **Không** bật `hibernate.default_batch_fetch_size` (hay tương đương) cho production trong các phase đã báo cáo.

---

## 4. Query count before / after summary

**Phương pháp:** Hibernate `Statistics.getPrepareStatementCount()` trong test H2 (`Phase0cQueryCountBaselineIntegrationTest` và các test chuyên biệt). Số tuyệt đối có thể lệch PostgreSQL; **xu hướng** là mục tiêu.

| Area | Before (representative) | After | Result |
|------|-------------------------|-------|--------|
| Customers `getAll` (N=10/50/100) | 31 / 151 / 301 | **2** | Bounded — không scale ~3N |
| Combos `listAll` | 24 / 104 / 204 | **4** | Bounded |
| Stock adjustment `getAll` (page N) | 14 / 54 / 104 | **3** | Bounded |
| Promotion `list` (page N) | 32 / 152 / 302 | **3** | Bounded |
| Pending admin list (no invoice, N=page) | 12 / 52 / 102 | **3** | Bounded |
| Pending admin + linked invoice + lines | *(baseline cũ không đo đầy đủ)* | **3** (N=10/50/100) | Không scale theo payload invoice trên list |
| Sales quote (N identical lines) | 16 / 56 / 106 | **8** | Không tuyến tính theo N cho fixture lặp cùng key |
| Excel receipt preview (N rows) | 31 / 151 / 301 | **4** | Bounded |
| Excel product preview (N rows) | ~O(N) lookups (static model ~5×N) | **4** | Bounded cho fixture Phase 4C |
| Receipt list **with** batches (N=page) | 3 / 3 / 3 (0C extended) | **3** | Đã bounded trước; xác nhận lại sau evidence pack |
| Receipt `createReceipt` (N lines) | Read path đã bỏ per-line catalog `findById`; **tổng** JDBC vẫn **tăng theo N** do INSERT/mutation/`existsByBatchCode` per line | Phase 4A: read prescan tối ưu; **total statements** 10→175, 50→1834, 100→6159 (đo mẫu) | **PASS** mục tiêu “bỏ read N+1”; không claim tổng cố định |

---

## 5. Business truth guardrails verified

Các điểm sau được các phase nhắc lại / kiểm tra qua test invariant (tóm tắt):

| Guardrail | Ghi chú |
|-----------|---------|
| **`ProductBatch.remainingQty`** | Truth tồn lô; mutation qua `StockMutationService`; receipt void/delete matrix giữ (Phase 4 evidence). |
| **`ProductVariant.stockQty`** | Projection; đồng bộ qua mutation path — không đổi nghĩa thành sellable trong các phase read-path. |
| **StockMutationService / mutation path** | Receipt create/void/delete, điều chỉnh tồn: không bypass (4A/4 evidence). |
| **`InventoryMovement` append-only** | Void idempotency / `source_type`+`source_id` (evidence pack + repo). |
| **Pending: confirm authority & idempotency** | Phase 2B chỉ read-path list; confirm/mutation không đổi semantics trong báo cáo 2B. |
| **Manual payment link** | Không đổi hành vi “không tự tạo invoice” — không thuộc diff tối ưu list. |
| **Quote / pending / invoice snapshots** | Phase 3B chỉ data-access; 3A golden + commercial tests khóa bucket/snapshot. |
| **Promotion / voucher / loyalty / shipping buckets** | Tách bucket; free shipping / gift không gộp sai discount tiền (3A/3B/commercial tests). |
| **Receipt void / delete** | Evidence pack + locking tests. |
| **Stock adjustment confirm / reverse** | Phase 1 chỉ `getAll` read path. |
| **`totalElements` / `countAdmin`** | Phase 2B: `PageImpl` + `countAdmin` full filter giữ nguyên. |

---

## 6. API / FE / UI impact

| Hạng mục | Kết luận |
|----------|----------|
| **API contract (DTO field names)** | **Không** remove/rename field bắt buộc trong các phase đã báo cáo. |
| **Hành vi payload có điều kiện** | **Có:** `PendingOrderResponse.invoice` trên **list** (admin + account recoverable list) = **`null`** dù DB có `invoice_id` — đã gate Phase 2A; FE chính thức không đọc nested `invoice` trên list. **Detail / confirm** vẫn có đủ invoice khi cần. |
| **FE code** | **Không** đổi trong repo FE cho chuỗi BE perf (theo evidence). |
| **UI** | **Không** đổi vì BE perf. |
| **Rủi ro client ngoài repo** | Consumer phụ thuộc `invoice` đầy đủ trên **GET list** pending có thể bị ảnh hưởng — cần flag/endpoint sau nếu xuất hiện (đã defer backlog). |

---

## 7. Tests run summary

| Test suite | Phase(s) | Result (theo evidence) |
|------------|----------|------------------------|
| `Phase0cQueryCountBaselineIntegrationTest` | 0C, 1, 2B, 3B, 4 (receipt+batch) | **PASS** |
| `Phase3aSalesQuoteGoldenBaselineIntegrationTest` | 3A, 3B gate | **PASS** |
| `SalesQuotePromotionFlowIntegrationTest` | 1, 2B, 3B, commercial | **PASS** |
| `Phase6BeDomainRegressionIntegrationTest` | Regression gate đa phase | **PASS** |
| `Phase5CommercialPromotionsVouchersMvcIntegrationTest` | Commercial | **PASS** |
| `Slice6cQuotePaymentIntegrationTest` | Quote/payment | **PASS** |
| `ReceiptDeletionLockingIntegrationTest` | Receipt delete/lock | **PASS** |
| `Phase4ReceiptExcelEvidenceIntegrationTest` | 4, 4B | **PASS** |
| `Phase4aReceiptCreateQueryCountIntegrationTest` | 4A | **PASS** |
| `ExcelReceiptImportServiceSlice5IntegrationTest` | 4B | **PASS** |
| `ExcelImportServiceSlice5IntegrationTest` | 4C | **PASS** |
| `Phase4cExcelProductImportQueryCountIntegrationTest` | 4C | **PASS** |
| `Phase6CodegenIntegrationTest` | 6 | **PASS** |
| `StockAdjustmentServiceSlice5bIntegrationTest` | 1 stab | **FAIL** trước mock bean; **PASS** sau `phase1_test_stabilization_report` |
| FE `PendingOrders.serverPagination.test.tsx` | 2A/2B gate | **PASS** (Vitest) |

**Ghi chú full suite:** Phase 1 report từng ghi `StockAdjustmentServiceSlice5bIntegrationTest` **FAIL** do thiếu bean — đã xử lý test-only; **không** kết luận `gradlew test` full workspace sạch 100% nếu chưa chạy toàn bộ trong một pipeline CI duy nhất trong báo cáo này.

---

## 8. Known semantic / behavior notes

1. **Pending list `invoice`:** luôn `null` trên list/account list; chi tiết/confirm giữ invoice đầy đủ khi cần.
2. **Stock adjustment list sort:** hai bước ID dùng **`adjDate DESC, id DESC`** — ổn định hơn khi trùng timestamp; có thể khác thứ tự cùng-millisecond so với sort chỉ `adjDate DESC`.
3. **COMBO codegen:** chuyển từ **count-based** sang **MAX suffix** — trường hợp hiếm có thể khác mã so với bản cũ (Phase 6 report).
4. **`ProductComboService.updateVirtualStock`:** vẫn có thể tối ưu bulk sau — **deferred** (Phase 1/3 notes).
5. **Receipt create:** tổng số statement vẫn tăng theo N do ghi DB + `existsByBatchCode` — chỉ tối ưu **read** prescan.
6. **Quote:** nhiều product/variant/batch **khác nhau** vẫn scale theo số **key distinct**, không chỉ số dòng lặp.

---

## 9. Remaining risks

- **Client ngoài repo** phụ thuộc nested `invoice` trên pending **list**.
- **PostgreSQL EXPLAIN** chưa chạy cho khuyến nghị index (Phase 5 — môi trường evidence không có `psql` / chưa đo prod-like).
- **Full `gradlew test` toàn repo:** chưa xác nhận trong báo cáo này một lần chạy CI duy nhất; các **targeted gates** đã PASS theo phase reports.
- **Phase 5B:** index cần approve ops + staging + có thể `CREATE INDEX CONCURRENTLY` ngoài transaction Flyway mặc định.
- **Codegen MAX + concurrency:** vẫn dựa unique + retry; không thay sequence DB trong Phase 6.
- **Trigram / functional index** cho search pending / tên category: deferred.

---

## 10. Deferred backlog

| Item | Reason | Suggested next phase |
|------|--------|----------------------|
| Phase **5B** index migration + staging EXPLAIN | Phase 5 chỉ evidence; cần lock-risk + planner proof | 5B + runbook |
| `ProductComboService.updateVirtualStock` bulk | Chưa chứng minh bottleneck sau combo list fix | Perf phase nhỏ / đo thực tế |
| Codegen **sequence / counter table** | Chỉ nếu MAX suffix thành hotspot contention | Design riêng |
| Pending **`includeInvoiceDetails`** (hoặc endpoint) | External client risk | API product / versioning |
| Hibernate **test-profile** batch_fetch / jdbc batch | Plan: không che N+1; đo sau | Test/perf profile only |
| Staging **EXPLAIN** P0/P1 indexes | Chưa chạy | Cùng 5B |
| Full suite / CI cleanup | Unrelated flakes nếu có | Engineering hygiene |
| Remove dead repo helpers (vd. `findAllCodesByCategoryId` nếu không còn call site) | Phase 6 đã ghi nhận | Tech debt PR |

---

## 11. Final recommendation

**Chọn:** **`READY_FOR_STAGING_WITH_PHASE5B_DEFERRED`**

| Câu hỏi | Trả lời |
|---------|---------|
| **Merge locally / nhánh feature** | **Có thể** nếu team đã review diff + các targeted test gates ở mục 7 PASS trên máy/CI của bạn. |
| **Deploy production ngay** | **Không** khẳng định an toàn chỉ từ báo cáo evidence: thiếu **staging load + PostgreSQL EXPLAIN + quy trình deploy** đã phê duyệt. |
| **Trước production** | Chạy CI/regression đầy đủ theo chuẩn release; triển khai **Phase 5B** (nếu chấp nhận) sau EXPLAIN staging; xác nhận không có consumer phụ thuộc pending list `invoice`. |

**Không chọn `BLOCKED`** cho chuỗi tối ưu cốt lõi: các gate golden/commercial/regression đã PASS theo evidence; blocker chính cho “production confidence” là **DB/index/staging**, không phải revert logic N+1.

**Phase 5B có nên là bước tiếp theo?** **Có** — nếu mục tiêu là giảm seq scan trên PostgreSQL ở quy mô dữ liệu lớn (pending, invoice COMPLETED, `product_batches.receipt_id`, v.v.); thực hiện **sau approve** và **sau EXPLAIN staging** (xem `phase5_index_config_evidence_report.md`).

---

## 12. Appendix — report links

| Path |
|------|
| `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md` |
| `docs/performance/evidence/phase0a_backend_evidence.md` |
| `docs/performance/evidence/phase0b_fe_contract_audit.md` |
| `docs/performance/evidence/phase0c_query_baseline.md` |
| `docs/performance/evidence/phase0_go_no_go.md` |
| `docs/performance/evidence/phase1_performance_report.md` |
| `docs/performance/evidence/phase1_test_stabilization_report.md` |
| `docs/performance/evidence/phase2a_pending_order_contract_signoff.md` |
| `docs/performance/evidence/phase2b_pending_order_performance_report.md` |
| `docs/performance/evidence/phase3a_sales_quote_golden_baseline.md` |
| `docs/performance/evidence/phase3b_sales_quote_quotecontext_report.md` |
| `docs/performance/evidence/phase4_receipt_excel_evidence_pack.md` |
| `docs/performance/evidence/phase4a_receipt_create_bulk_preload_report.md` |
| `docs/performance/evidence/phase4b_excel_receipt_prescan_report.md` |
| `docs/performance/evidence/phase4c_excel_product_import_prescan_report.md` |
| `docs/performance/evidence/phase6_codegen_evidence_and_report.md` |
| `docs/performance/evidence/phase5_index_config_evidence_report.md` |
| `docs/performance/evidence/final_be_performance_consolidation_report.md` (this file) |

---

## Stop conditions (self-check)

- Các report bắt buộc **tồn tại** và đã được đọc để tổng hợp — **không** phát hiện mâu thuẫn buộc dừng (vd. phase báo FAIL tổng thể cho cùng gate).
- **Không** kết luận có migration Flyway / đổi production config / đổi FE trong chuỗi tối ưu đã mô tả.
- Nếu sau này **source** lệch evidence (file đổi mà báo cáo phase không cập nhật), cần **regenerate** consolidation.
