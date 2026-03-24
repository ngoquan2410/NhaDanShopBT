package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * POST /api/auth/signup
     * Đăng ký tài khoản mới (public). Role mặc định: ROLE_USER.
     * Tự động login sau khi đăng ký thành công → trả về access + refresh token.
     */
    @PostMapping("/signup")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public ResponseEntity<LoginResponse> signUp(@Valid @RequestBody com.example.nhadanshop.dto.SignUpRequest req) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(authService.signUp(req));
    }

    /**
     * POST /api/auth/login
     * Bước 1: username + password.
     * - Nếu TOTP chưa bật  → trả về accessToken + refreshToken ngay.
     * - Nếu TOTP đã bật    → totpRequired=true, accessToken chứa preAuthToken (5 phút),
     *                         FE hiện màn hình nhập OTP rồi gọi /verify-totp.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    /**
     * POST /api/auth/verify-totp
     * Bước 2 (chỉ khi totpRequired=true): gửi preAuthToken + mã OTP 6 chữ số.
     * Trả về accessToken + refreshToken thật sự.
     */
    @PostMapping("/verify-totp")
    public ResponseEntity<LoginResponse> verifyTotp(@Valid @RequestBody TotpVerifyRequest req) {
        return ResponseEntity.ok(authService.verifyTotp(req));
    }

    /**
     * POST /api/auth/refresh
     * Đổi refresh token lấy access token mới (Refresh Token Rotation).
     */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest req) {
        return ResponseEntity.ok(authService.refreshToken(req.refreshToken()));
    }

    /**
     * POST /api/auth/logout
     * Revoke refresh token hiện tại (1 thiết bị).
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) RefreshTokenRequest req) {
        authService.logout(req != null ? req.refreshToken() : null);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/auth/logout-all
     * Revoke tất cả refresh tokens của user (đăng xuất mọi thiết bị).
     */
    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll(Authentication auth) {
        authService.logoutAll(auth.getName());
        return ResponseEntity.noContent().build();
    }

    /**
     * GET /api/auth/me
     * Lấy thông tin user hiện tại từ JWT.
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(Authentication auth) {
        Set<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());
        return ResponseEntity.ok(Map.of(
                "username", auth.getName(),
                "roles", roles
        ));
    }

    /**
     * POST /api/auth/totp/setup
     * Tạo TOTP secret mới + trả về QR code (data URI).
     * Yêu cầu access token hợp lệ. Chưa bật cho đến khi gọi /totp/enable.
     */
    @PostMapping("/totp/setup")
    public ResponseEntity<TotpSetupResponse> totpSetup(Authentication auth) {
        return ResponseEntity.ok(authService.setupTotp(auth.getName()));
    }

    /**
     * POST /api/auth/totp/enable
     * Sau khi quét QR và nhập OTP xác nhận → bật TOTP cho tài khoản.
     * Body: { "otp": "123456" }
     */
    @PostMapping("/totp/enable")
    public ResponseEntity<Map<String, String>> totpEnable(
            Authentication auth,
            @RequestBody Map<String, String> body) {
        authService.enableTotp(auth.getName(), body.getOrDefault("otp", ""));
        return ResponseEntity.ok(Map.of("message", "TOTP đã được kích hoạt thành công"));
    }

    /**
     * POST /api/auth/totp/disable
     * Tắt TOTP - cần xác nhận bằng OTP hiện tại để tránh bị tắt trái phép.
     * Body: { "otp": "123456" }
     */
    @PostMapping("/totp/disable")
    public ResponseEntity<Map<String, String>> totpDisable(
            Authentication auth,
            @RequestBody Map<String, String> body) {
        authService.disableTotp(auth.getName(), body.getOrDefault("otp", ""));
        return ResponseEntity.ok(Map.of("message", "TOTP đã được tắt"));
    }
}
