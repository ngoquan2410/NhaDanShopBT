package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;

public record PaymentEventLinkRequest(
        @NotBlank String orderCode,
        String linkedBy
) {}
