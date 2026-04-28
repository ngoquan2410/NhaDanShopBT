package com.example.nhadanshop.dto;

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
        BigDecimal originalUnitPrice
) {}
