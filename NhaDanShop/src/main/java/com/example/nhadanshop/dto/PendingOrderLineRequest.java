package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record PendingOrderLineRequest(
        @NotBlank @Size(max = 100) String id,
        @NotBlank String productId,
        @NotBlank String variantId,
        @NotBlank @Size(max = 255) String productName,
        @Size(max = 255) String variantName,
        @NotNull @Min(1) Integer qty,
        @NotNull BigDecimal unitPrice,
        @NotNull BigDecimal lineSubtotal
) {}
