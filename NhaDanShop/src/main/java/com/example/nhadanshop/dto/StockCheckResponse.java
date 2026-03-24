package com.example.nhadanshop.dto;

import java.util.List;

public record StockCheckResponse(
        boolean allAvailable,
        List<Conflict> conflicts
) {
    public record Conflict(
            Long productId,
            String productName,
            String unit,
            int requested,
            int available  // availableQty = stockQty - pending reserved
    ) {}
}
