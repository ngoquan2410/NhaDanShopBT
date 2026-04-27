package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

/**
 * Partial update (PATCH). Null = leave unchanged.
 */
public record ProductPatchRequest(
        @Size(max = 50) String code,
        @Size(max = 150) String name,
        Long categoryId,
        Boolean active,
        @Size(max = 500) String imageUrl,
        String productType
) {}
