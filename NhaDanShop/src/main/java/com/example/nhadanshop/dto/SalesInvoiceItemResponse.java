package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

public record SalesInvoiceItemResponse(
        Long id,
        Long productId,
        String productCode,
        String productName,
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
        String sellUnit,      // đơn vị bán lẻ của variant
        // Combo KiotViet — null = bán lẻ thường, not null = khai triển từ combo
        Long comboSourceId,
        String comboSourceCode,
        String comboSourceName,
        BigDecimal comboUnitPrice,  // giá bán của combo tại thời điểm giao dịch
        /** FEFO batch allocations; empty when none or not loaded. */
        List<SalesInvoiceItemAllocationResponse> allocations
) {}
