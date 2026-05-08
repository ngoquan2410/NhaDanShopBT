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
        /** Physical / ledger aggregate stock on the variant. */
        Integer stockQty,
        /**
         * Tồn có thể bán online/POS (lô active, chưa hết hạn, variant sellable). Null nếu backend chưa tính.
         */
        Integer sellableStockQty,
        Integer minStockQty,
        boolean lowStock,      // stockQty <= minStockQty
        Integer expiryDays,
        Boolean active,
        /** false = not for POS/online sale; still usable in inventory flows */
        Boolean isSellable,
        Boolean isDefault,
        String imageUrl,
        String conversionNote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
