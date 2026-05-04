package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record AccountOrderResponse(
        Long id,
        String invoiceNo,
        LocalDateTime invoiceDate,
        BigDecimal totalAmount,
        BigDecimal discountAmount,
        BigDecimal loyaltyDiscountAmount,
        Long loyaltyRedeemedPoints,
        String paymentMethod,
        String status
) {}
