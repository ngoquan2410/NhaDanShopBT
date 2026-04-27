package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record ShippingQuoteSnapshotDto(
        @Size(max = 50) String source,
        @Size(max = 100) String zoneCode,
        BigDecimal fee,
        EtaDaysDto etaDays
) {
    public record EtaDaysDto(
            Integer min,
            Integer max
    ) {}
}
