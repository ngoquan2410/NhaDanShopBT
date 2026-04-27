package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AddressPlaceDetailResponse(
        Boolean quotaExceeded,
        Result result,
        Boolean dryRun,
        Boolean cached
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Result(
            @JsonProperty("place_id") String placeId,
            @JsonProperty("formatted_address") String formattedAddress,
            String name,
            Compound compound,
            Geometry geometry,
            @JsonProperty("address_components") JsonNode addressComponents
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Compound(
            String province,
            String district,
            String commune
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Geometry(
            Location location
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Location(
            Double lat,
            Double lng
    ) {}
}
