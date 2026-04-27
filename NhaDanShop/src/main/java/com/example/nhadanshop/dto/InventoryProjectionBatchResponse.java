package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record InventoryProjectionBatchResponse(
        Long batchId,
        String batchCode,
        int qty,
        BigDecimal costPrice,
        LocalDate expiryDate,
        Long receiptId,
        LocalDateTime createdAt
) {}
