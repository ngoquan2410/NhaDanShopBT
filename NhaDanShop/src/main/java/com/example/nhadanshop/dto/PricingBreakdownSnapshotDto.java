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
        Integer commercialAllocationVersion,
        /** Merchandise loyalty discount; never applied to shipping or VAT. */
        BigDecimal loyaltyDiscount,
        /** Points consumed to produce {@link #loyaltyDiscount()}. */
        Long loyaltyRedeemedPoints
) {
    public PricingBreakdownSnapshotDto(
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
            BigDecimal itemNetRevenue,
            BigDecimal shippingNetRevenue,
            Integer commercialAllocationVersion
    ) {
        this(subtotal, manualDiscount, promotionDiscount, voucherDiscount,
                shippingFee, shippingDiscount, vatBase, vatPercent, vatAmount, total,
                itemNetRevenue, shippingNetRevenue, commercialAllocationVersion,
                BigDecimal.ZERO, 0L);
    }
}
