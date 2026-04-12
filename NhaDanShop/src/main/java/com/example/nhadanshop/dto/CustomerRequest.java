package com.example.nhadanshop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CustomerRequest(
        @Size(max = 50) String code,
        @NotBlank @Size(max = 150) String name,
        @Size(max = 20) String phone,
        @Size(max = 300) String address,
        @Size(max = 100) String email,
        /** RETAIL | WHOLESALE | VIP — mặc định RETAIL nếu null */
        String group,
        @Size(max = 500) String note,
        Boolean active
) {}
