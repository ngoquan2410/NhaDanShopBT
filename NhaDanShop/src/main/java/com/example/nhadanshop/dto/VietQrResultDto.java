package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record VietQrResultDto(
        String imageUrl,
        String scanImageUrl,
        String rawPayload,
        String bankName,
        String accountNumber,
        String accountName,
        BigDecimal amount,
        String transferContent,
        String template
) {}
