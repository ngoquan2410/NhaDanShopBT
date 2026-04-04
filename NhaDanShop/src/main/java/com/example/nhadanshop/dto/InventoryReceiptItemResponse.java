package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record InventoryReceiptItemResponse(
        Long id,
        Long productId,
        String productCode,
        String productName,
        String unit,
        Integer quantity,
        BigDecimal unitCost,
        BigDecimal discountPercent,
        BigDecimal discountedCost,
        BigDecimal vatPercent,
        BigDecimal vatAllocated,
        BigDecimal shippingAllocated,
        BigDecimal finalCost,
        BigDecimal finalCostWithVat,
        BigDecimal lineTotal,
        String importUnitUsed,
        Integer piecesUsed,
        Integer retailQtyAdded,
        // Sprint 0 — variant fields
        Long variantId,
        String variantCode,
        String variantName,
        String sellUnit
) {}


