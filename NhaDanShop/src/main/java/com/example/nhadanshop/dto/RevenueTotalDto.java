package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response thống kê tổng doanh thu (tất cả sản phẩm gộp lại) theo kỳ.
 * rows: danh sách kỳ (ngày / tuần / tháng / năm) → label + amount
 * totalAmount: tổng tất cả
 */
public record RevenueTotalDto(
        String period,          // "daily" | "weekly" | "monthly" | "yearly"
        String fromDate,
        String toDate,
        List<RevenueRowDto> rows,
        BigDecimal totalAmount
) {}
