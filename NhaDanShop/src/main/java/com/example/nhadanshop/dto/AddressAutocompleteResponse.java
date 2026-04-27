package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AddressAutocompleteResponse(
        Boolean quotaExceeded,
        List<Prediction> predictions,
        Boolean dryRun,
        Boolean cached
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Prediction(
            @JsonProperty("place_id") String placeId,
            String description,
            @JsonProperty("structured_formatting") StructuredFormatting structuredFormatting
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record StructuredFormatting(
            @JsonProperty("main_text") String mainText,
            @JsonProperty("secondary_text") String secondaryText
    ) {}
}
