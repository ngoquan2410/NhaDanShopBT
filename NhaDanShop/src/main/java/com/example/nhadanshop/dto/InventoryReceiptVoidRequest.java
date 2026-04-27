package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

/**
 * Request body for PATCH /api/receipts/{id}/void.
 * All fields optional; omit body or use empty JSON {@code {}}.
 */
public record InventoryReceiptVoidRequest(
        @Size(max = 2000) String reason,
        @Size(max = 255) String voidedBy
) {}
