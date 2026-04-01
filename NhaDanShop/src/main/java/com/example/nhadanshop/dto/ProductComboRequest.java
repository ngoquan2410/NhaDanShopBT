package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public record ProductComboRequest(
        @Size(max = 50) String code,          // null → auto-generate
        @NotBlank @Size(max = 200) String name,
        @Size(max = 1000) String description,
        @NotNull @DecimalMin("0") BigDecimal sellPrice,
        Boolean active,
        @NotEmpty @Valid List<ComboItemRequest> items
) {
    public record ComboItemRequest(
            @NotNull Long productId,
            @NotNull @Min(1) Integer quantity
    ) {}
}
