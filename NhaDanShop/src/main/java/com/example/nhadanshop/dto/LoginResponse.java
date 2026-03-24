package com.example.nhadanshop.dto;

import java.util.Set;

/**
 * Response trả về sau khi login thành công (không cần TOTP)
 * hoặc sau khi xác thực TOTP thành công.
 */
public record LoginResponse(
        String accessToken,
        String refreshToken,
        String tokenType,       // "Bearer"
        long expiresIn,         // seconds
        String username,
        String fullName,
        Set<String> roles,
        boolean totpEnabled,    // user đã bật TOTP chưa
        boolean totpRequired    // login này có yêu cầu nhập TOTP không (true = cần bước 2)
) {}
