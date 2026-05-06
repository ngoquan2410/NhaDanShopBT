package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.InventoryStockReport;
import com.example.nhadanshop.dto.ProfitReportResponse;
import com.example.nhadanshop.service.InventoryStockService;
import com.example.nhadanshop.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;
    private final InventoryStockService stockService;

    private List<Long> distinct(List<Long> ids) {
        return ids == null ? List.of() : ids.stream().distinct().collect(Collectors.toList());
    }

    // ════════════════════════════════════════════════════════════════
    // PROFIT REPORTS
    // ════════════════════════════════════════════════════════════════

    /**
     * Thống kê lợi nhuận theo khoảng thời gian tùy chỉnh.
     * GET /api/reports/profit?from=2026-01-01&to=2026-03-31
     */
    @GetMapping("/profit")
    public ProfitReportResponse profitByRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<Long> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return reportService.getProfitReport(from, to);
        }
        return reportService.getProfitReportForProducts(from, to, productIds.stream()
                .distinct()
                .collect(Collectors.toList()));
    }

    /**
     * Thống kê lợi nhuận tuần hiện tại (Thứ 2 – Chủ nhật).
     * GET /api/reports/profit/this-week
     */
    @GetMapping("/profit/this-week")
    public ProfitReportResponse profitThisWeek() {
        return reportService.getCurrentWeekReport();
    }

    /**
     * Thống kê lợi nhuận tháng hiện tại.
     * GET /api/reports/profit/this-month
     */
    @GetMapping("/profit/this-month")
    public ProfitReportResponse profitThisMonth() {
        return reportService.getCurrentMonthReport();
    }

    /**
     * Thống kê lợi nhuận theo từng tuần trong khoảng thời gian.
     * GET /api/reports/profit/weekly?from=2026-01-01&to=2026-03-31
     */
    @GetMapping("/profit/weekly")
    public List<ProfitReportResponse> profitWeekly(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<Long> productIds) {
        return reportService.getWeeklyReport(from, to, distinct(productIds));
    }

    @GetMapping("/profit/daily")
    public List<ProfitReportResponse> profitDaily(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<Long> productIds) {
        return reportService.getDailyReport(from, to, distinct(productIds));
    }

    /**
     * Thống kê lợi nhuận theo từng tháng trong khoảng thời gian.
     * GET /api/reports/profit/monthly?from=2026-01-01&to=2026-12-31
     */
    @GetMapping("/profit/monthly")
    public List<ProfitReportResponse> profitMonthly(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<Long> productIds) {
        return reportService.getMonthlyReport(from, to, distinct(productIds));
    }

    /**
     * Xuất báo cáo lợi nhuận theo tháng ra Excel.
     * GET /api/reports/profit/export?from=2026-01-01&to=2026-12-31
     */
    @GetMapping("/profit/export")
    public ResponseEntity<byte[]> exportProfitExcel(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) throws IOException {
        byte[] excelBytes = reportService.exportProfitToExcel(from, to);
        String filename = "LoiNhuan_" + from.format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + "_" + to.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + ".xlsx";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(ContentDisposition.attachment().filename(filename).build());
        headers.setContentLength(excelBytes.length);
        return ResponseEntity.ok().headers(headers).body(excelBytes);
    }

    // ════════════════════════════════════════════════════════════════
    // INVENTORY STOCK REPORTS
    // ════════════════════════════════════════════════════════════════

    /**
     * Thống kê tồn kho tất cả sản phẩm theo kỳ (JSON).
     * GET /api/reports/inventory?from=2026-01-01&to=2026-03-31
     *
     * Công thức:
     *   openingStock  = tồn đầu kỳ
     *   closingStock  = openingStock + totalReceived - totalSold
     */
    @GetMapping("/inventory")
    public InventoryStockReport inventoryReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return stockService.getStockReport(from, to);
    }

    /**
     * Thống kê tồn kho tháng hiện tại (JSON).
     * GET /api/reports/inventory/this-month
     */
    @GetMapping("/inventory/this-month")
    public InventoryStockReport inventoryThisMonth() {
        LocalDate first = LocalDate.now().withDayOfMonth(1);
        LocalDate last  = LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth());
        return stockService.getStockReport(first, last);
    }

    /**
     * Xuất báo cáo tồn kho ra file Excel (.xlsx).
     * GET /api/reports/inventory/export?from=2026-01-01&to=2026-03-31
     * Chỉ ADMIN được phép.
     */
    @GetMapping("/inventory/export")
    public ResponseEntity<byte[]> exportInventoryExcel(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) throws IOException {

        byte[] excelBytes = stockService.exportStockReportToExcel(from, to);

        String filename = "TonKho_" + from.format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + "_" + to.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + ".xlsx";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(
                ContentDisposition.attachment().filename(filename).build());
        headers.setContentLength(excelBytes.length);

        return ResponseEntity.ok()
                .headers(headers)
                .body(excelBytes);
    }
}
