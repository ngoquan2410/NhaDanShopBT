package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record InventoryReceiptResponse(
        Long id,
        String receiptNo,
        LocalDateTime receiptDate,
        String supplierName,
        Long supplierId,       // Sprint 1 S1-3: FK → suppliers
        String note,
        BigDecimal totalAmount,
        BigDecimal shippingFee,
        BigDecimal totalVat,
        String createdBy,
        List<InventoryReceiptItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
