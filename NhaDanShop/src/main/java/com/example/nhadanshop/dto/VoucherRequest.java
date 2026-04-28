package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record VoucherRequest(
        @NotBlank @Size(max = 100) String code,
        @Size(max = 500) String ruleSummary,
        Boolean active,
        @DecimalMin("0") BigDecimal minSubtotal,
        @DecimalMin("0") @DecimalMax("100") BigDecimal percent,
        @DecimalMin("0") BigDecimal cap,
        @DecimalMin("0") BigDecimal fixedAmount,
        Boolean freeShipping,
        LocalDateTime startAt,
        LocalDateTime endAt
) {}
