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
        List<ComboItemResponse> items,
        /** Tổng giá bán lẻ từng thành phần (so sánh tiết kiệm được bao nhiêu) */
        BigDecimal totalComponentRetailPrice,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record ComboItemResponse(
            Long id,
            Long productId,
            String productCode,
            String productName,
            String unit,
            Integer quantity,
            BigDecimal unitSellPrice,
            BigDecimal lineTotal
    ) {}
}
