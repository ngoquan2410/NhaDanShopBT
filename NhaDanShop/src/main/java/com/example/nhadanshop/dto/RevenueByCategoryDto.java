package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response thống kê doanh thu theo danh mục sản phẩm (merchandise net from persisted allocation fields).
 */
public record RevenueByCategoryDto(
        Long categoryId,
        String categoryName,
        List<RevenueRowDto> rows,
        BigDecimal totalAmount,
        BigDecimal merchandiseNetRevenue,
        BigDecimal merchandiseCost,
        BigDecimal merchandiseNetProfit
) {}
