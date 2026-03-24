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
        BigDecimal lineTotal
) {}
