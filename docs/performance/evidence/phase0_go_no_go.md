# Phase 0 — Go / No-Go (tổng hợp)

Sau Phase **0A / 0B / 0C** (evidence-only). Mỗi area **một** trạng thái theo ma trận plan.

| Area | Trạng thái | Evidence có | Evidence thiếu / điều kiện dừng | Next phase đề xuất | Stop condition |
|------|------------|-------------|-----------------------------------|--------------------|----------------|
| **Customer batch stats** | `GO_TO_IMPLEMENT` | 0A behavior + 0C baseline (3N+1) | Golden JSON snapshot chưa lưu file riêng (optional 8.B) | Phase 1 PERF-001 | Đổi predicate identity mà không có test so sánh stats |
| **ProductCombo bulk preload** | `GO_TO_IMPLEMENT` | 0A + 0C (~2N+1) | Parity virtual stock khi đụng PERF-005 semantic | Phase 1 PERF-004 | Đổi sellable rule không có test combo/pending |
| **StockAdjustment list optimization** | `GO_TO_IMPLEMENT` | 0A + 0C (N+1 list) | Invariant reversal/trace khi chạm write path | Phase 1 PERF-008 | JOIN FETCH Page làm sai total/slice |
| **Promotion list preload** | `GO_TO_IMPLEMENT` | 0A + 0C (~3N) | — | Phase 1 PERF-011 | Thiếu field buyItems/gift trong response |
| **PendingOrder list/detail optimization** | `BLOCKED_NEEDS_FE_CONTRACT` | 0B: adapter/UI không dùng `invoice` list; 0C baseline list | **Phase 2A** sign-off chính thức (ma trận plan §4) trước 2B; kịch bản consumer ngoài grep | Phase **2A** → 2B | Slim list breaking nếu có client phụ thuộc `invoice` nested mà chưa migration |
| **SalesQuote QuoteContext** | `BLOCKED_NEEDS_GOLDEN_PARITY` | 0A + 0C (N lines) | Golden parity đủ scenario **8.F** (3A) | Phase **3A** → 3B | Refactor data-access khi chưa có golden |
| **Receipt/Excel bulk preload** | `BLOCKED_NEEDS_DB_INVARIANT` | 0A receipt list; 0C receipt list (empty batch case) | Evidence invariant + baseline receipt **có batch**; Excel import path | Phase **4** sau evidence pack | Bypass `StockMutationService` / đổi void-delete matrix |
| **Index/config** | `BLOCKED_NEEDS_INDEX_EXPLAIN` | Plan đề xuất index §5 | EXPLAIN + lock-risk PostgreSQL; không dùng batch_fetch che N+1 | Phase **5** | Migration index trong transaction sai (CONCURRENTLY) |
| **Codegen cleanup** | `DEFERRED` | 0A đã note `generateNextCode` / combo code | — | Phase **6** | Đổi concurrency uniqueness mà không thiết kế |

---

## Ghi chú

- **Phase 1** chỉ mở cho các dòng `GO_TO_IMPLEMENT` (customer, combo, adjustment, promotion read paths).
- **PendingOrder:** 0B kỹ thuật cho phép slim list; trạng thái `BLOCKED_NEEDS_FE_CONTRACT` thể hiện **gate Phase 2A** vẫn là bước bắt buộc theo plan trước khi merge 2B — không mâu thuẫn với kết luận "GO" trong `phase0b_fe_contract_audit.md` (định hướng Phase 2B sau 2A).
- **SalesQuote:** không mở Phase 3B cho đến khi có golden baseline.
