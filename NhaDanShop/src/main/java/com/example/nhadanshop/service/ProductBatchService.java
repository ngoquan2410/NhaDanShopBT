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
     * Trừ tồn kho theo FEFO (First Expired First Out).
     * Gọi khi tạo hóa đơn bán hàng.
     *
     * @param productId   sản phẩm cần trừ
     * @param qtyNeeded   số lượng bán (đơn vị bán lẻ)
     * @throws IllegalStateException nếu không đủ hàng trong các lô
     */
    @Transactional
    public void deductStockFEFO(Long productId, int qtyNeeded) {
        List<ProductBatch> batches = batchRepo
                .findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(productId, 0);

        int remaining = qtyNeeded;
        for (ProductBatch batch : batches) {
            if (remaining <= 0) break;
            int deduct = Math.min(batch.getRemainingQty(), remaining);
            batch.setRemainingQty(batch.getRemainingQty() - deduct);
            remaining -= deduct;
            batchRepo.save(batch);
            log.debug("FEFO deduct: batch={} productId={} deduct={} remaining={}",
                    batch.getBatchCode(), productId, deduct, batch.getRemainingQty());
        }

        if (remaining > 0) {
            throw new IllegalStateException(
                    "Lỗi đồng bộ lô hàng: productId=" + productId +
                    " còn thiếu " + remaining + " đơn vị trong các lô");
        }
    }

    /**
     * Tính giá vốn bình quân gia quyền (weighted average cost) từ các lô FEFO
     * sẽ được deduct khi bán {@code qtyNeeded} đơn vị.
     * Dùng để set unitCostSnapshot chính xác trong SalesInvoiceItem.
     *
     * Ví dụ: bán 15 bịch
     *   lô A còn 10 bịch, costPrice=9000  → dùng 10 bịch
     *   lô B còn 20 bịch, costPrice=9500  → dùng 5 bịch
     *   → weighted avg = (10*9000 + 5*9500) / 15 = 9166.67
     */
    @Transactional(readOnly = true)
    public BigDecimal computeWeightedAvgCostFEFO(Long productId, int qtyNeeded) {
        List<ProductBatch> batches = batchRepo
                .findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(productId, 0);

        BigDecimal totalCost = BigDecimal.ZERO;
        int remaining = qtyNeeded;

        for (ProductBatch batch : batches) {
            if (remaining <= 0) break;
            int take = Math.min(batch.getRemainingQty(), remaining);
            totalCost = totalCost.add(batch.getCostPrice().multiply(BigDecimal.valueOf(take)));
            remaining -= take;
        }

        if (qtyNeeded <= 0) return BigDecimal.ZERO;
        // Nếu không đủ lô (edge case), fallback về giá vốn lô đầu tiên
        int actualQty = qtyNeeded - Math.max(remaining, 0);
        if (actualQty <= 0) return batches.isEmpty() ? BigDecimal.ZERO : batches.get(0).getCostPrice();
        return totalCost.divide(BigDecimal.valueOf(actualQty), 2, RoundingMode.HALF_UP);
    }

    /**
     * Hoàn lại tồn kho vào lô gần nhất khi huỷ hóa đơn.
     * Chiến lược: cộng lại vào lô có expiryDate xa nhất (hàng vừa bán).
     */
    @Transactional
    public void restoreStockOnCancel(Long productId, int qty) {
        List<ProductBatch> batches = batchRepo
                .findByProductIdOrderByExpiryDateAsc(productId);

        // Tìm lô có hết hạn xa nhất còn active (không expired hẳn)
        ProductBatch target = batches.stream()
                .filter(b -> !b.isExpired())
                .reduce((first, second) -> second) // lấy cuối (xa nhất)
                .orElse(batches.isEmpty() ? null : batches.get(batches.size() - 1));

        if (target != null) {
            target.setRemainingQty(target.getRemainingQty() + qty);
            batchRepo.save(target);
            log.debug("Restore stock: batch={} productId={} qty=+{}",
                    target.getBatchCode(), productId, qty);
        } else {
            log.warn("Không tìm thấy lô để hoàn hàng: productId={} qty={}", productId, qty);
        }
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
