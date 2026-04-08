package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record StockAdjustmentRequest(
        @NotBlank String reason,        // EXPIRED | DAMAGED | LOST | STOCKTAKE | OTHER
        @Size(max = 500) String note,
        @NotNull @Valid List<ItemRequest> items
) {
    public record ItemRequest(
            @NotNull Long variantId,
            @NotNull @Min(0) Integer actualQty, // số lượng thực tế đếm được
            @Size(max = 200) String note
    ) {}
}
