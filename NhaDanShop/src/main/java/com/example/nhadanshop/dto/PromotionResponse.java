package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PromotionResponse(
        Long id,
        String name,
        String description,
        String type,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        BigDecimal maxDiscount,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Boolean active,
        boolean currentlyActive,
        String appliesTo,
        List<Long> categoryIds,
        List<String> categoryNames,
        List<Long> productIds,
        List<String> productNames,
        // BUY_X_GET_Y
        Integer buyQty,
        Long getProductId,
        String getProductName,
        Integer getQty,
        // QUANTITY_GIFT
        Integer minBuyQty,
        Integer maxBuyQty,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
