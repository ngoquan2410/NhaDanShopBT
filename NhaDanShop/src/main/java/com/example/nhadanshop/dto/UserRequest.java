package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record UserRequest(
        @NotBlank @Size(max = 100) String username,
        @NotBlank @Size(min = 6, max = 100) String password,
        @Size(max = 150) String fullName,
        @NotEmpty Set<String> roles  // e.g. ["ROLE_ADMIN"] or ["ROLE_USER"]
) {}
