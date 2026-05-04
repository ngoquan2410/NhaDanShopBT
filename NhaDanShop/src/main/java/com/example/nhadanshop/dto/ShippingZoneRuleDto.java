package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record ShippingZoneRuleDto(
        @NotBlank String zoneCode,
        @NotBlank String label,
        @Min(0) int baseFee,
        @Min(0) Integer freeShipThreshold,
        @NotNull @Valid EtaDaysDto etaDays,
        @NotEmpty List<@NotBlank String> provinceCodes
) {
    public record EtaDaysDto(@Min(1) int min, @Min(1) int max) {
    }
}
