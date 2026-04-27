package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record VietQrGenerateRequest(
        @NotNull @DecimalMin("0.0") BigDecimal amount,
        @NotBlank @Size(max = 255) String transferContent,
        @Size(max = 255) String cacheKey,
        @Valid StorePaymentSettingsDto settingsOverride
) {}
