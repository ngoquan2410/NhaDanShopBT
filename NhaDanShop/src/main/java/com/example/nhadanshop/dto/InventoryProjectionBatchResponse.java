package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record InventoryProjectionBatchResponse(
        Long batchId,
        String batchCode,
        String status,
        int qty,
        BigDecimal costPrice,
        LocalDate expiryDate,
        Long receiptId,
        LocalDateTime createdAt
) {}
