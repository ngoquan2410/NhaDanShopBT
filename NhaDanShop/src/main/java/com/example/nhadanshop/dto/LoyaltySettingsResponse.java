package com.example.nhadanshop.dto;

import java.math.BigDecimal;

public record LoyaltySettingsResponse(
        boolean enabled,
        BigDecimal earnMoneyAmount,
        Long earnPoints,
        BigDecimal redeemValuePerPoint,
        Long minimumRedeemPoints,
        BigDecimal maxRedeemPercent
) {}
