package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PendingOrderItemResponse(
        Long productId,
        String productName,
        String unit,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {}
