package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record CancelOrderRequest(
        @Size(max = 255) String reason
) {}
