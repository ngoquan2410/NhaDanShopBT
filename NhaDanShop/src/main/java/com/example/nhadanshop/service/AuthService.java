package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.exception.BusinessConflictException;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.RefreshToken;
import com.example.nhadanshop.entity.PasswordResetToken;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RefreshTokenRepository;
import com.example.nhadanshop.repository.PasswordResetTokenRepository;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.security.CustomUserDetailsService;
import com.example.nhadanshop.security.JwtTokenProvider;
import com.example.nhadanshop.security.PasswordPolicy;
import com.example.nhadanshop.security.TotpService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
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
    private final CustomerRepository customerRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepo;
    private final JavaMailSender mailSender;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${spring.mail.from:}")
    private String mailFrom;

    @Value("${app.public-base-url:http://localhost:5173}")
    private String publicBaseUrl;

    // ── Sign Up: Đăng ký tài khoản mới (ROLE_USER) ──────────────────────────────────
    @Transactional
    public LoginResponse signUp(SignUpRequest req) {
        PasswordPolicy.validate(req.password(), req.username());
        if (userRepo.existsByUsername(req.username())) {
            throw new BusinessConflictException(
                    "USERNAME_ALREADY_EXISTS",
                    "Tên đăng nhập '" + req.username() + "' đã tồn tại");
        }

        Role userRole = roleRepo.findByName("ROLE_USER")
                .or(() -> roleRepo.findByName("ROLE_CUSTOMER"))
                .orElseThrow(() -> new IllegalStateException("Role ROLE_USER/ROLE_CUSTOMER không tìm thấy trong hệ thống"));

        User user = new User();
        user.setUsername(req.username());
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setFullName(req.fullName() != null ? req.fullName() : req.username());
        user.setActive(true);
        user.getRoles().add(userRole);

        SignupCustomerResolution resolution = resolveSignupCustomer(req, user.getFullName());
        user.setCustomer(resolution.customer());
        try {
            userRepo.save(user);
        } catch (DataIntegrityViolationException ex) {
            String root = ex.getMostSpecificCause() != null
                    ? ex.getMostSpecificCause().getMessage()
                    : ex.getMessage();
            String lower = root != null ? root.toLowerCase() : "";
            if (lower.contains("uk_users_customer_id")) {
                throw new BusinessConflictException(
                        "PHONE_ALREADY_REGISTERED",
                        "Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập hoặc dùng số khác.");
            }
            throw ex;
        }

        // Tự động login sau khi đăng ký thành công
        Set<String> roles = Set.of(userRole.getName());
        return issueFullTokens(user, roles, resolution.duplicatePhoneMatch());
    }

    private record SignupCustomerResolution(Customer customer, boolean duplicatePhoneMatch) {}

    private SignupCustomerResolution resolveSignupCustomer(SignUpRequest req, String fullName) {
        String phone = normalizePhone(req.phone());
        if (phone != null) {
            List<Customer> matches = customerRepository.findAllByPhoneAndActiveTrue(phone);
            if (!matches.isEmpty()) {
                boolean dup = matches.size() > 1;
                if (dup) {
                    log.warn("Signup phone {} matched {} active customers; linking to customer with latest completed invoice",
                            phone, matches.size());
                }
                Customer chosen = matches.stream()
                        .max(Comparator.comparing(c -> {
                            LocalDateTime last = salesInvoiceRepository.lastCompletedAtForCustomerIdentity(c.getId(), phone);
                            return last != null ? last : LocalDateTime.MIN;
                        }))
                        .orElse(matches.get(0));
                if (userRepo.findByCustomerId(chosen.getId()).isPresent()) {
                    throw new BusinessConflictException(
                            "PHONE_ALREADY_REGISTERED",
                            "Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập hoặc dùng số khác.");
                }
                return new SignupCustomerResolution(chosen, dup);
            }
        }
        Customer customer = new Customer();
        customer.setCode(nextCustomerCode());
        customer.setName(fullName);
        customer.setPhone(phone);
        customer.setActive(true);
        return new SignupCustomerResolution(customerRepository.save(customer), false);
    }

    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String p = phone.replaceAll("\\D", "");
        return p.isBlank() ? null : p;
    }

    // ── Step 1: Login với username/password ──────────────────────────────────────────
    @Transactional
    public LoginResponse login(LoginRequest req) {
        User user = userRepo.findByUsername(req.username())
                .orElseThrow(() -> new BadCredentialsException("Sai tên đăng nhập hoặc mật khẩu"));

        if (!user.getActive()) {
            throw new DisabledException("Tài khoản đã bị vô hiệu hóa ");
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
                    user.getCustomer() != null ? user.getCustomer().getId() : null,
                    true,
                    true,           // totpRequired = true → FE hiện màn hình nhập OTP
                    false
            );
        }

        // Không có TOTP → cấp token ngay
        return issueFullTokens(user, roles, false);
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

        return issueFullTokens(user, roles, false);
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

        return issueFullTokens(user, roles, false);
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
            throw new IllegalStateException("TOTP chưa được bật");
        }

        if (!totpService.verifyCode(user.getTotpSecret(), otp)) {
            throw new BadCredentialsException("Mã OTP không đúng");
        }

        user.setTotpEnabled(false);
        user.setTotpSecret(null);
        userRepo.save(user);
    }

    // ── Password reset (SMTP) ─────────────────────────────────────────────────
    @Transactional
    public void requestPasswordReset(String username) {
        if (username == null || username.isBlank()) {
            return;
        }
        User user = userRepo.findByUsername(username.trim()).orElse(null);
        if (user == null) {
            log.debug("Password reset requested for unknown user (no email sent)");
            return;
        }
        if (mailHost == null || mailHost.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email SMTP chưa được cấu hình (spring.mail.host).");
        }
        String email = user.getCustomer() != null ? user.getCustomer().getEmail() : null;
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tài khoản chưa có email trên hồ sơ khách hàng — không thể gửi liên kết đặt lại mật khẩu.");
        }
        String raw = jwtTokenProvider.generateRawRefreshToken();
        String hash = jwtTokenProvider.hashRefreshToken(raw);
        PasswordResetToken pr = new PasswordResetToken();
        pr.setUser(user);
        pr.setTokenHash(hash);
        pr.setExpiresAt(LocalDateTime.now().plusHours(1));
        passwordResetTokenRepo.save(pr);

        String base = publicBaseUrl == null ? "http://localhost:5173" : publicBaseUrl.trim().replaceAll("/$", "");
        String link = base + "/reset-password?token=" + java.net.URLEncoder.encode(raw, StandardCharsets.UTF_8);

        SimpleMailMessage msg = new SimpleMailMessage();
        if (mailFrom != null && !mailFrom.isBlank()) {
            msg.setFrom(mailFrom.trim());
        }
        msg.setTo(email);
        msg.setSubject("Đặt lại mật khẩu NhaDanShop");
        msg.setText("Xin chào,\n\nĐể đặt lại mật khẩu, mở liên kết sau (hiệu lực 1 giờ):\n" + link
                + "\n\nNếu bạn không yêu cầu, vui lòng bỏ qua email này.\n");
        mailSender.send(msg);
    }

    @Transactional
    public void resetPasswordWithToken(String rawToken, String newPassword) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new BadCredentialsException("Token không hợp lệ");
        }
        String hash = jwtTokenProvider.hashRefreshToken(rawToken.trim());
        PasswordResetToken pr = passwordResetTokenRepo.findByTokenHash(hash)
                .orElseThrow(() -> new BadCredentialsException("Token không hợp lệ"));
        if (pr.getUsedAt() != null) {
            throw new BadCredentialsException("Token đã được sử dụng");
        }
        if (pr.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BadCredentialsException("Token đã hết hạn");
        }
        User user = pr.getUser();
        PasswordPolicy.validate(newPassword, user.getUsername());
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepo.save(user);
        pr.setUsedAt(LocalDateTime.now());
        passwordResetTokenRepo.save(pr);
        refreshTokenRepo.revokeAllByUser(user);
    }

    @Transactional
    public void changePassword(String username, ChangePasswordRequest req) {
        User user = userRepo.findByUsername(username)
                .orElseThrow(() -> new BadCredentialsException("Không thể xác thực tài khoản"));
        if (!passwordEncoder.matches(req.currentPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Mật khẩu hiện tại không đúng");
        }
        if (!req.newPassword().equals(req.confirmPassword())) {
            throw new IllegalArgumentException("Xác nhận mật khẩu không khớp");
        }
        PasswordPolicy.validate(req.newPassword(), user.getUsername());
        if (passwordEncoder.matches(req.newPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Mật khẩu mới phải khác mật khẩu cũ");
        }
        user.setPassword(passwordEncoder.encode(req.newPassword()));
        user.setUpdatedAt(LocalDateTime.now());
        userRepo.save(user);
        refreshTokenRepo.revokeAllByUser(user);
    }

    // ── Helper: cấp đầy đủ access + refresh token ─────────────────────────────
    private LoginResponse issueFullTokens(User user, Set<String> roles, boolean duplicateCustomerPhoneMatch) {
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getUsername());
        String accessToken = jwtTokenProvider.generateAccessToken(userDetails);

        // Tạo và lưu refresh token
        String rawRefresh = jwtTokenProvider.generateRawRefreshToken();
        String refreshHash = jwtTokenProvider.hashRefreshToken(rawRefresh);

        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(refreshHash);
        rt.setExpiresAt(LocalDateTime.now().plusMinutes(jwtTokenProvider.getRefreshTokenExpiryMinutes()));
        refreshTokenRepo.save(rt);

        return new LoginResponse(
                accessToken,
                rawRefresh,
                "Bearer",
                jwtTokenProvider.getAccessTokenExpirySeconds(),
                user.getUsername(),
                user.getFullName(),
                roles,
                user.getCustomer() != null ? user.getCustomer().getId() : null,
                Boolean.TRUE.equals(user.getTotpEnabled()),
                false, // totpRequired = false vì đã xác thực xong
                duplicateCustomerPhoneMatch
        );
    }

    private String nextCustomerCode() {
        long maxNum = Optional.ofNullable(customerRepository.findMaxKhAutoNumericSuffix()).orElse(0L);
        String candidate;
        do {
            candidate = String.format("KH%03d", ++maxNum);
        } while (customerRepository.existsByCode(candidate));
        return candidate;
    }

    // ── Cleanup: xóa refresh tokens hết hạn mỗi giờ ──────────────────────────
    @Scheduled(fixedDelay = 3_600_000)
    @Transactional
    public void cleanupExpiredTokens() {
        refreshTokenRepo.deleteExpiredAndRevoked(LocalDateTime.now());
        log.debug("Cleaned up expired/revoked refresh tokens");
    }
}
