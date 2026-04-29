package com.example.nhadanshop.dto;

import java.math.BigDecimal;

/**
 * Sản phẩm/variant trong kỳ — ranked by persisted merchandise net revenue.
 *
 * {@code totalRevenue} Σ {@code COALESCE(lineNetRevenue, qty×unitPrice)} — allocated net when persisted.
 * {@code totalProfit} Σ (net revenue − line COGS).
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
