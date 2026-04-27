package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ShippingQuoteResponse(
        String status,
        String source,
        String zoneCode,
        BigDecimal fee,
        EtaDaysDto etaDays,
        String reasonIfUnavailable,
        Boolean freeShipApplied,
        Boolean usedFallback,
        String fallbackReason,
        Long latencyMs,
        String attemptedAt
) {
    public record EtaDaysDto(
            Integer min,
            Integer max
    ) {}
}
