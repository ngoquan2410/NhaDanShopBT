package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PendingOrderResponse(
        Long id,
        String orderNo,
        String customerName,
        String note,
        String paymentMethod,
        String status,          // PENDING | CONFIRMED | CANCELLED
        String cancelReason,
        BigDecimal totalAmount,
        LocalDateTime expiresAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String createdBy,
        List<PendingOrderItemResponse> items,
        SalesInvoiceResponse invoice  // null cho đến khi CONFIRMED
) {}
