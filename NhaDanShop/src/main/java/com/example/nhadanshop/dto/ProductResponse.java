package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProductResponse(
        Long id,
        String code,
        String name,
        /** Đơn vị gốc nhập vào hệ thống */
        String unit,
        BigDecimal costPrice,
        BigDecimal sellPrice,
        /** Tồn kho tính theo đơn vị bán lẻ (bịch/gói) */
        Integer stockQty,
        /** Tồn kho khả dụng = stockQty - tổng qty đang giữ bởi PENDING orders */
        Integer availableQty,
        Boolean active,
        Long categoryId,
        String categoryName,
        Integer expiryDays,

        // ── Quy đổi đơn vị nhập → bán lẻ ──────────────────────────
        /** Đơn vị nhập kho (kg, xâu, hộp...) */
        String importUnit,
        /** Đơn vị bán lẻ (bịch, gói, chai...) */
        String sellUnit,
        /** Số đơn vị bán lẻ / 1 đơn vị nhập */
        Integer piecesPerImportUnit,
        /** Ghi chú quy đổi */
        String conversionNote,

        /** URL hình ảnh sản phẩm */
        String imageUrl,

        /** Loại sản phẩm: SINGLE (mặc định) hoặc COMBO */
        String productType,

        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
