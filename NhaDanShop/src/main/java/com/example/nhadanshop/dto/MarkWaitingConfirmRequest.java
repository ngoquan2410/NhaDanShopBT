package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record MarkWaitingConfirmRequest(
        @Size(max = 500) String note
) {}
