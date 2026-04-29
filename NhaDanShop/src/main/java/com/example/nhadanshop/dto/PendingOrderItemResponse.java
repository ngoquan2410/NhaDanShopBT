package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

public record PendingOrderItemResponse(
        String id,
        String productId,
        String variantId,
        String productName,
        String variantName,
        Integer qty,
        BigDecimal unitPrice,
        BigDecimal lineSubtotal,
        Long batchId,
        boolean rewardLine,
        BigDecimal originalUnitPrice,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        CommercialLineSnapshotDto commercialSnapshot
) {}
