package com.example.nhadanshop.dto;

import java.util.List;

public record PublicProductResponse(
        Long id,
        String code,
        String name,
        Long categoryId,
        String categoryName,
        String productType,
        String imageUrl,
        List<PublicVariantResponse> variants
) {}
