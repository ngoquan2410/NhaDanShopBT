package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductBatchResponse;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductBatchService {

    private final ProductBatchRepository batchRepo;
    private final ProductRepository productRepo;

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
        if (qtyNeeded <= 0) return BigDecimal.ZERO;

        // PESSIMISTIC WRITE LOCK: DB khoá các row lại, request khác phải chờ
        List<ProductBatch> batches = batchRepo.findByProductIdForUpdateFEFO(productId);

        BigDecimal totalCost = BigDecimal.ZERO;
        int remaining = qtyNeeded;

        for (ProductBatch batch : batches) {
            if (remaining <= 0) break;
            int deduct = Math.min(batch.getRemainingQty(), remaining);
            totalCost = totalCost.add(batch.getCostPrice().multiply(BigDecimal.valueOf(deduct)));
            batch.setRemainingQty(batch.getRemainingQty() - deduct);
            remaining -= deduct;
            batchRepo.save(batch);
            log.debug("FEFO deduct+cost: batch={} productId={} deduct={} batchRemaining={} costPrice={}",
                    batch.getBatchCode(), productId, deduct, batch.getRemainingQty(), batch.getCostPrice());
        }

        if (remaining > 0) {
            throw new IllegalStateException(
                    "Lỗi đồng bộ lô hàng: productId=" + productId +
                    " còn thiếu " + remaining + " đơn vị. Kiểm tra lại tồn kho.");
        }

        // Weighted average = tổng(qty × cost) / tổng qty deducted
        return totalCost.divide(BigDecimal.valueOf(qtyNeeded), 2, RoundingMode.HALF_UP);
    }

    /**
     * Hoàn lại tồn kho khi hủy hóa đơn.
     *
     * FIX BUG #2 — Restore sai lô:
     *   Code cũ hoàn vào lô XA NHẤT (reduce lấy phần tử cuối).
     *   Nhưng FEFO bán từ lô GẦN NHẤT trước → phải hoàn về lô GẦN NHẤT.
     *   Nếu hoàn sai lô, lần bán tiếp theo FEFO sẽ tính costSnapshot sai.
     */
    @Transactional
    public void restoreStockOnCancel(Long productId, int qty) {
        List<ProductBatch> batches = batchRepo.findByProductIdOrderByExpiryDateAsc(productId);

        if (batches.isEmpty()) {
            log.warn("Không tìm thấy lô để hoàn hàng: productId={} qty={}", productId, qty);
            return;
        }

        // Hoàn về lô GẦN HẾT HẠN NHẤT (expiryDate ASC → phần tử đầu tiên)
        // vì đó là lô FEFO đã bán trước → hoàn đúng lô
        ProductBatch target = batches.stream()
                .filter(b -> !b.isExpired())
                .findFirst()                          // ← lô gần nhất, KHÔNG phải xa nhất
                .orElse(batches.get(0));              // fallback nếu tất cả đã expired

        target.setRemainingQty(target.getRemainingQty() + qty);
        batchRepo.save(target);
        log.debug("Restore stock: batch={} productId={} qty=+{} newRemaining={}",
                target.getBatchCode(), productId, qty, target.getRemainingQty());
    }

    // ─── Mapper ───────────────────────────────────────────────────────────────

    public ProductBatchResponse toResponse(ProductBatch b) {
        String sellUnit = b.getProduct().getSellUnit() != null
                ? b.getProduct().getSellUnit()
                : b.getProduct().getUnit();
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
                b.getCreatedAt()
        );
    }
}
