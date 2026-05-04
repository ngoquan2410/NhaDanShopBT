package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CustomerPointTransactionResponse(
        Long id,
        String type,
        Long pointsDelta,
        Long balanceAfter,
        Long reservedAfter,
        BigDecimal moneyBase,
        BigDecimal discountAmount,
        String reason,
        String source,
        Long invoiceId,
        Long pendingOrderId,
        LocalDateTime createdAt
) {}
