package com.example.nhadanshop.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
@RequiredArgsConstructor
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    // Đọc từ application.properties: cors.allowed-origins=http://localhost:5173,http://13.251.16.99
    // Nếu không set → dùng default localhost
    @Value("${cors.allowed-origins:http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:3000}")
    private String allowedOriginsRaw;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // Parse danh sách origins từ properties (comma-separated)
        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());

        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(false);
        config.setExposedHeaders(List.of("Content-Disposition"));
        config.setMaxAge(3600L); // cache preflight 1 giờ

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .headers(headers -> headers.frameOptions(fo -> fo.sameOrigin()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/h2-console/**").permitAll()
                        .requestMatchers("/debug/**").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Actuator health check - MUST be public for CI/CD and monitoring
                        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                        // Auth public
                        .requestMatchers("/api/auth/login", "/api/auth/verify-totp", "/api/auth/refresh", "/api/auth/signup",
                                "/api/auth/logout", "/api/auth/forgot-password", "/api/auth/reset-password").permitAll()
                        .requestMatchers("/api/auth/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/loyalty/settings").permitAll()
                        .requestMatchers("/api/account/**").authenticated()
                        .requestMatchers("/api/customers/**").hasRole("ADMIN")
                        // Image
                        .requestMatchers(HttpMethod.GET, "/api/images/status").permitAll()
                        .requestMatchers("/api/images/**").hasRole("ADMIN")
                        // Store public
                        .requestMatchers(HttpMethod.GET, "/api/products/**", "/api/categories/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/combos/active").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/vouchers/active").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/promotions/active").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/promotions/evaluate", "/api/promotions/pick-best").permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/addresses/provinces",
                                "/api/addresses/districts",
                                "/api/addresses/wards",
                                "/api/address-autocomplete",
                                "/api/address-place-detail")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/shipping/settings").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/shipping/settings").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/shipping/quote").permitAll()
                        // Public temporarily for current checkout/pending-payment compatibility.
                        // A later slice should split this from the fuller admin settings surface.
                        .requestMatchers(HttpMethod.GET, "/api/store/payment-settings").permitAll()
                        // Public generation stays for live stored settings; preview overrides are
                        // rejected for anonymous callers inside VietQrController.
                        .requestMatchers(HttpMethod.POST, "/api/vietqr/generate").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/webhooks/casso").permitAll()
                        .requestMatchers(HttpMethod.PUT, "/api/store/payment-settings").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/products/check-availability").authenticated()
                        // Admin
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/reports/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/inventory/**").authenticated()
                        .requestMatchers("/api/inventory/**").hasRole("ADMIN")
                        // Receipts
                        .requestMatchers(HttpMethod.GET, "/api/receipts/**").authenticated()
                        .requestMatchers("/api/receipts/**").hasRole("ADMIN")
                        // Invoices — list/read for authenticated (admin UI + customer/session parity);
                        // mutate (create POS/hủy): admin-only.
                        .requestMatchers(HttpMethod.GET, "/api/invoices/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/sales/quote").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/invoices/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/invoices/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/invoices/**").hasRole("ADMIN")
                        // POS traceability scan (Slice 6B): authenticated same as invoice create/read surface
                        .requestMatchers(HttpMethod.GET, "/api/pos/scan/**").authenticated()
                        // Pending orders
                        .requestMatchers(HttpMethod.POST, "/api/pending-orders").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/pending-orders/by-code/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/pending-orders/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/pending-orders/*/mark-waiting-confirm").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/pending-orders/*/change-payment-method").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/pending-orders").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/pending-orders/*/confirm").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/pending-orders/*/cancel").hasRole("ADMIN")
                        .requestMatchers("/api/payment-events/**").hasRole("ADMIN")
                        // Products & categories CRUD
                        .requestMatchers(HttpMethod.POST, "/api/promotions").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/promotions/*").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/promotions/*/toggle").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/promotions/*").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/categories/**", "/api/products/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/categories/**", "/api/products/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/categories/**", "/api/products/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/categories/**", "/api/products/**").hasRole("ADMIN")
                        // Batches
                        .requestMatchers(HttpMethod.GET, "/api/batches/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/batches/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/batches/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/batches/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/batches/**").hasRole("ADMIN")
                        // Suppliers (Sprint 1 S1-3)
                        .requestMatchers(HttpMethod.GET, "/api/suppliers/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/suppliers/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/suppliers/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/suppliers/**").hasRole("ADMIN")
                        // Stock Adjustments (Sprint 1 S1-4)
                        .requestMatchers(HttpMethod.GET, "/api/stock-adjustments/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/stock-adjustments/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/stock-adjustments/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/stock-adjustments/**").hasRole("ADMIN")
                        .requestMatchers("/api/production-recipes/**").hasRole("ADMIN")
                        .requestMatchers("/api/production-orders/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                );
        return http.build();
    }
}