package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

/**
 * Frozen line snapshot inside a sales quote (pricing + optional stock trace).
 * {@code batchId} is stock-allocation only; unit prices come from backend quote engine.
 */
public record SalesQuoteCapturedLineDto(
        Long productId,
        Long variantId,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal lineSubtotal,
        BigDecimal discountPercent,
        Long batchId,
        boolean rewardLine,
        /** Catalog sell price snapshot; used for reward lines (revenue line price is zero). */
        BigDecimal originalUnitPrice,
        /**
         * Per-line commercial allocation from {@code CommercialPricingEngine.computeMerchandiseQuoteAllocation}.
         * Null on legacy quote payloads and reward lines / non-billable lines.
         */
        @JsonInclude(JsonInclude.Include.NON_NULL)
        CommercialLineSnapshotDto commercialSnapshot
) {}
