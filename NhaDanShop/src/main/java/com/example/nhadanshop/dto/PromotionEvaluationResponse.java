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
		List<GiftLineSnapshotDto> giftLines
) {}

