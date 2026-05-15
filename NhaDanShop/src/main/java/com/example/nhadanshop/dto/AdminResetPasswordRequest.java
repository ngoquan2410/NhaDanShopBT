package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminResetPasswordRequest(
        @NotBlank String newPassword,
        @NotBlank String confirmPassword
) {}
