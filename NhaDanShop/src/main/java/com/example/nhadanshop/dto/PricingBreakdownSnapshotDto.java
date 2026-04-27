package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record PricingBreakdownSnapshotDto(
        BigDecimal subtotal,
        BigDecimal manualDiscount,
        BigDecimal promotionDiscount,
        BigDecimal voucherDiscount,
        BigDecimal shippingFee,
        BigDecimal shippingDiscount,
        BigDecimal vatBase,
        BigDecimal vatPercent,
        BigDecimal vatAmount,
        BigDecimal total
) {}
