package com.example.nhadanshop.dto;

import java.math.BigDecimal;

/**
 * 1 dòng doanh thu: dùng chung cho thống kê ngày/tuần/tháng/năm.
 * label  = "01/01/2026" | "Tuần 1 (01/01 - 07/01)" | "Tháng 01/2026" | "2026"
 * amount = tổng doanh thu kỳ đó
 */
public record RevenueRowDto(String label, BigDecimal amount) {}
