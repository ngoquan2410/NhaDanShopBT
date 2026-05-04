package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PosScanResponse;
import com.example.nhadanshop.dto.ProductVariantResponse;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;

@Service
@RequiredArgsConstructor
public class PosScanService {

    private static final String PREFIX = "BATCH:";

    private final ProductBatchRepository batchRepo;
    private final ProductVariantService variantService;
    private final Clock businessClock;

    /**
     * No class-level transaction: a variant lookup that throws {@link EntityNotFoundException} must not join an
     * outer read/write transaction (would mark it rollback-only and yield HTTP 500 after the exception is caught).
     * Batch path uses {@link ProductBatchRepository} which runs in its own persistence context per call.
     */
    public PosScanResponse scan(String rawCode) {
        String code = rawCode == null ? "" : rawCode.replace("\r", "").replace("\n", "").trim();
        if (code.isBlank()) {
            return blockedVariant(null, "EMPTY_CODE", "Thiếu mã quét.");
        }

        if (code.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
            return scanBatchPayload(code.substring(PREFIX.length()).trim());
        }

        try {
            ProductVariantResponse v = variantService.getVariantByCode(code);
            boolean va = Boolean.TRUE.equals(v.active());
            boolean vs = Boolean.TRUE.equals(v.isSellable());
            return new PosScanResponse(
                    "variant",
                    v.productId(),
                    v.productName(),
                    Boolean.TRUE.equals(v.active()),
                    v.id(),
                    v.variantCode(),
                    v.variantName(),
                    va,
                    vs,
                    v.sellPrice(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    true,
                    va && vs,
                    null,
                    v.stockQty()
            );
        } catch (EntityNotFoundException ex) {
            return blockedVariant(code, "NOT_FOUND", ex.getMessage());
        }
    }

    private PosScanResponse scanBatchPayload(String idPart) {
        if (idPart.isBlank()) {
            return blockedBatch(null, "BATCH_ID_MISSING", "Thiếu batchId trong mã BATCH:{batchId}.");
        }
        long batchId;
        try {
            batchId = Long.parseLong(idPart);
        } catch (NumberFormatException ex) {
            return blockedBatch(null, "BATCH_ID_INVALID", "batchId không hợp lệ: " + idPart);
        }

        ProductBatch batch = batchRepo.findByIdWithVariantAndProduct(batchId).orElse(null);
        if (batch == null) {
            return blockedBatch(batchId, "BATCH_NOT_FOUND", "Không tìm thấy lô hàng ID: " + batchId);
        }

        ProductVariant v = batch.getVariant();
        if (v == null) {
            return blockedBatch(batchId, "BATCH_NO_VARIANT", "Lô hàng không gắn variant.");
        }

        var p = v.getProduct();
        boolean productActive = Boolean.TRUE.equals(p.getActive());
        boolean variantActive = Boolean.TRUE.equals(v.getActive());
        boolean variantSellable = Boolean.TRUE.equals(v.getIsSellable());

        LocalDate today = LocalDate.now(businessClock);
        boolean nonExpired = !batch.getExpiryDate().isBefore(today);
        boolean batchStatusOk = ProductBatch.STATUS_ACTIVE.equals(batch.getStatus());
        boolean hasQty = batch.getRemainingQty() > 0;

        boolean batchActiveForSale = batchStatusOk && nonExpired && hasQty && productActive && variantActive && variantSellable;

        String blockReason = null;
        if (!batchStatusOk) {
            blockReason = "Lô không ở trạng thái active.";
        } else if (!nonExpired) {
            blockReason = "Lô đã hết hạn.";
        } else if (!hasQty) {
            blockReason = "Lô không còn tồn.";
        } else if (!productActive) {
            blockReason = "Sản phẩm đã ngừng kinh doanh.";
        } else if (!variantActive) {
            blockReason = "Variant đã ngừng kinh doanh.";
        } else if (!variantSellable) {
            blockReason = "Variant không bán lẻ (isSellable=false).";
        }

        return new PosScanResponse(
                "batch",
                p.getId(),
                p.getName(),
                productActive,
                v.getId(),
                v.getVariantCode(),
                v.getVariantName(),
                variantActive,
                variantSellable,
                v.getSellPrice(),
                batch.getId(),
                batch.getBatchCode(),
                batch.getExpiryDate(),
                batch.getRemainingQty(),
                batch.getStatus(),
                batchActiveForSale,
                batchActiveForSale,
                blockReason,
                null
        );
    }

    private static PosScanResponse blockedVariant(String code, String reasonKey, String message) {
        return new PosScanResponse(
                "variant",
                null,
                null,
                false,
                null,
                code,
                null,
                false,
                false,
                BigDecimal.ZERO,
                null,
                null,
                null,
                null,
                null,
                false,
                false,
                reasonKey + ": " + message,
                null
        );
    }

    private static PosScanResponse blockedBatch(Long batchId, String reasonKey, String message) {
        return new PosScanResponse(
                "batch",
                null,
                null,
                false,
                null,
                null,
                null,
                false,
                false,
                BigDecimal.ZERO,
                batchId,
                null,
                null,
                null,
                null,
                false,
                false,
                reasonKey + ": " + message,
                null
        );
    }
}
