package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response thống kê doanh thu theo sản phẩm.
 * {@code totalAmount} matches {@link #merchandiseNetRevenue}: allocated net merchandise (after invoice-level
 * discount smear at line), legacy rows fallback to qty×post-line unit price.
 */
public record RevenueByProductDto(
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        List<RevenueRowDto> rows,
        BigDecimal totalAmount,
        Long totalQty,
        BigDecimal merchandiseNetRevenue,
        BigDecimal merchandiseAllocatedDiscountTotal,
        BigDecimal merchandiseCost,
        BigDecimal merchandiseNetProfit
) {}
