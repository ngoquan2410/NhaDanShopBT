package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VoucherRequest(
        @NotBlank @Size(max = 100) String code,
        @Size(max = 500) String ruleSummary,
        Boolean active
) {}
