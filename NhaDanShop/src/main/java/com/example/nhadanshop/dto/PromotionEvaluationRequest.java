package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.math.BigDecimal;
import java.util.List;

public record PromotionEvaluationRequest(
        Long promotionId,
        @Valid @NotEmpty List<PromotionEvaluationLineRequest> lines,
        BigDecimal subtotal,
        BigDecimal shippingFee,
        /** Khi true: khách chưa có địa chỉ đủ để quote phí (FREE_SHIPPING trả preview thay vì coi là không đủ phí). */
        Boolean pendingShippingAddress
) {
    public PromotionEvaluationRequest(
            Long promotionId,
            List<PromotionEvaluationLineRequest> lines,
            BigDecimal subtotal,
            BigDecimal shippingFee
    ) {
        this(promotionId, lines, subtotal, shippingFee, null);
    }
}
