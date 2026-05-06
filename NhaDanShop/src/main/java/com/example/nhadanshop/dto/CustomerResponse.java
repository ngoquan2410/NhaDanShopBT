package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CustomerResponse(
        Long id,
        String code,
        String name,
        String phone,
        String address,
        String email,
        String group,
        BigDecimal totalSpend,
        BigDecimal debt,
        Long orderCount,
        LocalDateTime lastPurchaseAt,
        String note,
        Boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
