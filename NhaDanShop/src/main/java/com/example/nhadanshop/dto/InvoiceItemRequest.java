package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record InvoiceItemRequest(
        @NotNull Long productId,
        @NotNull @Min(1) Integer quantity,
        /** Chiết khấu % trên dòng này (0–100), null = 0 */
        @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
        /**
         * ID variant đóng gói (Sprint 0).
         * null → tự động dùng default variant của productId.
         */
        Long variantId,
        /**
         * ID combo (KiotViet model).
         * Khi truyền comboId: hệ thống tự expand combo thành nhiều line items,
         * mỗi item đều được gán combo_source_id = comboId.
         * productId/variantId bị bỏ qua khi comboId != null.
         */
        Long comboId
) {}
