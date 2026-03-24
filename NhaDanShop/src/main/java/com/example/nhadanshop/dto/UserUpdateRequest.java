package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Set;

/** Dùng cho PATCH update user – password và roles optional */
public record UserUpdateRequest(
        @Size(max = 150) String fullName,
        @Size(min = 6, max = 100) String password,
        Boolean isActive,
        Set<String> roles
) {}
