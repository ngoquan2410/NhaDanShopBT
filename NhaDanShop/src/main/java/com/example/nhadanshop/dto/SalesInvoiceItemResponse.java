package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record SalesInvoiceItemResponse(
        Long id,
        Long productId,
        String productCode,
        String productName,
        String unit,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal unitCostSnapshot,
        BigDecimal lineTotal,
        BigDecimal profit
) {}
