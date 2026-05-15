package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record PublicVariantResponse(
        Long id,
        String variantCode,
        String variantName,
        String sellUnit,
        BigDecimal sellPrice,
        String imageUrl,
        Boolean isDefault,
        /** Aggregate sellable remaining units (batch sum); public-safe, not raw batch rows. */
        int availableQty,
        /** IN_STOCK | LOW_STOCK | OUT_OF_STOCK — derived server-side from availableQty vs min threshold. */
        String availabilityStatus
) {}
