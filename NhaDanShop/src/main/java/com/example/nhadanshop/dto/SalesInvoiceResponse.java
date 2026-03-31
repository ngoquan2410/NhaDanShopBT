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
        /** Tổng tiền trước KM */
        BigDecimal totalAmount,
        /** Số tiền được giảm từ KM */
        BigDecimal discountAmount,
        /** Tổng tiền THỰC TẾ phải trả = totalAmount - discountAmount */
        BigDecimal finalAmount,
        /** Tên chương trình KM đã áp dụng (null nếu không có) */
        String promotionName,
        BigDecimal totalProfit,
        String createdBy,
        List<SalesInvoiceItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
