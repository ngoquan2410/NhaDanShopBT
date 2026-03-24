package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request đăng ký tài khoản user mới (public endpoint, không cần auth).
 * Role mặc định: ROLE_USER.
 */
public record SignUpRequest(
        @NotBlank @Size(min = 3, max = 100, message = "Tên đăng nhập phải từ 3-100 ký tự") String username,
        @NotBlank @Size(min = 6, max = 100, message = "Mật khẩu phải từ 6-100 ký tự") String password,
        @Size(max = 150) String fullName
) {}
