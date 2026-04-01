package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record InvoiceItemRequest(
        @NotNull Long productId,
        @NotNull @Min(1) Integer quantity,
        /** Chiết khấu % trên dòng này (0–100), null = 0 */
        @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent
) {}
