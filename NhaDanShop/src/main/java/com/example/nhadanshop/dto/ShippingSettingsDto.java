package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record ShippingSettingsDto(
        @NotEmpty @Valid List<ShippingZoneRuleDto> zoneRules,
        @Valid List<ShippingLocalRuleDto> localRules,
        @NotNull @Valid ShippingParcelDefaultsDto parcelDefaults
) {
}
