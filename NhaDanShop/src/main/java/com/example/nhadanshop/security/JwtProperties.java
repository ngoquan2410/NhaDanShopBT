package com.example.nhadanshop.security;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtProperties {
    /** HMAC-SHA256 secret key (ít nhất 256-bit / 32 ký tự) */
    private String secret = "changeme_256bit_secret_key_here!";
    /** Access token TTL tính bằng phút */
    private long accessTokenExpiryMinutes = 30;
    /** Refresh token TTL tính bằng ngày */
    private long refreshTokenExpiryDays = 7;
}
