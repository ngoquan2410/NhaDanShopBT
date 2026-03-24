package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

public record ProfitReportResponse(
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal totalRevenue,      // Tổng doanh thu = SUM(qty × sellPrice)
        BigDecimal totalCost,         // Tổng giá vốn  = SUM(qty × unitCostSnapshot FEFO)
        BigDecimal totalProfit,       // Lợi nhuận gộp = Revenue - Cost
        Long totalInvoices,
        BigDecimal profitMarginPct    // Tỉ lệ lãi % = profit / revenue × 100
) {
    /** Constructor compact: tự tính profitMarginPct */
    public ProfitReportResponse(LocalDate fromDate, LocalDate toDate,
                                BigDecimal totalRevenue, BigDecimal totalCost,
                                BigDecimal totalProfit, Long totalInvoices) {
        this(fromDate, toDate, totalRevenue, totalCost, totalProfit, totalInvoices,
                totalRevenue != null && totalRevenue.compareTo(BigDecimal.ZERO) > 0
                        ? totalProfit.divide(totalRevenue, 4, RoundingMode.HALF_UP)
                                .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO);
    }
}
