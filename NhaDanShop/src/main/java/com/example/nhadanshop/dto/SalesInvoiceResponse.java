package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record SalesInvoiceResponse(
        Long id,
        String invoiceNo,
        LocalDateTime invoiceDate,
        String customerName,
        String note,
        BigDecimal totalAmount,
        BigDecimal totalProfit,
        String createdBy,
        List<SalesInvoiceItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
