package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record GiftLineSnapshotDto(
        String productId,
        String variantId,
        @Size(max = 255) String productName,
        @Size(max = 255) String variantName,
        Integer qty,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String promotionId,
        @Size(max = 255) String promotionName
) {}
