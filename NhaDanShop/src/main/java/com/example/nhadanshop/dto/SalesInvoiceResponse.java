package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record SalesInvoiceResponse(
        Long id,
        String invoiceNo,
        LocalDateTime invoiceDate,
        String customerName,
        Long customerId,
        String note,
        BigDecimal totalAmount,
        BigDecimal discountAmount,
        BigDecimal finalAmount,
        String promotionName,
        BigDecimal totalProfit,
        String createdBy,
        List<SalesInvoiceItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        // ── Soft Cancel ────────────────────────────────────────
        String status,          // "COMPLETED" | "CANCELLED"
        LocalDateTime cancelledAt,
        String cancelledBy,
        String cancelReason
) {}


