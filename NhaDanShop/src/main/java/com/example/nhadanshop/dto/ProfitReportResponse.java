package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

public record ProfitReportResponse(
        LocalDate fromDate,
        LocalDate toDate,
        /** Merchandise allocated net revenue Σ line (ex VAT, ex shipping); allocated discounts already in line net. */
        BigDecimal totalRevenue,
        BigDecimal totalCost,
        BigDecimal totalProfit,
        Long totalInvoices,
        BigDecimal profitMarginPct,
        /** VAT amount in period from invoice pricing snapshots (informational; excluded from revenue/profit). */
        BigDecimal totalVatAmount
) {
    public static BigDecimal marginPct(BigDecimal netRevenue, BigDecimal profit) {
        if (netRevenue != null && netRevenue.compareTo(BigDecimal.ZERO) > 0 && profit != null) {
            return profit.divide(netRevenue, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }
}
