package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Slice 6B — unified POS scan payload for batch barcodes and legacy variant/product codes.
 */
public record PosScanResponse(
        String kind,
        Long productId,
        String productName,
        boolean productActive,
        Long variantId,
        String variantCode,
        String variantName,
        boolean variantActive,
        boolean variantSellable,
        BigDecimal price,
        Long batchId,
        String batchCode,
        LocalDate expiryDate,
        Integer remainingQty,
        String batchStatus,
        boolean batchActiveForSale,
        Boolean sellable,
        String blockReason
) {}
