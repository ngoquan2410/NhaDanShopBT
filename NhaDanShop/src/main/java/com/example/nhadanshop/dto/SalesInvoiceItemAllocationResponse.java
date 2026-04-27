package com.example.nhadanshop.dto;

/**
 * Read-only: per-row batch allocation for an invoice line (FEFO deduction trace).
 * {@code qty} maps from {@code SalesInvoiceItemBatchAllocation.deductedQty}.
 * {@code lotCode} mirrors {@code batchCode} for clients that use either name.
 */
public record SalesInvoiceItemAllocationResponse(
        Long batchId,
        String batchCode,
        String lotCode,
        int qty
) {}
