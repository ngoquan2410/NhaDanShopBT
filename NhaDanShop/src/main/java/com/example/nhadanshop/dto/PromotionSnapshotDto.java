package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record PromotionSnapshotDto(
        String promotionId,
        @Size(max = 255) String name,
        @Size(max = 50) String type,
        @Size(max = 500) String ruleSummary,
        BigDecimal discountAmount,
        BigDecimal shippingDiscountAmount,
        @Valid List<PromotionAffectedLineDto> affectedLines,
        @Valid List<GiftLineSnapshotDto> giftLines
) {}
