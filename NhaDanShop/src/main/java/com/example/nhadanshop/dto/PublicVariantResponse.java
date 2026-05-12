package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record PublicVariantResponse(
        Long id,
        String variantCode,
        String variantName,
        String sellUnit,
        BigDecimal sellPrice,
        String imageUrl,
        Boolean isDefault
) {}
