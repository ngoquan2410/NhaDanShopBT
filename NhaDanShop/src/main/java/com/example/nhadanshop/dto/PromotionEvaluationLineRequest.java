package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record PromotionEvaluationLineRequest(
		@Size(max = 100) String id,
		@NotNull Long productId,
		Long variantId,
		@NotNull @Min(1) Integer qty,
		BigDecimal unitPrice,
		BigDecimal lineSubtotal
) {}

