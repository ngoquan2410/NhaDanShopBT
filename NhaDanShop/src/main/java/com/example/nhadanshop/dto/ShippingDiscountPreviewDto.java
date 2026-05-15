package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record ShippingDiscountPreviewDto(
        BigDecimal maxDiscount,
        boolean pendingAddress
) {}
