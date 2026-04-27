package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PaymentEventResponse(
        String id,
        String provider,
        String providerTxId,
        BigDecimal amount,
        String transferContent,
        String matchedCode,
        String bankAccount,
        String bankSubAcc,
        LocalDateTime txTime,
        String linkedOrderCode,
        LocalDateTime linkedAt,
        String linkedBy,
        String status,
        LocalDateTime createdAt
) {}
