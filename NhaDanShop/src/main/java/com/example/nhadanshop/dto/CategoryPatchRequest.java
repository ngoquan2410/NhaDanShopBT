package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

/** Partial update (PATCH). Null = leave unchanged. */
public record CategoryPatchRequest(
        @Size(max = 100) String name,
        @Size(max = 255) String description,
        Boolean active
) {}
