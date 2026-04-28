package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SalesInvoiceRequest(
        @Size(max = 150) String customerName,
        /** FK → customers.id (Sprint 2). Null = khách vãng lai */
        Long customerId,
        @Size(max = 500) String note,
        /** ID chương trình khuyến mãi muốn áp dụng (nullable) */
        Long promotionId,
        /** Lines for legacy catalog recompute. Omit or leave empty when {@link #quotePublicId} is set. */
        @Valid List<InvoiceItemRequest> items,
        /** Backend quote id (UUID). Quote mode: pricing from stored snapshot; items ignored. */
        @Size(max = 36) String quotePublicId,
        /** Persisted on invoice when provided (quote mode, legacy optional). */
        @Size(max = 20) String paymentMethod
) {
    /** Retained for tests and legacy call sites — omits {@code paymentMethod}. */
    public SalesInvoiceRequest(
            String customerName,
            Long customerId,
            String note,
            Long promotionId,
            List<InvoiceItemRequest> items,
            String quotePublicId) {
        this(customerName, customerId, note, promotionId, items, quotePublicId, null);
    }
}
