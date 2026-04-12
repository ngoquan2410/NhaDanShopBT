package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SupplierRequest(
        @Size(max = 50) String code,
        @NotBlank @Size(max = 150) String name,
        @Size(max = 20) String phone,
        @Size(max = 300) String address,
        @Size(max = 30) String taxCode,
        @Size(max = 100) String email,
        @Size(max = 500) String note,
        Boolean active
) {}
