package com.example.nhadanshop.controller;

import com.example.nhadanshop.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * DEBUG ONLY - xóa controller này sau khi fix xong 401
 */
@RestController
@RequestMapping("/debug")
@RequiredArgsConstructor
public class DebugController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /** GET /debug/users - xem users trong DB (không cần auth) */
    @GetMapping("/users")
    public Object listUsers() {
        return userRepository.findAll().stream().map(u -> Map.of(
                "id", u.getId(),
                "username", u.getUsername(),
                "active", u.getActive(),
                "roles", u.getRoles().stream()
                        .map(r -> r.getName()).collect(Collectors.toList()),
                "passwordHash", u.getPassword().substring(0, 20) + "..."
        )).collect(Collectors.toList());
    }

    /** GET /debug/verify?username=admin&password=admin123 - verify password match */
    @GetMapping("/verify")
    public Object verifyPassword(@RequestParam String username,
                                  @RequestParam String password) {
        return userRepository.findByUsername(username).map(u -> {
            boolean matches = passwordEncoder.matches(password, u.getPassword());
            return Map.of(
                    "username", u.getUsername(),
                    "passwordMatches", matches,
                    "active", u.getActive(),
                    "roles", u.getRoles().stream().map(r -> r.getName()).collect(Collectors.toList()),
                    "hashInDb", u.getPassword()
            );
        }).orElse(Map.of("error", "User not found: " + username));
    }

    /** GET /debug/hash?password=admin123 - generate BCrypt hash */
    @GetMapping("/hash")
    public Object generateHash(@RequestParam String password) {
        String hash = passwordEncoder.encode(password);
        return Map.of(
                "password", password,
                "bcryptHash", hash,
                "verify", passwordEncoder.matches(password, hash)
        );
    }

    /** POST /debug/reset-password?username=admin&newPassword=admin123 - reset password in DB */
    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/reset-password")
    public Object resetPassword(@RequestParam String username,
                                @RequestParam String newPassword) {
        return userRepository.findByUsername(username).map(u -> {
            String newHash = passwordEncoder.encode(newPassword);
            u.setPassword(newHash);
            userRepository.save(u);
            return Map.of(
                    "username", u.getUsername(),
                    "message", "Password updated successfully",
                    "newHash", newHash,
                    "verify", passwordEncoder.matches(newPassword, newHash)
            );
        }).orElse(Map.of("error", "User not found: " + username));
    }
}
