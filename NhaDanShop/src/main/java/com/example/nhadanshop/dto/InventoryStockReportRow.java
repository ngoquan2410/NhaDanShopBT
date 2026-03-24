package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Một dòng báo cáo tồn kho cho 1 sản phẩm trong kỳ.
 *
 * Công thức:
 *   closingStock = openingStock + totalReceived - totalSold
 *
 *   openingStock  = stockQty hiện tại trước kỳ (tính ngược từ hiện tại)
 *   totalReceived = tổng nhập trong kỳ
 *   totalSold     = tổng xuất (bán) trong kỳ
 *   closingStock  = tồn cuối kỳ
 */
public record InventoryStockReportRow(
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String sellUnit,
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
        LocalDate fromDate,
        LocalDate toDate
) {}
