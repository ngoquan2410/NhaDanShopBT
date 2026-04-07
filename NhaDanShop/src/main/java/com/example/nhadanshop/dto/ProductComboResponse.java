package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record ProductComboResponse(
        Long id,
        String code,
        String name,
        String description,
        BigDecimal sellPrice,
        Boolean active,
        Integer stockQty,          // virtual stock = min(component/qty)
        String imageUrl,
        Long categoryId,
        String categoryName,
        List<ComboItemResponse> items,
        /** Tổng giá bán lẻ từng thành phần (so sánh tiết kiệm được bao nhiêu) */
        BigDecimal totalComponentRetailPrice,
        BigDecimal totalComponentCost,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record ComboItemResponse(
            Long id,
            Long productId,
            String productCode,
            String productName,
            String sellUnit,
            Integer quantity,
            BigDecimal unitSellPrice,
            BigDecimal lineTotal,
            BigDecimal lineCost
    ) {}
}
