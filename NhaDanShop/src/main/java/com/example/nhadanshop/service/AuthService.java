package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.RefreshToken;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RefreshTokenRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.security.CustomUserDetailsService;
import com.example.nhadanshop.security.JwtTokenProvider;
import com.example.nhadanshop.security.TotpService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepo;
    private final RoleRepository roleRepo;
    private final RefreshTokenRepository refreshTokenRepo;
    private final CustomUserDetailsService userDetailsService;
    private final JwtTokenProvider jwtTokenProvider;
    private final TotpService totpService;
    private final PasswordEncoder passwordEncoder;

    // ── Sign Up: Đăng ký tài khoản mới (ROLE_USER) ──────────────────────────────────
    @Transactional
    public LoginResponse signUp(SignUpRequest req) {
        if (userRepo.existsByUsername(req.username())) {
            throw new IllegalStateException("Tên đăng nhập '" + req.username() + "' đã tồn tại");
        }

        Role userRole = roleRepo.findByName("ROLE_USER")
                .orElseThrow(() -> new IllegalStateException("Role ROLE_USER không tìm thấy trong hệ thống"));

        User user = new User();
        user.setUsername(req.username());
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setFullName(req.fullName() != null ? req.fullName() : req.username());
        user.setActive(true);
        user.getRoles().add(userRole);
        userRepo.save(user);

        // Tự động login sau khi đăng ký thành công
        Set<String> roles = Set.of("ROLE_USER");
        return issueFullTokens(user, roles);
    }

    // ── Step 1: Login với username/password ──────────────────────────────────────────
    @Transactional
    public LoginResponse login(LoginRequest req) {
        User user = userRepo.findByUsername(req.username())
                .orElseThrow(() -> new BadCredentialsException("Sai tên đăng nhập hoặc mật khẩu"));

        if (!user.getActive()) {
            throw new DisabledException("Tài khoản đã bị vô hiệu hóa");
        }

        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            throw new BadCredentialsException("Sai tên đăng nhập hoặc mật khẩu");
        }

        Set<String> roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toSet());

        // Nếu TOTP đã bật → trả về pre-auth token trong field accessToken,
        // FE kiểm tra totpRequired=true để hiện màn hình nhập OTP
        if (Boolean.TRUE.equals(user.getTotpEnabled())) {
            String preAuthToken = jwtTokenProvider.generatePreAuthToken(user.getUsername());
            return new LoginResponse(
                    preAuthToken,   // dùng tạm làm pre-auth token, FE biết nhờ totpRequired=true
                    null,           // refreshToken chưa có
                    "Bearer",
                    300,            // 5 phút
                    user.getUsername(),
                    user.getFullName(),
                    roles,
                    true,
                    true            // totpRequired = true → FE hiện màn hình nhập OTP
            );
        }

        // Không có TOTP → cấp token ngay
        return issueFullTokens(user, roles);
    }

    // ── Step 2: Xác thực TOTP ────────────────────────────────────────────────
    @Transactional
    public LoginResponse verifyTotp(TotpVerifyRequest req) {
        // Validate pre-auth token
        if (!jwtTokenProvider.validateToken(req.preAuthToken()) ||
                !jwtTokenProvider.isPreAuthToken(req.preAuthToken())) {
            throw new BadCredentialsException("Pre-auth token không hợp lệ hoặc đã hết hạn");
        }

        String username = jwtTokenProvider.getUsernameFromToken(req.preAuthToken());
        User user = userRepo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        if (!Boolean.TRUE.equals(user.getTotpEnabled()) || user.getTotpSecret() == null) {
            throw new BadCredentialsException("TOTP chưa được kích hoạt cho tài khoản này");
        }

        if (!totpService.verifyCode(user.getTotpSecret(), req.otp())) {
            throw new BadCredentialsException("Mã OTP không đúng hoặc đã hết hạn");
        }

        Set<String> roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toSet());

        return issueFullTokens(user, roles);
    }

    // ── Refresh Access Token ─────────────────────────────────────────────────
    @Transactional
    public LoginResponse refreshToken(String rawRefreshToken) {
        String hash = jwtTokenProvider.hashRefreshToken(rawRefreshToken);

        RefreshToken rt = refreshTokenRepo.findByTokenHash(hash)
                .orElseThrow(() -> new BadCredentialsException("Refresh token không hợp lệ"));

        if (rt.getRevoked()) {
            // Token đã bị revoke → có thể bị đánh cắp → revoke tất cả tokens của user
            refreshTokenRepo.revokeAllByUser(rt.getUser());
            throw new BadCredentialsException("Refresh token đã bị thu hồi");
        }

        if (rt.getExpiresAt().isBefore(LocalDateTime.now())) {
            rt.setRevoked(true);
            refreshTokenRepo.save(rt);
            throw new BadCredentialsException("Refresh token đã hết hạn");
        }

        User user = rt.getUser();
        // Rotation: revoke token cũ, cấp token mới
        rt.setRevoked(true);
        refreshTokenRepo.save(rt);

        Set<String> roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toSet());

        return issueFullTokens(user, roles);
    }

    // ── Logout ───────────────────────────────────────────────────────────────
    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null) return;
        String hash = jwtTokenProvider.hashRefreshToken(rawRefreshToken);
        refreshTokenRepo.findByTokenHash(hash).ifPresent(rt -> {
            rt.setRevoked(true);
            refreshTokenRepo.save(rt);
        });
    }

    // ── Logout all sessions ──────────────────────────────────────────────────
    @Transactional
    public void logoutAll(String username) {
        userRepo.findByUsername(username).ifPresent(refreshTokenRepo::revokeAllByUser);
    }

    // ── TOTP Setup: tạo secret + QR code ─────────────────────────────────────
    @Transactional
    public TotpSetupResponse setupTotp(String username) {
        User user = userRepo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        TotpSetupResponse setup = totpService.generateSetup(username);
        // Lưu secret tạm (chưa enable, chờ verify lần đầu)
        user.setTotpSecret(setup.secret());
        user.setTotpEnabled(false); // chưa bật đến khi verify thành công
        userRepo.save(user);

        return setup;
    }

    // ── TOTP Enable: verify OTP rồi bật ──────────────────────────────────────
    @Transactional
    public void enableTotp(String username, String otp) {
        User user = userRepo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        if (user.getTotpSecret() == null) {
            throw new IllegalStateException("Chưa setup TOTP. Gọi /api/auth/totp/setup trước.");
        }

        if (!totpService.verifyCode(user.getTotpSecret(), otp)) {
            throw new BadCredentialsException("Mã OTP không đúng");
        }

        user.setTotpEnabled(true);
        userRepo.save(user);

        // Revoke tất cả refresh tokens để buộc login lại với TOTP
        refreshTokenRepo.revokeAllByUser(user);
    }

    // ── TOTP Disable ──────────────────────────────────────────────────────────
    @Transactional
    public void disableTotp(String username, String otp) {
        User user = userRepo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        if (!Boolean.TRUE.equals(user.getTotpEnabled())) {
            throw new IllegalStateException("TOTP chưa đ��ợc bật");
        }

        if (!totpService.verifyCode(user.getTotpSecret(), otp)) {
            throw new BadCredentialsException("Mã OTP không đúng");
        }

        user.setTotpEnabled(false);
        user.setTotpSecret(null);
        userRepo.save(user);
    }

    // ── Helper: cấp đầy đủ access + refresh token ─────────────────────────────
    private LoginResponse issueFullTokens(User user, Set<String> roles) {
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getUsername());
        String accessToken = jwtTokenProvider.generateAccessToken(userDetails);

        // Tạo và lưu refresh token
        String rawRefresh = jwtTokenProvider.generateRawRefreshToken();
        String refreshHash = jwtTokenProvider.hashRefreshToken(rawRefresh);

        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(refreshHash);
        rt.setExpiresAt(LocalDateTime.now().plusDays(jwtTokenProvider.getRefreshTokenExpiryDays()));
        refreshTokenRepo.save(rt);

        return new LoginResponse(
                accessToken,
                rawRefresh,
                "Bearer",
                jwtTokenProvider.getAccessTokenExpirySeconds(),
                user.getUsername(),
                user.getFullName(),
                roles,
                Boolean.TRUE.equals(user.getTotpEnabled()),
                false // totpRequired = false vì đã xác thực xong
        );
    }

    // ── Cleanup: xóa refresh tokens hết hạn mỗi giờ ──────────────────────────
    @Scheduled(fixedDelay = 3_600_000)
    @Transactional
    public void cleanupExpiredTokens() {
        refreshTokenRepo.deleteExpiredAndRevoked(LocalDateTime.now());
        log.debug("Cleaned up expired/revoked refresh tokens");
    }
}
