package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

public record PromotionEvaluationResponse(
        String promotionId,
        String name,
        String type,
        String ruleSummary,
        boolean eligible,
        String reasonIfIneligible,
        BigDecimal discountAmount,
        BigDecimal shippingDiscountAmount,
        BigDecimal voucherDiscountAmount,
        List<PromotionAffectedLineDto> affectedLines,
        List<GiftLineSnapshotDto> giftLines,
        PromotionProgressSnapshotDto progress,
        ShippingDiscountPreviewDto shippingDiscountPreview
) {
    public PromotionEvaluationResponse(
            String promotionId,
            String name,
            String type,
            String ruleSummary,
            boolean eligible,
            String reasonIfIneligible,
            BigDecimal discountAmount,
            BigDecimal shippingDiscountAmount,
            BigDecimal voucherDiscountAmount,
            List<PromotionAffectedLineDto> affectedLines,
            List<GiftLineSnapshotDto> giftLines
    ) {
        this(promotionId, name, type, ruleSummary, eligible, reasonIfIneligible,
                discountAmount, shippingDiscountAmount, voucherDiscountAmount,
                affectedLines, giftLines, null, null);
    }
}
