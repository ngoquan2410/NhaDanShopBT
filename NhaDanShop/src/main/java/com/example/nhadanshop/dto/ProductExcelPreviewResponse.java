package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Kết quả preview file Excel import sản phẩm — KHÔNG ghi DB.
 * FE dùng để hiển thị danh sách rows kèm trạng thái lỗi/hợp lệ
 * trước khi admin xác nhận import.
 *
 * canImport = true chỉ khi errorRows == 0 && totalRows > 0
 */
public record ProductExcelPreviewResponse(
        int totalRows,
        int validRows,
        int skipRows,        // trùng mã/tên → sẽ bỏ qua (không phải lỗi)
        int errorRows,
        boolean canImport,
        List<ProductPreviewRow> rows,
        List<String> warnings
) {

    public record ProductPreviewRow(
            int lineNumber,
            // Dữ liệu đọc từ Excel — layout 13 cột A-M (không có cột Đơn vị cũ)
            String code,            // Cột A: Mã SP
            String name,            // Cột B: Tên SP (*)
            String categoryName,    // Cột C: Danh mục (*)
            BigDecimal costPrice,   // Cột D: Giá vốn (*)
            BigDecimal sellPrice,   // Cột E: Giá bán (*)
            Integer stockQty,       // Cột F: Tồn kho ban đầu
            Integer expiryDays,     // Cột G: Hạn dùng
            Boolean active,         // Cột H: Hoạt động
            String importUnit,      // Cột I: ĐV nhập kho
            String sellUnit,        // Cột J: ĐV bán lẻ (*) — bắt buộc
            Integer piecesPerUnit,  // Cột K: Số lẻ/ĐV nhập
            String conversionNote,  // Cột L: Ghi chú
            // Trạng thái sau validate
            boolean isValid,
            boolean willSkip,
            boolean isNewCategory,
            boolean isAutoCode,
            String resolvedCode,
            String status,
            String errorMessage,
            String warningMessage
    ) {}
}
