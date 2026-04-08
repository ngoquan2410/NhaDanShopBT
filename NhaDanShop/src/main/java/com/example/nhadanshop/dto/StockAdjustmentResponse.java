package com.example.nhadanshop.dto;

import java.time.LocalDateTime;
import java.util.List;

public record StockAdjustmentResponse(
        Long id,
        String adjNo,
        LocalDateTime adjDate,
        String reason,
        String note,
        String status,
        String createdBy,
        String confirmedBy,
        LocalDateTime confirmedAt,
        List<ItemResponse> items,
        LocalDateTime createdAt
) {
    public record ItemResponse(
            Long id,
            Long variantId,
            String variantCode,
            String variantName,
            String productCode,
            String productName,
            String sellUnit,
            Integer systemQty,
            Integer actualQty,
            Integer diffQty,
            String note
    ) {}
}
