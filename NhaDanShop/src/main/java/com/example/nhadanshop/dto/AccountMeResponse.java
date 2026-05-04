package com.example.nhadanshop.dto;

import java.util.Set;

public record AccountMeResponse(
        Long userId,
        String username,
        String fullName,
        Set<String> roles,
        Long customerId,
        String customerCode,
        String customerName,
        String phone,
        String email,
        String address,
        CustomerPointsSummaryResponse points
) {}
