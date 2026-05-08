package com.example.nhadanshop.dto;

import java.time.LocalDateTime;
import java.util.List;

public record SalesQuoteResponse(
        String quoteId,
        LocalDateTime expiresAt,
        List<SalesQuoteLineResponse> lines,
        List<SalesQuoteLineResponse> rewardLines,
        PromotionSnapshotDto promotionSnapshot,
        VoucherSnapshotDto voucherSnapshot,
        ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
        LoyaltyRedemptionSnapshotDto loyaltySnapshot,
        Long effectivePromotionId,
        String effectivePromotionName,
        String effectivePromotionType,
        String selectedPromotionInvalidReason,
        Long fallbackPromotionId
) {
    public SalesQuoteResponse(
            String quoteId,
            LocalDateTime expiresAt,
            List<SalesQuoteLineResponse> lines,
            List<SalesQuoteLineResponse> rewardLines,
            PromotionSnapshotDto promotionSnapshot,
            VoucherSnapshotDto voucherSnapshot,
            ShippingQuoteSnapshotDto shippingQuoteSnapshot,
            PricingBreakdownSnapshotDto pricingBreakdownSnapshot
    ) {
        this(quoteId, expiresAt, lines, rewardLines, promotionSnapshot, voucherSnapshot,
                shippingQuoteSnapshot, pricingBreakdownSnapshot, null, null, null, null, null, null);
    }

    public SalesQuoteResponse(
            String quoteId,
            LocalDateTime expiresAt,
            List<SalesQuoteLineResponse> lines,
            List<SalesQuoteLineResponse> rewardLines,
            PromotionSnapshotDto promotionSnapshot,
            VoucherSnapshotDto voucherSnapshot,
            ShippingQuoteSnapshotDto shippingQuoteSnapshot,
            PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
            LoyaltyRedemptionSnapshotDto loyaltySnapshot
    ) {
        this(quoteId, expiresAt, lines, rewardLines, promotionSnapshot, voucherSnapshot,
                shippingQuoteSnapshot, pricingBreakdownSnapshot, loyaltySnapshot, null, null, null, null, null);
    }
}
