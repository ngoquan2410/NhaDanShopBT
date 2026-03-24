package com.example.nhadanshop.dto;

import java.time.LocalDate;

/**
 * Cảnh báo hết hạn theo LÔ HÀNG (ProductBatch).
 *
 * Công thức đúng:
 *   expiryDate = ngày nhập lô + product.expiryDays  (tính khi tạo Batch)
 *   daysRemaining = expiryDate - today
 *
 * Cảnh báo khi: daysRemaining <= threshold (mặc định 30 ngày)
 * Hết hạn khi:  daysRemaining <= 0
 */
public record ExpiryWarningResponse(
        Long batchId,
        String batchCode,
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        int remainingQty,       // số lượng còn lại trong lô (đơn vị bán lẻ)
        LocalDate expiryDate,   // ngày hết hạn thực tế của lô
        long daysRemaining,     // số ngày còn lại (expiryDate - today)
        String warningMessage
) {}
