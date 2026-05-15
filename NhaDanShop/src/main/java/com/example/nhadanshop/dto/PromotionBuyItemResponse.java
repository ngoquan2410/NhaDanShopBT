package com.example.nhadanshop.dto;

public record PromotionBuyItemResponse(
        Long productId,
        String productName,
        String productCode,
        int buyQty,
        int sortOrder
) {}
