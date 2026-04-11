package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

/**
 * PATCH /api/invoices/{id}/cancel
 * Hủy hóa đơn — Soft Cancel (không xóa vật lý, hoàn tồn kho).
 */
public record CancelInvoiceRequest(
        @Size(max = 500) String reason
) {}
