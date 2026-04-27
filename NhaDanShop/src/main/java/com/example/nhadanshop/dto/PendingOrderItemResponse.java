package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record PendingOrderItemResponse(
        String id,
        String productId,
        String variantId,
        String productName,
        String variantName,
        Integer qty,
        BigDecimal unitPrice,
        BigDecimal lineSubtotal
) {}
