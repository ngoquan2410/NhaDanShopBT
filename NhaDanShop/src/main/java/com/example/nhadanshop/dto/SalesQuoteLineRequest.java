package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record SalesQuoteLineRequest(
        @NotNull Long productId,
        @NotNull Long variantId,
        @NotNull @Min(1) Integer quantity,
        @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
        /** Stock trace only; does not change unit price in quote. */
        Long batchId,
        boolean rewardLine
) {}
