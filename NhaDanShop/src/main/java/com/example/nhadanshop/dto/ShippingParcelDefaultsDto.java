package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record ShippingParcelDefaultsDto(
        @Min(1) @Max(200) int length,
        @Min(1) @Max(200) int width,
        @Min(1) @Max(200) int height,
        @Min(1) @Max(30000) int weightGrams,
        @NotBlank String declaredValueMode,
        @DecimalMin("0.0") BigDecimal declaredValueFixed
) {
}
