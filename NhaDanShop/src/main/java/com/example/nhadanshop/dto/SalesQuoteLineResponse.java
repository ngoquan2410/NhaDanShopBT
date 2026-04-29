package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

public record SalesQuoteLineResponse(
        Long productId,
        Long variantId,
        String productName,
        String variantName,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal lineSubtotal,
        BigDecimal discountPercent,
        Long batchId,
        boolean rewardLine,
        BigDecimal originalUnitPrice,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        CommercialLineSnapshotDto commercialSnapshot
) {}
