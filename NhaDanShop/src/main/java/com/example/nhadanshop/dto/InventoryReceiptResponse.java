package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record InventoryReceiptResponse(
        Long id,
        String receiptNo,
        LocalDateTime receiptDate,
        String supplierName,
        String note,
        BigDecimal totalAmount,
        String createdBy,
        List<InventoryReceiptItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
