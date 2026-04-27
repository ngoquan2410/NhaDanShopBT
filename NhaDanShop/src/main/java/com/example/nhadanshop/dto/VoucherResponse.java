package com.example.nhadanshop.dto;

import java.time.LocalDateTime;

public record VoucherResponse(
        Long id,
        String code,
        String ruleSummary,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
