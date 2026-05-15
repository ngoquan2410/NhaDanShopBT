package com.example.nhadanshop.dto;

public record PendingOrderCountsResponse(
        long all,
        long pendingPayment,
        long waitingConfirm,
        long paidAuto,
        long confirmed,
        long cancelled
) {}
