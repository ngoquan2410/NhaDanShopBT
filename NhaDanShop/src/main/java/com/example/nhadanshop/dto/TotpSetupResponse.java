package com.example.nhadanshop.dto;

/**
 * Response khi setup TOTP lần đầu.
 * FE dùng otpauthUrl hoặc secret để hiển thị QR code.
 */
public record TotpSetupResponse(
        String secret,       // Base32 secret (hiển thị text để nhập tay)
        String otpauthUrl,   // otpauth://totp/... để tạo QR code
        String qrCodeImage   // Data URI: data:image/png;base64,... (BE tạo sẵn)
) {}
