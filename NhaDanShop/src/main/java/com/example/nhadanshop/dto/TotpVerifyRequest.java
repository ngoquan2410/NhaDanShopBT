package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Bước 2 của login khi TOTP đã bật:
 * gửi kèm temporary token (pre-auth) + mã OTP 6 chữ số.
 */
public record TotpVerifyRequest(
        @NotBlank String preAuthToken,   // token tạm thời từ bước login
        @NotBlank @Size(min = 6, max = 6) String otp
) {}
