package com.example.nhadanshop.dto;

public record CassoWebhookResponse(
        int received,
        int upserted,
        int autoLinked,
        int markedPaidAuto
) {}
