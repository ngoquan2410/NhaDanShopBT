package com.example.nhadanshop.dto;

public record PendingOrderConfirmResponse(
        PendingOrderResponse pendingOrder,
        SalesInvoiceResponse invoice
) {}
