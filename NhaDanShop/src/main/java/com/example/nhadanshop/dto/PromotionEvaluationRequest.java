package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.math.BigDecimal;
import java.util.List;

public record PromotionEvaluationRequest(
		Long promotionId,
		@Valid @NotEmpty List<PromotionEvaluationLineRequest> lines,
		BigDecimal subtotal,
		BigDecimal shippingFee
) {}

