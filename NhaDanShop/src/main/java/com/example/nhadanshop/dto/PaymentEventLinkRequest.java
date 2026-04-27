package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record PaymentEventLinkRequest(
        @NotBlank String orderCode,
        @NotBlank
        @Pattern(regexp = "auto|admin", message = "linkedBy phải là auto hoặc admin")
        String linkedBy
) {}
