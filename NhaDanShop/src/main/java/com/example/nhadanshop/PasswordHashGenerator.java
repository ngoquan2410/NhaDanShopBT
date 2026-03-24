package com.example.nhadanshop;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * Utility để generate BCrypt hash - chạy 1 lần để lấy hash chính xác
 * Run: ./gradlew bootRun --main-class=com.example.nhadanshop.PasswordHashGenerator
 */
public class PasswordHashGenerator {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        System.out.println("admin123 = " + encoder.encode("admin123"));
        System.out.println("user123  = " + encoder.encode("user123"));

        // Verify hash từ DB
        String adminHashFromDb = "$$2b$10$GxZcc8ZPqFMomac1kfTUc.kb0wvSjxoJuvaeS/.x74p6hupMBDwfm";
        String userHashFromDb  = "$2a$10$N.YYHSMQyGu4D8YNS1B0HOdN4lgSN/8B0TJaKH5jbVPvYJuM5X5kC";

        System.out.println("DB admin hash matches 'admin123': " + encoder.matches("admin123", adminHashFromDb));
        System.out.println("DB user  hash matches 'user123' : " + encoder.matches("user123", userHashFromDb));
    }
}
