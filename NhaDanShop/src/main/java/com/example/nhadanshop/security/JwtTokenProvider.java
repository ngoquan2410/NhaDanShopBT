package com.example.nhadanshop.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private final JwtProperties jwtProps;

    // ── Key ────────────────────────────────────────────────────────────────────
    private SecretKey signingKey() {
        byte[] keyBytes = jwtProps.getSecret().getBytes(StandardCharsets.UTF_8);
        // Nếu secret < 32 bytes, pad/hash để đủ 256-bit
        if (keyBytes.length < 32) {
            keyBytes = Arrays.copyOf(keyBytes, 32);
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    // ── Claim constants ────────────────────────────────────────────────────────
    private static final String CLAIM_ROLES     = "roles";
    private static final String CLAIM_TYPE      = "typ";
    private static final String TYPE_ACCESS     = "access";
    private static final String TYPE_PRE_AUTH   = "pre_auth"; // TOTP step-1 token
    private static final String TYPE_REFRESH    = "refresh";

    // ── Generate Access Token ──────────────────────────────────────────────────
    public String generateAccessToken(UserDetails userDetails) {
        List<String> roles = userDetails.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        long now = System.currentTimeMillis();
        long expiry = jwtProps.getAccessTokenExpiryMinutes() * 60 * 1000;

        return Jwts.builder()
                .subject(userDetails.getUsername())
                .claim(CLAIM_ROLES, roles)
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiry))
                .signWith(signingKey())
                .compact();
    }

    /**
     * Tạo Pre-Auth Token dùng cho bước TOTP (chưa được cấp access token thật).
     * Token này có TTL ngắn (5 phút) và chỉ được dùng để xác thực TOTP.
     */
    public String generatePreAuthToken(String username) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(username)
                .claim(CLAIM_TYPE, TYPE_PRE_AUTH)
                .issuedAt(new Date(now))
                .expiration(new Date(now + 5 * 60 * 1000)) // 5 phút
                .signWith(signingKey())
                .compact();
    }

    // ── Generate Refresh Token ─────────────────────────────────────────────────
    /**
     * Raw refresh token = random UUID (lưu dưới dạng hash trong DB).
     */
    public String generateRawRefreshToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * SHA-256 hash của raw refresh token để lưu vào DB.
     */
    public String hashRefreshToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    // ── Validate & Parse ───────────────────────────────────────────────────────
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("JWT expired: {}", e.getMessage());
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid JWT: {}", e.getMessage());
        }
        return false;
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String getUsernameFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    public String getTokenType(String token) {
        return parseClaims(token).get(CLAIM_TYPE, String.class);
    }

    @SuppressWarnings("unchecked")
    public List<String> getRolesFromToken(String token) {
        Object roles = parseClaims(token).get(CLAIM_ROLES);
        if (roles instanceof List<?> list) {
            return list.stream().map(Object::toString).collect(Collectors.toList());
        }
        return List.of();
    }

    /** Kiểm tra token có phải access type không */
    public boolean isAccessToken(String token) {
        try {
            return TYPE_ACCESS.equals(getTokenType(token));
        } catch (Exception e) {
            return false;
        }
    }

    /** Kiểm tra token có phải pre-auth type không */
    public boolean isPreAuthToken(String token) {
        try {
            return TYPE_PRE_AUTH.equals(getTokenType(token));
        } catch (Exception e) {
            return false;
        }
    }

    public long getAccessTokenExpirySeconds() {
        return jwtProps.getAccessTokenExpiryMinutes() * 60;
    }

    public long getRefreshTokenExpiryDays() {
        return jwtProps.getRefreshTokenExpiryDays();
    }
}
