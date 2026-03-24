package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProfitReportResponse;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final SalesInvoiceRepository invoiceRepo;
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Thống kê lợi nhuận theo khoảng thời gian tùy chỉnh */
    public ProfitReportResponse getProfitReport(LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt = to.atTime(LocalTime.MAX);

        BigDecimal totalRevenue = invoiceRepo.sumTotalAmountBetween(fromDt, toDt);
        BigDecimal totalCost = invoiceRepo.sumCostBetween(fromDt, toDt);
        BigDecimal totalProfit = invoiceRepo.sumProfitBetween(fromDt, toDt);
        long totalInvoices = invoiceRepo.countByInvoiceDateBetween(fromDt, toDt);

        return new ProfitReportResponse(from, to,
                nullSafe(totalRevenue),
                nullSafe(totalCost),
                nullSafe(totalProfit),
                totalInvoices);
    }

    /** Thống kê tuần hiện tại (Thứ 2 – Chủ nhật) */
    public ProfitReportResponse getCurrentWeekReport() {
        LocalDate today = LocalDate.now();
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate sunday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        return getProfitReport(monday, sunday);
    }

    /** Thống kê tháng hiện tại */
    public ProfitReportResponse getCurrentMonthReport() {
        LocalDate today = LocalDate.now();
        LocalDate firstDay = today.with(TemporalAdjusters.firstDayOfMonth());
        LocalDate lastDay = today.with(TemporalAdjusters.lastDayOfMonth());
        return getProfitReport(firstDay, lastDay);
    }

    /** Thống kê từng tuần trong khoảng thời gian */
    public List<ProfitReportResponse> getWeeklyReport(LocalDate from, LocalDate to) {
        List<ProfitReportResponse> result = new ArrayList<>();
        LocalDate weekStart = from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        while (!weekStart.isAfter(to)) {
            LocalDate weekEnd = weekStart.plusDays(6);
            if (weekEnd.isAfter(to)) weekEnd = to;
            result.add(getProfitReport(weekStart, weekEnd));
            weekStart = weekStart.plusWeeks(1);
        }
        return result;
    }

    /** Thống kê từng tháng trong khoảng thời gian */
    public List<ProfitReportResponse> getMonthlyReport(LocalDate from, LocalDate to) {
        List<ProfitReportResponse> result = new ArrayList<>();
        LocalDate monthStart = from.with(TemporalAdjusters.firstDayOfMonth());
        while (!monthStart.isAfter(to)) {
            LocalDate monthEnd = monthStart.with(TemporalAdjusters.lastDayOfMonth());
            if (monthEnd.isAfter(to)) monthEnd = to;
            result.add(getProfitReport(monthStart, monthEnd));
            monthStart = monthStart.plusMonths(1);
        }
        return result;
    }

    /** Xuất báo cáo lợi nhuận theo từng tháng ra Excel (.xlsx). */
    public byte[] exportProfitToExcel(LocalDate from, LocalDate to) throws IOException {
        List<ProfitReportResponse> rows = getMonthlyReport(from, to);
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("Lợi nhuận");
            DataFormat df = wb.createDataFormat();

            // Styles
            CellStyle titleStyle = wb.createCellStyle();
            Font titleFont = wb.createFont(); titleFont.setBold(true); titleFont.setFontHeightInPoints((short) 14);
            titleStyle.setFont(titleFont); titleStyle.setAlignment(HorizontalAlignment.CENTER);

            CellStyle headerStyle = wb.createCellStyle();
            Font hf = wb.createFont(); hf.setBold(true);
            headerStyle.setFont(hf);
            headerStyle.setFillForegroundColor(IndexedColors.GREEN.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);

            CellStyle numStyle = wb.createCellStyle(); numStyle.setDataFormat(df.getFormat("#,##0"));
            Font bf = wb.createFont(); bf.setBold(true);
            CellStyle numBoldStyle = wb.createCellStyle(); numBoldStyle.setFont(bf); numBoldStyle.setDataFormat(df.getFormat("#,##0"));
            CellStyle boldStyle = wb.createCellStyle(); boldStyle.setFont(bf);

            // Title
            Row titleRow = sheet.createRow(0);
            Cell tc = titleRow.createCell(0); tc.setCellValue("BÁO CÁO LỢI NHUẬN - NHÃ ĐAN SHOP"); tc.setCellStyle(titleStyle);
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 7));
            Row subRow = sheet.createRow(1);
            subRow.createCell(0).setCellValue("Từ " + from.format(DATE_FMT) + " đến " + to.format(DATE_FMT));
            sheet.addMergedRegion(new CellRangeAddress(1, 1, 0, 7));

            // Header
            String[] headers = {"Kỳ báo cáo","Từ ngày","Đến ngày","Doanh thu (₫)","Giá vốn (₫)","Lợi nhuận (₫)","Tỉ lệ lãi %","Số HĐ"};
            int[] colWidths = {4500,4000,4000,5500,5500,5500,3500,3000};
            Row hRow = sheet.createRow(3);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i); c.setCellValue(headers[i]); c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, colWidths[i]);
            }

            // Data
            int rowNum = 4;
            BigDecimal sumRev = BigDecimal.ZERO, sumCost = BigDecimal.ZERO, sumProfit = BigDecimal.ZERO;
            long sumInv = 0;
            DateTimeFormatter mfmt = DateTimeFormatter.ofPattern("MM/yyyy");
            for (ProfitReportResponse r : rows) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(r.fromDate().format(mfmt));
                row.createCell(1).setCellValue(r.fromDate().format(DATE_FMT));
                row.createCell(2).setCellValue(r.toDate().format(DATE_FMT));
                Cell rc = row.createCell(3); rc.setCellValue(r.totalRevenue().doubleValue()); rc.setCellStyle(numStyle);
                Cell cc = row.createCell(4); cc.setCellValue(r.totalCost().doubleValue()); cc.setCellStyle(numStyle);
                Cell pc = row.createCell(5); pc.setCellValue(r.totalProfit().doubleValue()); pc.setCellStyle(numStyle);
                row.createCell(6).setCellValue(r.profitMarginPct() != null ? r.profitMarginPct().doubleValue() : 0);
                row.createCell(7).setCellValue(r.totalInvoices() != null ? r.totalInvoices() : 0);
                sumRev = sumRev.add(r.totalRevenue()); sumCost = sumCost.add(r.totalCost()); sumProfit = sumProfit.add(r.totalProfit());
                if (r.totalInvoices() != null) sumInv += r.totalInvoices();
            }

            // Total
            Row totRow = sheet.createRow(rowNum);
            Cell tl = totRow.createCell(0); tl.setCellValue("TỔNG CỘNG"); tl.setCellStyle(boldStyle);
            Cell tr2 = totRow.createCell(3); tr2.setCellValue(sumRev.doubleValue()); tr2.setCellStyle(numBoldStyle);
            Cell tc2 = totRow.createCell(4); tc2.setCellValue(sumCost.doubleValue()); tc2.setCellStyle(numBoldStyle);
            Cell tp  = totRow.createCell(5); tp.setCellValue(sumProfit.doubleValue()); tp.setCellStyle(numBoldStyle);
            totRow.createCell(7).setCellValue(sumInv);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    private BigDecimal nullSafe(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
