package com.example.nhadanshop.dto;

/**
 * Public storefront batch availability — aggregate only (no batch rows, stockQty, remainingQty, cost).
 */
public record PublicVariantAvailabilityRow(
        long variantId,
        int availableQty,
        String availabilityStatus,
        String sellUnit
) {}
