package com.example.nhadanshop.dto;

import java.math.BigDecimal;

/**
 * 1 dòng doanh thu: dùng chung cho thống kê ngày/tuần/tháng/năm.
 * label  = "01/01/2026" | "Tuần 1 (01/01 - 07/01)" | "Tháng 01/2026" | "2026"
 * amount = tổng doanh thu kỳ đó
 * invoiceCount/itemsSold chỉ được set khi báo cáo lọc theo productIds (truth từ dòng invoice item).
 */
public record RevenueRowDto(
        String label,
        BigDecimal amount,
        Long invoiceCount,
        Long itemsSold) {

    public static RevenueRowDto ofAmount(String label, BigDecimal amount) {
        return new RevenueRowDto(label, amount, null, null);
    }

    public static RevenueRowDto withCounts(String label, BigDecimal amount, long invoiceCount, long itemsSold) {
        return new RevenueRowDto(label, amount, invoiceCount, itemsSold);
    }
}
