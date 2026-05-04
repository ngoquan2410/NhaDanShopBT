package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CommercialLineSnapshotDto;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class Slice8LoyaltyEngineTest {

    @Test
    void loyalty_discount_is_separate_merchandise_bucket_and_allocates_only_to_billable_rows() {
        var result = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                BigDecimal.valueOf(1000),
                BigDecimal.valueOf(100),
                null,
                List.of(
                        new CommercialPricingEngine.PromoPricingLine(null, BigDecimal.valueOf(600)),
                        new CommercialPricingEngine.PromoPricingLine(null, BigDecimal.valueOf(400))
                ),
                List.of(
                        new CommercialPricingEngine.BillableAllocationRow(1L, 10L, BigDecimal.valueOf(600), BigDecimal.valueOf(600)),
                        new CommercialPricingEngine.BillableAllocationRow(2L, 20L, BigDecimal.valueOf(400), BigDecimal.valueOf(400))
                ),
                BigDecimal.valueOf(200),
                BigDecimal.valueOf(300),
                300L,
                BigDecimal.valueOf(25000),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        assertThat(result.breakdown().loyaltyDiscount()).isEqualByComparingTo("300");
        assertThat(result.breakdown().loyaltyRedeemedPoints()).isEqualTo(300L);
        assertThat(result.breakdown().shippingFee()).isEqualByComparingTo("25000");
        assertThat(result.breakdown().shippingDiscount()).isEqualByComparingTo("0");
        assertThat(result.breakdown().itemNetRevenue()).isEqualByComparingTo("400");
        assertThat(result.breakdown().total()).isEqualByComparingTo("25400");

        BigDecimal allocatedLoyalty = result.billableLineSnapshots().stream()
                .map(CommercialLineSnapshotDto::allocatedLoyaltyDiscount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(allocatedLoyalty).isEqualByComparingTo("300");
        assertThat(result.billableLineSnapshots()).allSatisfy(line ->
                assertThat(line.lineNetRevenue()).isGreaterThanOrEqualTo(BigDecimal.ZERO));
    }
}

