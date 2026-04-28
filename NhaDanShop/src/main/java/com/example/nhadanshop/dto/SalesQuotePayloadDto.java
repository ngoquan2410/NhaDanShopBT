package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalesQuotePayloadDto(
        int version,
        String source,
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
        PromotionSnapshotDto promotionSnapshot,
        VoucherSnapshotDto voucherSnapshot,
        ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        List<SalesQuoteCapturedLineDto> lines,
        List<SalesQuoteCapturedLineDto> rewardLines
) {
    public static SalesQuotePayloadDto from(
            String source,
            PricingBreakdownSnapshotDto pricing,
            PromotionSnapshotDto promotionSnapshot,
            VoucherSnapshotDto voucherSnapshot,
            ShippingQuoteSnapshotDto shippingQuoteSnapshot,
            List<SalesQuoteCapturedLineDto> lines,
            List<SalesQuoteCapturedLineDto> rewardLines
    ) {
        return new SalesQuotePayloadDto(1, source, pricing,
                promotionSnapshot,
                voucherSnapshot,
                shippingQuoteSnapshot,
                lines != null ? lines : List.of(),
                rewardLines != null ? rewardLines : List.of());
    }
}
