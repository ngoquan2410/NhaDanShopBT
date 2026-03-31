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
        /** Chiết khấu % nhà cung cấp (0-100), mặc định 0 */
        @DecimalMin("0.00") @DecimalMax("100.00") BigDecimal discountPercent
) {}
