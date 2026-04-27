package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Partial update (PATCH). Null = leave unchanged. */
public record ProductVariantPatchRequest(
        @Size(max = 60) String variantCode,
        @Size(max = 200) String variantName,
        @Size(max = 20) String sellUnit,
        @Size(max = 20) String importUnit,
        Integer piecesPerUnit,
        BigDecimal sellPrice,
        BigDecimal costPrice,
        Integer minStockQty,
        Integer expiryDays,
        Boolean isDefault,
        @Size(max = 500) String imageUrl,
        @Size(max = 100) String conversionNote,
        Boolean active,
        Boolean isSellable
) {}
