package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record PendingOrderItemResponse(
        Long productId,
        String productName,
        String unit,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        // Sprint 0 — variant fields
        Long variantId,
        String variantCode,
        String variantName,
        String sellUnit
) {}
