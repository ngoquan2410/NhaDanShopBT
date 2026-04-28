package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class Slice6cCommercialPricingEngineTest {

    @Test
    void vat_floor_uses_full_merchandise_subtotal_discounts_reduce_payable_but_not_vat_base() {
        BigDecimal merchandise = new BigDecimal("100000"); // VAT base locked to this
        PricingBreakdownSnapshotDto dto = CommercialPricingEngine.computePricing(
                merchandise,
                new BigDecimal("10000"),
                null,
                List.of(),
                BigDecimal.ZERO,
                new BigDecimal("15000"),
                BigDecimal.ZERO,
                new BigDecimal("10")
        );

        assertEquals(new BigDecimal("100000"), dto.subtotal());
        assertEquals(new BigDecimal("10000"), dto.manualDiscount());
        assertEquals(merchandise, dto.vatBase());
        assertEquals(new BigDecimal("10000"), dto.vatAmount()); // floor(100000 * 10 / 100)
        BigDecimal expectedTotal = merchandise
                .subtract(dto.manualDiscount())
                .add(dto.shippingFee())
                .subtract(dto.shippingDiscount())
                .subtract(dto.promotionDiscount())
                .subtract(dto.voucherDiscount())
                .add(dto.vatAmount());
        assertEquals(expectedTotal.stripTrailingZeros(), dto.total().stripTrailingZeros());
    }

    @Test
    void shipping_discount_capped_at_shipping_fee() {
        PricingBreakdownSnapshotDto dto = CommercialPricingEngine.computePricing(
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                null,
                List.of(),
                BigDecimal.ZERO,
                new BigDecimal("10000"),
                new BigDecimal("999999"),
                BigDecimal.ZERO
        );
        assertEquals(new BigDecimal("10000"), dto.shippingDiscount());
        assertEquals(BigDecimal.ZERO, dto.shippingFee().subtract(dto.shippingDiscount()));
    }
}
