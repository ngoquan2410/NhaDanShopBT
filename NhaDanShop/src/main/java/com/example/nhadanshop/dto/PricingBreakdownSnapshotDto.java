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
        BigDecimal total,
        /** Merchandise net after allocated merchandise discounts; null on legacy snapshots. */
        BigDecimal itemNetRevenue,
        /** {@code shippingFee - shippingDiscount}; null on legacy snapshots. */
        BigDecimal shippingNetRevenue,
        /** Allocation schema version persisted with quotes/invoices; null on legacy snapshots. */
        Integer commercialAllocationVersion
) {}
