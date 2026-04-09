package com.example.nhadanshop.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record ProductVariantRequest(
        /**
         * Mã variant — bắt buộc, unique toàn hệ thống.
         * Ví dụ: "ABC-HU100", "ABC-GOI50"
         * Với SP chỉ có 1 variant: dùng product.code làm variant_code.
         */
        @NotBlank @Size(max = 60) String variantCode,

        /** Tên hiển thị: "Muối Hủ 100g", "Muối Gói 50g" */
        @NotBlank @Size(max = 200) String variantName,

        /** Đơn vị bán lẻ: "hủ", "gói", "bịch", "chai" */
        @NotBlank @Size(max = 20) String sellUnit,

        /** Đơn vị nhập kho: "kg", "xâu", "bịch" */
        @Size(max = 20) String importUnit,

        /**
         * Số ĐV bán lẻ / 1 ĐV nhập.
         * VD: 1kg=10hủ → piecesPerUnit=10; 1bịch=1bịch → piecesPerUnit=1
         */
        @Min(1) Integer piecesPerUnit,

        /**
         * Giá bán — optional khi tạo mới.
         * Điền sau khi biết giá vốn thực từ lần nhập kho đầu tiên.
         * null/0 → SP vẫn tạo được, cần cập nhật trước khi bán.
         */
        @DecimalMin("0.00") BigDecimal sellPrice,

        /**
         * Giá vốn — optional khi tạo mới.
         * Hệ thống tự tính và overwrite mỗi lần nhập kho (FEFO weighted avg).
         */
        @DecimalMin("0.00") BigDecimal costPrice,

        /** Tồn kho ban đầu — thường = 0 */
        @Min(0) Integer stockQty,

        /** Ngưỡng cảnh báo tồn kho tối thiểu */
        @Min(0) Integer minStockQty,

        @Min(0) Integer expiryDays,

        /** TRUE = variant chính (tự động chọn khi không chỉ định) */
        Boolean isDefault,

        String imageUrl,

        @Size(max = 100) String conversionNote
) {}
