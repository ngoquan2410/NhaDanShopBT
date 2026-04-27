package com.example.nhadanshop.dto;

public record PaymentEventLinkResponse(
        PaymentEventResponse paymentEvent,
        PendingOrderResponse pendingOrder,
        boolean autoConfirmed
) {}
