package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductBatchResponse;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.SalesInvoiceItemBatchAllocationRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductBatchService {

    private final ProductBatchRepository batchRepo;
    private final ProductRepository productRepo;
    private final SalesInvoiceItemBatchAllocationRepository allocationRepo;
    private final StockMutationService stockMutationService;

    public record BatchDeduction(Long batchId, int deductedQty) {}

    public record DeductionResult(BigDecimal averageCost, List<BatchDeduction> batchDeductions) {}

    // ─── Queries ──────────────────────────────────────────────────────────────

    /** Tất cả lô của 1 sản phẩm (còn hàng + hết hàng), sắp xếp theo ngày HH */
    public List<ProductBatchResponse> getBatchesByProduct(Long productId) {
        if (!productRepo.existsById(productId)) {
            throw new EntityNotFoundException("Không tìm thấy sản phẩm ID: " + productId);
        }
        return batchRepo.findByProductIdOrderByExpiryDateAsc(productId)
                .stream().map(this::toResponse).toList();
    }

    /** Chỉ lô CÒN HÀNG của 1 sản phẩm, FEFO order */
    public List<ProductBatchResponse> getActiveBatchesByProduct(Long productId) {
        return batchRepo
                .findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(productId, 0)
                .stream().map(this::toResponse).toList();
    }

    /** Lô theo variant còn hàng, FEFO order */
    public List<ProductBatchResponse> getActiveBatchesByVariant(Long variantId) {
        return batchRepo
                .findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(variantId, 0)
                .stream().map(this::toResponse).toList();
    }

    /** Lô thuộc 1 phiếu nhập kho */
    public List<ProductBatchResponse> getBatchesByReceipt(Long receiptId) {
        return batchRepo.findByReceiptIdOrderByExpiryDateAsc(receiptId)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Cảnh báo sắp hết hạn: lô còn hàng, hết hạn trong vòng {@code daysAhead} ngày.
     * Mặc định 30 ngày.
     */
    public List<ProductBatchResponse> getExpiringBatches(int daysAhead) {
        LocalDate threshold = LocalDate.now().plusDays(daysAhead);
        return batchRepo.findExpiringBatches(threshold)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Lô đã HẾT HẠN mà vẫn còn hàng tồn → cần xử lý / tiêu hủy.
     */
    public List<ProductBatchResponse> getExpiredBatchesWithStock() {
        return batchRepo.findExpiredWithStock(LocalDate.now())
                .stream().map(this::toResponse).toList();
    }

    /** Chi tiết 1 lô theo ID */
    public ProductBatchResponse getBatchById(Long id) {
        return toResponse(batchRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy lô hàng ID: " + id)));
    }

    public void assertBatchDatesMutable(Long batchId) {
        ProductBatch batch = batchRepo.findById(batchId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy lô hàng ID: " + batchId));
        String guidance = "Không được sửa HSD/NSX lô đã phát sinh xuất kho. " +
                "Dùng phiếu điều chỉnh gắn sourceBatchId để xuất phần còn lại, " +
                "rồi nhập lại lô mới với HSD đúng.";
        if (batch.getImportQty() > batch.getRemainingQty()) {
            throw new IllegalStateException(guidance);
        }
        if (allocationRepo.existsByBatch_Id(batchId)) {
            throw new IllegalStateException(guidance);
        }
    }

    // ─── Internal helpers (dùng bởi InventoryReceiptService & InvoiceService) ─

    /**
     * [ATOMIC] Tính weighted average cost VÀ trừ tồn kho FEFO trong cùng 1 transaction
     * với PESSIMISTIC WRITE LOCK (SELECT ... FOR UPDATE).
     *
     * FIX BUG #1 — Race Condition:
     *   Code cũ query DB 2 lần riêng (computeAvgCost + deductStock). Giữa 2 lần,
     *   request khác có thể đã deduct → costSnapshot tính trên dữ liệu cũ → SAI.
     *   Method này lock row trước, tính và trừ trên cùng 1 snapshot → luôn ĐÚNG.
     *
     * Ví dụ: bán 150 bịch
     *   Lô A còn 100 × 9.000đ → deduct 100, cost = 900.000
     *   Lô B còn 200 × 9.500đ → deduct  50, cost = 475.000
     *   → weighted avg = 1.375.000 / 150 = 9.166,67đ  ← chính xác 100%
     *
     * @param productId  sản phẩm cần trừ
     * @param qtyNeeded  số lượng bán (đơn vị bán lẻ)
     * @return weighted average cost per unit → ghi vào SalesInvoiceItem.unitCostSnapshot
     * @throws IllegalStateException nếu không đủ hàng trong các lô
     */
    @Transactional
    public BigDecimal deductStockFEFOAndComputeCost(Long productId, int qtyNeeded) {
        return deductStockFEFOWithTrace(productId, null, qtyNeeded).averageCost();
    }

    @Transactional
    public DeductionResult deductStockFEFOWithTrace(Long productId, Long variantId, int qtyNeeded) {
        if (qtyNeeded <= 0) return new DeductionResult(BigDecimal.ZERO, List.of());
        if (variantId == null) {
            // [Fix #4] Fallback to product-based FEFO — chỉ dùng khi không có variantId.
            // Log warning để dễ phát hiện code path cũ còn sót.
            log.warn("[Fix#4] deductStockFEFOAndComputeCost called with productId={} only — " +
                    "prefer overload with variantId for accuracy", productId);
            // Slice 3: sale path uses unified sellable predicate (active batch, non-expired, product+variant active)
            List<ProductBatch> batches = batchRepo.findSellableByProductIdForUpdateFefo(productId);
            DeductionResult result = deductFromBatches(batches, qtyNeeded, "productId=" + productId);
            batches.stream()
                    .map(ProductBatch::getVariant)
                    .filter(java.util.Objects::nonNull)
                    .map(v -> v.getId())
                    .distinct()
                    .forEach(stockMutationService::syncVariantStockWithBatches);
            return result;
        }
        return deductStockFEFOWithTraceByVariant(productId, variantId, qtyNeeded);
    }

    /**
     * [Sprint 0] FEFO theo variant_id — dùng khi có variant.
     * Ưu tiên dùng overload này thay vì theo productId để đảm bảo
     * đúng đơn vị bán lẻ (hủ vs gói không lẫn lộn).
     */
    @Transactional
    public BigDecimal deductStockFEFOAndComputeCost(Long productId, Long variantId, int qtyNeeded) {
        return deductStockFEFOWithTrace(productId, variantId, qtyNeeded).averageCost();
    }

    @Transactional
    public DeductionResult deductStockFEFOWithTraceByVariant(Long productId, Long variantId, int qtyNeeded) {
        if (variantId == null) return deductStockFEFOWithTrace(productId, null, qtyNeeded);
        if (qtyNeeded <= 0) return new DeductionResult(BigDecimal.ZERO, List.of());
        // Slice 3: sale FEFO uses unified sellable predicate; cancel/restore paths are unchanged
        List<ProductBatch> batches = batchRepo.findSellableByVariantIdForUpdateFefo(variantId);
        DeductionResult result = deductFromBatches(batches, qtyNeeded, "variantId=" + variantId);
        stockMutationService.syncVariantStockWithBatches(variantId);
        return result;
    }

    private DeductionResult deductFromBatches(List<ProductBatch> batches, int qtyNeeded, String ctx) {
        if (batches.isEmpty()) {
            // Sellable FEFO: no batch passes active + non-expired + product/variant active (+ status active)
            throw new IllegalStateException(
                "Không thể bán: " + ctx + " — không có lô hàng đủ điều kiện bán (còn hạn, trạng thái active, "
                        + "sản phẩm/variant còn bán). Kiểm tra hết hạn, khóa lô, hoặc tồn thực tế chưa đủ.");
        }
        BigDecimal totalCost = BigDecimal.ZERO;
        int remaining = qtyNeeded;
        List<BatchDeduction> deductions = new ArrayList<>();
        for (ProductBatch batch : batches) {
            if (remaining <= 0) break;
            int deduct = Math.min(batch.getRemainingQty(), remaining);
            if (deduct <= 0) continue;
            totalCost = totalCost.add(batch.getCostPrice().multiply(BigDecimal.valueOf(deduct)));
            batch.setRemainingQty(batch.getRemainingQty() - deduct);
            remaining -= deduct;
            deductions.add(new BatchDeduction(batch.getId(), deduct));
            batchRepo.save(batch);
            log.debug("FEFO deduct: batch={} {} deduct={} remaining={} cost={}",
                    batch.getBatchCode(), ctx, deduct, batch.getRemainingQty(), batch.getCostPrice());
        }
        if (remaining > 0)
            throw new IllegalStateException("Không đủ hàng đủ điều kiện bán: " + ctx +
                    " còn thiếu " + remaining + " đơn vị. " +
                    "Có thể tồn vật lý còn nhưng lô hết hạn, khóa, hoặc SP/variant ngừng bán, hoặc tồn không đồng bộ.");
        BigDecimal averageCost = totalCost.divide(BigDecimal.valueOf(qtyNeeded), 2, RoundingMode.HALF_UP);
        return new DeductionResult(averageCost, deductions);
    }

    /**
     * Hoàn lại tồn kho khi hủy hóa đơn (theo productId — backward compat).
     */
    @Transactional
    public void restoreStockOnCancel(Long productId, int qty) {
        restoreStockOnCancel(productId, null, qty);
    }

    /**
     * [Sprint 0] Hoàn tồn kho theo variant_id.
     * Ưu tiên dùng overload này khi có variantId.
     */
    @Transactional
    public void restoreStockOnCancel(Long productId, Long variantId, int qty) {
        List<ProductBatch> batches = variantId != null
                ? batchRepo.findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(variantId, -1)
                : batchRepo.findByProductIdOrderByExpiryDateAsc(productId);

        if (batches.isEmpty()) {
            log.warn("Không tìm thấy lô để hoàn hàng: productId={} variantId={} qty={}", productId, variantId, qty);
            return;
        }
        ProductBatch target = batches.stream()
                .filter(b -> !b.isExpired())
                .findFirst()
                .orElse(batches.get(0));
        target.setRemainingQty(target.getRemainingQty() + qty);
        batchRepo.save(target);
        if (variantId != null) {
            stockMutationService.syncVariantStockWithBatches(variantId);
        }
        log.debug("Restore stock: batch={} variantId={} qty=+{} newRemaining={}",
                target.getBatchCode(), variantId, qty, target.getRemainingQty());
    }

    // ─── Mapper ───────────────────────────────────────────────────────────────

    public ProductBatchResponse toResponse(ProductBatch b) {
        String sellUnit = b.getVariant() != null && b.getVariant().getSellUnit() != null
                ? b.getVariant().getSellUnit() : "cai";
        return new ProductBatchResponse(
                b.getId(),
                b.getBatchCode(),
                b.getProduct().getId(),
                b.getProduct().getCode(),
                b.getProduct().getName(),
                b.getProduct().getCategory() != null
                        ? b.getProduct().getCategory().getName() : "",
                sellUnit,
                b.getReceipt() != null ? b.getReceipt().getReceiptNo() : null,
                b.getMfgDate(),
                b.getExpiryDate(),
                b.daysUntilExpiry(),
                b.getImportQty(),
                b.getRemainingQty(),
                b.getCostPrice(),
                b.isExpired(),
                b.getStatus(),
                b.getCreatedAt()
        );
    }
}
