package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ReceiptItemRequest(
        @NotNull Long productId,
        @NotNull @Min(1) Integer quantity,
        @NotNull @DecimalMin("0.00") BigDecimal unitCost,
        @DecimalMin("0.00") @DecimalMax("100.00") BigDecimal discountPercent,
        String importUnit,
        @Min(1) Integer piecesOverride,

        /**
         * ID variant đóng gói (Sprint 0).
         * null → tự động dùng default variant của productId.
         * Ví dụ: nhập Muối ABC dạng hủ → variantId = ID của ABC-HU100
         */
        Long variantId
) {}


