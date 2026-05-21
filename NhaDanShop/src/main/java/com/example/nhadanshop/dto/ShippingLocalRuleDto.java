package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record ShippingLocalRuleDto(
        boolean enabled,
        @NotBlank String zoneCode,
        @NotBlank String label,
        @Min(0) int fee,
        @NotNull @Valid ShippingZoneRuleDto.EtaDaysDto etaDays,
        List<String> provinceCodes,
        List<String> provinceNames,
        List<String> districtCodes,
        List<String> districtNames,
        List<String> wardCodes,
        List<String> wardNames
) {
}
