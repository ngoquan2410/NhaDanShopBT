package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProductVariantResponse(
        Long id,
        Long productId,
        String productCode,   // snapshot product.code
        String productName,   // snapshot product.name
        String variantCode,
        String variantName,
        String sellUnit,
        String importUnit,
        Integer piecesPerUnit,
        BigDecimal sellPrice,
        BigDecimal costPrice,
        Integer stockQty,
        Integer minStockQty,
        boolean lowStock,      // stockQty <= minStockQty
        Integer expiryDays,
        Boolean active,
        Boolean isDefault,
        String imageUrl,
        String conversionNote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
