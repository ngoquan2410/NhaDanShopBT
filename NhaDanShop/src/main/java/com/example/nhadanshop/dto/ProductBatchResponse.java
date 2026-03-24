package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Response DTO cho lô hàng (ProductBatch).
 *
 * @param id            ID lô hàng
 * @param batchCode     Mã lô
 * @param productId     ID sản phẩm
 * @param productCode   Mã sản phẩm
 * @param productName   Tên sản phẩm
 * @param receiptNo     Số phiếu nhập (null nếu tạo thủ công)
 * @param mfgDate       Ngày sản xuất
 * @param expiryDate    Ngày hết hạn thực tế
 * @param daysUntilExpiry Số ngày còn lại (âm = đã hết hạn)
 * @param importQty     Số lượng nhập ban đầu (đơn vị bán lẻ)
 * @param remainingQty  Số lượng còn lại trong lô
 * @param costPrice     Giá vốn lô này
 * @param expired       true nếu đã hết hạn
 * @param createdAt     Thời điểm tạo lô
 */
public record ProductBatchResponse(
        Long id,
        String batchCode,
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        String receiptNo,
        LocalDate mfgDate,
        LocalDate expiryDate,
        long daysUntilExpiry,
        int importQty,
        int remainingQty,
        BigDecimal costPrice,
        boolean expired,
        LocalDateTime createdAt
) {}
