package com.example.nhadanshop.dto;

public record PromotionProgressItemDto(
        long productId,
        String productName,
        int requiredQty,
        int currentQty,
        int missingQty
) {}
