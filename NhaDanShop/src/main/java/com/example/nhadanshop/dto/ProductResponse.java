package com.example.nhadanshop.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ProductResponse(
        Long id,
        String code,
        String name,
        Boolean active,
        Long categoryId,
        String categoryName,
        String productType,
        String imageUrl,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,

        /**
         * Danh sách biến thể đóng gói (Sprint 0).
         * - SINGLE product: 1..N variants
         * - COMBO product: empty (combo không có variant)
         * Nếu chỉ có 1 default variant → UI ẩn dropdown, UX giống cũ.
         */
        List<ProductVariantResponse> variants
) {}


