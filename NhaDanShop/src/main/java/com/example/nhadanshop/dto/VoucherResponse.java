package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record VoucherResponse(
        Long id,
        String code,
        String ruleSummary,
        boolean active,
        BigDecimal minSubtotal,
        BigDecimal percent,
        BigDecimal cap,
        BigDecimal fixedAmount,
        boolean freeShipping,
        LocalDateTime startAt,
        LocalDateTime endAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
