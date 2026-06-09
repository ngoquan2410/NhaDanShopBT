package com.example.nhadanshop.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ReceiptItemRequest(
        @NotNull Long productId,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal quantity,
        @NotNull @DecimalMin("0.00") BigDecimal unitCost,
        @DecimalMin("0.00") @DecimalMax("100.00") BigDecimal discountPercent,
        /**
         * Optional catalog current sell price update. It is pricing metadata only;
         * receipt totals and batch cost continue to use unitCost/allocation fields.
         */
        @DecimalMin("0.00") BigDecimal sellPrice,
        /**
         * Optional catalog sellable update. Applied only when isSellableExplicit=true.
         */
        Boolean isSellable,
        Boolean isSellableExplicit,
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
) {
    public ReceiptItemRequest(
            Long productId,
            Integer quantity,
            BigDecimal unitCost,
            BigDecimal discountPercent,
            BigDecimal sellPrice,
            Boolean isSellable,
            Boolean isSellableExplicit,
            String importUnit,
            Integer piecesOverride,
            Long variantId,
            LocalDate expiryDateOverride
    ) {
        this(
                productId,
                quantity != null ? BigDecimal.valueOf(quantity) : null,
                unitCost,
                discountPercent,
                sellPrice,
                isSellable,
                isSellableExplicit,
                importUnit,
                piecesOverride,
                variantId,
                expiryDateOverride
        );
    }
}
