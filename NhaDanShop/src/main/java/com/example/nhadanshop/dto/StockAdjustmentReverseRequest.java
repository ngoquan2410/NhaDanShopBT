package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

/**
 * Optional body for {@code POST /api/stock-adjustments/{id}/reverse}.
 */
public record StockAdjustmentReverseRequest(
        @Size(max = 2000) String reason,
        @Size(max = 100) String reversedBy
) {}
