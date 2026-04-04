package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record SalesInvoiceItemResponse(
        Long id,
        Long productId,
        String productCode,
        String productName,
        String unit,
        Integer quantity,
        BigDecimal originalUnitPrice,   // giá gốc trước CK dòng
        BigDecimal lineDiscountPercent, // % CK dòng
        BigDecimal unitPrice,           // giá thực tế sau CK dòng
        BigDecimal unitCostSnapshot,
        BigDecimal lineTotal,           // = unitPrice × quantity
        BigDecimal profit,               // = (unitPrice - costSnapshot) × quantity
        // Sprint 0 — variant fields
        Long variantId,
        String variantCode,
        String variantName,
        String sellUnit       // đơn vị bán lẻ của variant
) {}
