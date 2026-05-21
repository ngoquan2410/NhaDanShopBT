package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CategoryRevenueSeriesDto(
        String periodKey,
        String periodLabel,
        LocalDate periodStart,
        LocalDate periodEnd,
        Long categoryId,
        String categoryName,
        BigDecimal revenue
) {}
