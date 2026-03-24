package com.example.nhadanshop.dto;

import java.time.LocalDateTime;
import java.util.Set;

public record UserResponse(
        Long id,
        String username,
        String fullName,
        Boolean isActive,
        Set<String> roles,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
