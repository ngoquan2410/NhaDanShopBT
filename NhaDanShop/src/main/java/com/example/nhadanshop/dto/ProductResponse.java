package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record ProductResponse(
        Long id,
        String code,
        String name,
        String unit,
        BigDecimal costPrice,
        BigDecimal sellPrice,
        Integer stockQty,
        Integer availableQty,
        Boolean active,
        Long categoryId,
        String categoryName,
        Integer expiryDays,
        String importUnit,
        String sellUnit,
        Integer piecesPerImportUnit,
        String conversionNote,
        String imageUrl,
        String productType,
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


