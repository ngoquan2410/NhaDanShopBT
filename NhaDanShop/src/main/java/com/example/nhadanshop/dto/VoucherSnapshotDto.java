package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record VoucherSnapshotDto(
        @Size(max = 100) String code,
        @Size(max = 500) String ruleSummary,
        BigDecimal discountAmount,
        BigDecimal shippingDiscountAmount
) {}
