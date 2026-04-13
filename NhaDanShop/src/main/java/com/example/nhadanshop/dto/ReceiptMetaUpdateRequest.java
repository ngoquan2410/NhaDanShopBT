package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * PATCH /api/receipts/{id}/meta
 * Chỉ cho sửa metadata (ghi chú, nhà cung cấp, ngày nhập) — KHÔNG ảnh hưởng tồn kho / giá vốn.
 */
public record ReceiptMetaUpdateRequest(
        @Size(max = 500) String note,
        Long supplierId,
        @Size(max = 150) String supplierName,
        /** Ngày nhập kho — null → không đổi. Không được là tương lai. */
        LocalDate receiptDate
) {}
