package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record ConfirmPendingOrderRequest(
        @Size(max = 500) String note,
        @Size(max = 100) String confirmedBy
) {}
