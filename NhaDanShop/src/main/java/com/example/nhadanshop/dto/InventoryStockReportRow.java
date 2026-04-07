package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Một dòng báo cáo tồn kho cho 1 variant trong kỳ.
 *
 * Công thức:
 *   closingStock = openingStock + totalReceived - totalSold
 *
 *   openingStock  = stockQty hiện tại trước kỳ (tính ngược từ hiện tại)
 *   totalReceived = tổng nhập trong kỳ
 *   totalSold     = tổng xuất (bán) trong kỳ
 *   closingStock  = tồn cuối kỳ
 *
 *   [Sprint 0] Thêm variantId/variantCode/variantName để báo cáo theo variant.
 *   Backward compat: variantId = null → dòng báo cáo theo product (legacy).
 */
public record InventoryStockReportRow(
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
        /** [Sprint 0] Variant ID — null nếu SP chưa có variant */
        Long variantId,
        /** [Sprint 0] Mã variant — fallback product.code nếu null */
        String variantCode,
        /** [Sprint 0] Tên variant — fallback product.name nếu null */
        String variantName,
        /** Tồn đầu kỳ (đơn vị bán lẻ) */
        int openingStock,
        /** Tổng nhập kỳ (đơn vị bán lẻ) */
        int totalReceived,
        /** Tổng xuất (bán) kỳ (đơn vị bán lẻ) */
        int totalSold,
        /** Tồn cuối kỳ = openingStock + totalReceived - totalSold */
        int closingStock,
        /** Giá vốn tồn kho cuối kỳ */
        BigDecimal closingStockValue,
        /** [Sprint 0 - P0-4] Ngưỡng tồn tối thiểu của variant — cảnh báo khi closingStock <= này */
        Integer minStockQty,
        LocalDate fromDate,
        LocalDate toDate
) {}
