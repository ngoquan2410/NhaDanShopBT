package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record LoyaltyRedemptionSnapshotDto(
        Long customerId,
        Long requestedPoints,
        Long redeemedPoints,
        BigDecimal discountAmount,
        Long availablePointsBefore,
        String policy
) {}
