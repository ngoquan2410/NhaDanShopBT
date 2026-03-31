package com.example.nhadanshop.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PromotionRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 1000) String description,

        /** PERCENT_DISCOUNT | FIXED_DISCOUNT | BUY_X_GET_Y | FREE_SHIPPING */
        @NotBlank String type,

        @DecimalMin("0.00") BigDecimal discountValue,
        @DecimalMin("0.00") BigDecimal minOrderValue,
        BigDecimal maxDiscount,

        @NotNull LocalDateTime startDate,
        @NotNull LocalDateTime endDate,

        /** ALL | CATEGORY | PRODUCT */
        String appliesTo,

        /** IDs của danh mục áp dụng (khi appliesTo=CATEGORY) */
        List<Long> categoryIds,

        /** IDs của sản phẩm áp dụng (khi appliesTo=PRODUCT) */
        List<Long> productIds,

        Boolean active
) {}
