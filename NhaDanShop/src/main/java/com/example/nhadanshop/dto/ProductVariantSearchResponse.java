package com.example.nhadanshop.dto;

import com.example.nhadanshop.entity.Product;

import java.math.BigDecimal;

/**
 * Paginated admin/staff variant search row for transaction pickers (receipt, recipe, combo, stock adj, POS).
 */
public record ProductVariantSearchResponse(
        long variantId,
        String variantCode,
        String variantName,
        long productId,
        String productCode,
        String productName,
        Product.ProductType productType,
        boolean active,
        boolean isSellable,
        String sellUnit,
        String importUnit,
        Long categoryId,
        String categoryName,
        int stockQty,
        BigDecimal sellPrice,
        BigDecimal costPrice,
        int piecesPerUnit,
        int minStockQty,
        Integer expiryDays
) {
}
