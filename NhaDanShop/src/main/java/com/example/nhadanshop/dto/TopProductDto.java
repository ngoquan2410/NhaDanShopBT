package com.example.nhadanshop.dto;

import java.math.BigDecimal;

/**
 * Sản phẩm/variant bán chạy nhất trong kỳ — Sprint 2 S2-2.
 *
 * totalQty    = tổng số lượng bán trong kỳ
 * totalRevenue = tổng doanh thu (qty × unitPrice sau chiết khấu)
 * totalProfit  = tổng lợi nhuận gộp (revenue - cost)
 * rank         = thứ hạng (1 = bán chạy nhất)
 */
public record TopProductDto(
        int rank,
        Long variantId,
        String variantCode,
        String variantName,
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        Long totalQty,
        BigDecimal totalRevenue,
        BigDecimal totalProfit
) {}
