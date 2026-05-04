package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record AccountProfileUpdateRequest(
        @Size(max = 150) String fullName,
        @Size(max = 30) String phone,
        @Size(max = 100) String email,
        @Size(max = 300) String address
) {}
