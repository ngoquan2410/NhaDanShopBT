package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePaymentMethodRequest(
        @NotBlank @Size(max = 20) String paymentMethod
) {}
