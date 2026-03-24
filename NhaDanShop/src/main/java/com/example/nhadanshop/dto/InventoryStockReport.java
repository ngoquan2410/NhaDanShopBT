package com.example.nhadanshop.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Báo cáo tồn kho toàn bộ sản phẩm trong 1 kỳ
 */
public record InventoryStockReport(
        LocalDate fromDate,
        LocalDate toDate,
        List<InventoryStockReportRow> rows
) {}
