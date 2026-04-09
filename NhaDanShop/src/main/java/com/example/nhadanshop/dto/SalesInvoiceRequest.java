package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SalesInvoiceRequest(
        @Size(max = 150) String customerName,
        /** FK → customers.id (Sprint 2). Null = khách vãng lai */
        Long customerId,
        @Size(max = 500) String note,
        /** ID chương trình khuyến mãi muốn áp dụng (nullable) */
        Long promotionId,
        @NotEmpty @Valid List<InvoiceItemRequest> items
) {}
