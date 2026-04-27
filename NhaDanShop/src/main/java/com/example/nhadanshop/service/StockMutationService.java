package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.InventoryMovement;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.InventoryMovementRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class StockMutationService {

    private final ProductVariantRepository variantRepo;
    private final ProductBatchRepository batchRepo;
    private final InventoryMovementRepository movementRepo;
    private final Clock businessClock;

    public record BatchStockChange(Long batchId, Integer deltaRemainingQty, ProductBatch newBatch) {
        public static BatchStockChange delta(Long batchId, int deltaRemainingQty) {
            return new BatchStockChange(batchId, deltaRemainingQty, null);
        }

        public static BatchStockChange create(ProductBatch newBatch) {
            return new BatchStockChange(null, null, newBatch);
        }
    }

    @Transactional
    public void updateStockWithBatches(Long variantId, List<BatchStockChange> changes) {
        ProductVariant variant = variantRepo.findByIdForUpdate(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));

        List<ProductBatch> lockedBatches = batchRepo.findAllByVariantIdForUpdate(variantId);
        Map<Long, ProductBatch> batchById = new HashMap<>();
        for (ProductBatch batch : lockedBatches) {
            batchById.put(batch.getId(), batch);
        }

        if (changes != null) {
            for (BatchStockChange change : changes) {
                if (change == null) continue;

                if (change.newBatch() != null) {
                    ProductBatch newBatch = change.newBatch();
                    newBatch.setVariant(variant);
                    if (newBatch.getProduct() == null) {
                        newBatch.setProduct(variant.getProduct());
                    }
                    if (newBatch.getRemainingQty() < 0 || newBatch.getImportQty() < 0) {
                        throw new IllegalStateException("remaining_qty/import_qty không được âm cho variant " + variantId);
                    }
                    ProductBatch saved = batchRepo.save(newBatch);
                    lockedBatches.add(saved);
                    continue;
                }

                if (change.batchId() == null || change.deltaRemainingQty() == null) {
                    continue;
                }

                ProductBatch batch = batchById.get(change.batchId());
                if (batch == null) {
                    throw new EntityNotFoundException("Không tìm thấy batch ID: " + change.batchId() + " của variant " + variantId);
                }

                int newRemaining = batch.getRemainingQty() + change.deltaRemainingQty();
                if (newRemaining < 0) {
                    throw new IllegalStateException(
                            "Batch " + batch.getBatchCode() + " không đủ tồn để cập nhật. remaining=" +
                                    batch.getRemainingQty() + ", delta=" + change.deltaRemainingQty());
                }

                batch.setRemainingQty(newRemaining);
                batchRepo.save(batch);
            }
        }

        recalcAndAssertInvariant(variant);
    }

    @Transactional
    public void syncVariantStockWithBatches(Long variantId) {
        ProductVariant variant = variantRepo.findByIdForUpdate(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
        batchRepo.findAllByVariantIdForUpdate(variantId);
        recalcAndAssertInvariant(variant);
    }

    /**
     * CRIT-006: kiểm tra bắt buộc {@code variant.stockQty == SUM(batch.remainingQty)} sau khi đã lock
     * variant + toàn bộ lô của variant. Ghi audit ERROR rồi ném lỗi nếu lệch.
     * Dùng sau các giao dịch có thể làm lệch tồn (ví dụ đường cũ sửa DB trực tiếp) hoặc để xác minh post-condition.
     */
    @Transactional
    public void verifyVariantStockInvariant(Long variantId) {
        ProductVariant variant = variantRepo.findByIdForUpdate(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
        verifyLockedVariantMatchesBatchSum(variant);
    }

    /**
     * Append-only inventory ledger foundation.
     *
     * This records intent/evidence only; it deliberately does not mutate batch
     * quantities or {@code ProductVariant.stockQty}. Future Slice 3 phases should
     * call this from the same transaction as the stock mutation they are recording.
     */
    @Transactional
    public InventoryMovement appendMovement(
            Long variantId,
            Long batchId,
            int qtyDelta,
            String sourceType,
            String sourceId,
            String note
    ) {
        if (variantId == null) {
            throw new IllegalArgumentException("variantId is required");
        }
        if (qtyDelta == 0) {
            throw new IllegalArgumentException("qtyDelta must be non-zero");
        }
        if (!StringUtils.hasText(sourceType)) {
            throw new IllegalArgumentException("sourceType is required");
        }
        if (!StringUtils.hasText(sourceId)) {
            throw new IllegalArgumentException("sourceId is required");
        }

        ProductVariant variant = variantRepo.findById(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));

        ProductBatch batch = null;
        if (batchId != null) {
            batch = batchRepo.findById(batchId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy batch ID: " + batchId));
            Long batchVariantId = batch.getVariant() == null ? null : batch.getVariant().getId();
            if (!variantId.equals(batchVariantId)) {
                throw new IllegalArgumentException("Batch " + batchId + " không thuộc variant " + variantId);
            }
        }

        InventoryMovement movement = new InventoryMovement();
        movement.setCreatedAt(LocalDateTime.now(businessClock));
        movement.setVariant(variant);
        movement.setBatch(batch);
        movement.setQtyDelta(qtyDelta);
        movement.setSourceType(sourceType.trim());
        movement.setSourceId(sourceId.trim());
        movement.setNote(StringUtils.hasText(note) ? note.trim() : null);
        return movementRepo.save(movement);
    }

    private void recalcAndAssertInvariant(ProductVariant variant) {
        int sumRemaining = batchRepo.sumRemainingQtyByVariantId(variant.getId());
        variant.setStockQty(sumRemaining);
        variant.setUpdatedAt(LocalDateTime.now(businessClock));
        variantRepo.save(variant);
        verifyLockedVariantMatchesBatchSum(variant);
    }

    /**
     * Giả định {@code variant} đã được lock FOR UPDATE (cùng transaction).
     */
    private void verifyLockedVariantMatchesBatchSum(ProductVariant variant) {
        Long variantId = variant.getId();
        batchRepo.findAllByVariantIdForUpdate(variantId);
        int sumRemaining = batchRepo.sumRemainingQtyByVariantId(variantId);
        int stockQty = variant.getStockQty() == null ? 0 : variant.getStockQty();
        if (stockQty != sumRemaining) {
            log.error(
                    "[INVENTORY-INVARIANT-AUDIT] stockQty mismatch variantId={} stockQty={} sumBatchRemainingQty={}",
                    variantId, stockQty, sumRemaining);
            throw new IllegalStateException(
                    "Invariant lỗi cho variant " + variantId +
                            ": stockQty=" + stockQty + ", sum(batch)=" + sumRemaining);
        }
    }
}
