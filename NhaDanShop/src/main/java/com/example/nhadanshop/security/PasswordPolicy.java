package com.example.nhadanshop.security;

/**
 * Strong password rules aligned with storefront/admin signup and reset flows.
 */
public final class PasswordPolicy {

    private PasswordPolicy() {
    }

    public static void validate(String password, String username) {
        if (password == null) {
            throw new IllegalArgumentException("Mật khẩu không được để trống");
        }
        if (password.length() < 10 || password.length() > 100) {
            throw new IllegalArgumentException("Mật khẩu phải từ 10–100 ký tự");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new IllegalArgumentException("Mật khẩu phải có ít nhất một chữ thường");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new IllegalArgumentException("Mật khẩu phải có ít nhất một chữ hoa");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new IllegalArgumentException("Mật khẩu phải có ít nhất một chữ số");
        }
        if (!password.matches(".*[^A-Za-z0-9].*")) {
            throw new IllegalArgumentException("Mật khẩu phải có ít nhất một ký tự đặc biệt");
        }
        if (username != null && !username.isBlank()) {
            String u = username.trim().toLowerCase();
            if (!u.isEmpty() && password.toLowerCase().contains(u)) {
                throw new IllegalArgumentException("Mật khẩu không được chứa tên đăng nhập");
            }
        }
    }
}
