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
        String minOrderScope,
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
        List<PromotionBuyItemResponse> buyItems,
        Boolean repeatable,
        Integer maxGiftApplications,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    /** Back-compat constructor for code paths/tests that omit buy-items fields. */
    public PromotionResponse(
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
            String minOrderScope,
            List<Long> categoryIds,
            List<String> categoryNames,
            List<Long> productIds,
            List<String> productNames,
            Integer buyQty,
            Long getProductId,
            String getProductName,
            Integer getQty,
            Integer minBuyQty,
            Integer maxBuyQty,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
        this(id, name, description, type, discountValue, minOrderValue, maxDiscount,
                startDate, endDate, active, currentlyActive, appliesTo, minOrderScope,
                categoryIds, categoryNames, productIds, productNames,
                buyQty, getProductId, getProductName, getQty,
                minBuyQty, maxBuyQty,
                List.of(),
                true,
                "QUANTITY_GIFT".equals(type) ? maxBuyQty : null,
                createdAt, updatedAt);
    }
}
