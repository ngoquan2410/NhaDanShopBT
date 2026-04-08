package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

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
         */
        Long variantId,

        /**
         * Ngày HSD thực tế in trên bao bì (Sprint 1 — S1-2).
         * null → tự tính: importDate + variant.expiryDays
         * Nếu có → dùng ngày này cho productBatch.expiry_date (FEFO đúng).
         */
        LocalDate expiryDateOverride
) {}
