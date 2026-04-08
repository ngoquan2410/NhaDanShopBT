package com.example.nhadanshop.dto;

import java.time.LocalDateTime;

public record SupplierResponse(
        Long id,
        String code,
        String name,
        String phone,
        String address,
        String taxCode,
        String email,
        String note,
        Boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
