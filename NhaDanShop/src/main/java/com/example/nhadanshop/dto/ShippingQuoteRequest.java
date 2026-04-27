package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ShippingQuoteRequest(
        @Valid @NotNull ShippingAddressDto address,
        @NotNull @DecimalMin("0.0") BigDecimal subtotal,
        @Min(1) @Max(30000) Integer weightGrams,
        String orderCode,
        @Valid ParcelDto parcel,
        @DecimalMin("0.0") BigDecimal declaredValue
) {
    public record ParcelDto(
            @Min(1) @Max(200) Integer length,
            @Min(1) @Max(200) Integer width,
            @Min(1) @Max(200) Integer height
    ) {}
}
