package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response thống kê doanh thu theo danh mục sản phẩm.
 */
public record RevenueByCategoryDto(
        Long categoryId,
        String categoryName,
        List<RevenueRowDto> rows,
        BigDecimal totalAmount
) {}
