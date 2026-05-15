package com.example.nhadanshop.dto;

public record PromotionBuyItemRequest(
        Long productId,
        Integer buyQty,
        Integer sortOrder
) {
    public PromotionBuyItemRequest(Long productId, Integer buyQty) {
        this(productId, buyQty, null);
    }
}
