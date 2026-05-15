package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

public record PromotionProgressSnapshotDto(
        String type,
        String basis,
        BigDecimal currentAmount,
        BigDecimal remainingAmount,
        BigDecimal requiredAmount,
        List<PromotionProgressItemDto> items
) {}
