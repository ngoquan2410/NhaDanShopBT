package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Kết quả preview file Excel nhập kho — KHÔNG ghi DB.
 * FE dùng để hiển thị danh sách rows, đánh dấu lỗi,
 * tính tổng chi phí trước khi admin xác nhận tạo phiếu.
 */
public record ExcelPreviewResponse(
        /** Tổng số dòng data đọc được từ file */
        int totalRows,
        /** Số dòng hợp lệ */
        int validRows,
        /** Số dòng lỗi */
        int errorRows,
        /** Có thể tạo phiếu không (errorRows == 0) */
        boolean canImport,
        /** Tổng tiền gốc (trước CK, ship, VAT) */
        BigDecimal totalAmount,
        /** Tổng sau CK */
        BigDecimal totalAfterDiscount,
        /** Chi tiết từng dòng */
        List<PreviewRow> rows,
        /** Warnings toàn file */
        List<String> warnings
) {
    /**
     * Một dòng trong file Excel.
     * isCombo = true khi mã SP là combo → hệ thống sẽ expand thành phần.
     * isNew   = true khi SP chưa tồn tại → sẽ tạo mới.
     */
    public record PreviewRow(
            int lineNumber,         // số dòng trong file (1-based, tính từ header)
            String sheet,           // "SP_DON" | "COMBO"
            String productCode,
            String variantCode,
            String productName,
            Integer quantity,
            BigDecimal unitCost,
            BigDecimal sellPrice,
            BigDecimal discountPercent,
            BigDecimal lineTotal,   // quantity × unitCost × (1 - disc%)
            String importUnit,
            String sellUnit,
            Integer pieces,
            String note,
            // Trạng thái
            boolean isValid,
            boolean isCombo,
            boolean isNew,          // SP mới sẽ được tạo
            String status,          // "OK" | "COMBO_EXPAND" | "NEW_PRODUCT" | "NEW_VARIANT"
            String errorMessage,    // null nếu hợp lệ
            String warningMessage   // null nếu không có cảnh báo
    ) {}
}
