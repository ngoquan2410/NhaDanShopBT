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
        BigDecimal finalCost,           // sau CK + ship (trước VAT)
        BigDecimal finalCostWithVat,    // giá vốn cuối = sau CK + ship + VAT
        BigDecimal lineTotal
) {}
