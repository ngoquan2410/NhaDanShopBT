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
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot
) {}
