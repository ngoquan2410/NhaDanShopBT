package com.example.nhadanshop.dto;

public record CustomerPointsSummaryResponse(
        Long customerId,
        Long pointBalance,
        Long pointReserved,
        Long availablePoints,
        Long lifetimePointsEarned,
        Long lifetimePointsRedeemed
) {}
