package com.example.nhadanshop.dto;

import java.time.LocalDateTime;

/**
 * Variant bán chậm / không có giao dịch trong N ngày — Sprint 2 S2-2.
 *
 * lastSaleDate   = lần bán cuối cùng (null = chưa bao giờ bán)
 * daysWithoutSale = số ngày kể từ lần bán cuối (null = chưa bán bao giờ)
 */
public record SlowProductDto(
        Long variantId,
        String variantCode,
        String variantName,
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        Integer stockQty,
        LocalDateTime lastSaleDate,
        Long daysWithoutSale   // null = chưa bán bao giờ
) {}
