package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record PromotionAffectedLineDto(
        String lineId,
        String productId,
        String variantId,
        @Size(max = 255) String productName,
        @Size(max = 255) String variantName,
        Integer eligibleQty,
        BigDecimal discountedAmount,
        Integer rewardQty,
        @Size(max = 255) String note
) {}
