package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Dịch vụ thống kê doanh thu:
 *  - Theo sản phẩm
 *  - Theo danh mục
 *  - Tổng hợp (daily / weekly / monthly / yearly)
 *  - Xuất Excel theo mẫu Sổ Doanh Thu S1a-HKD
 */
@Service
@RequiredArgsConstructor
public class RevenueService {

    private final SalesInvoiceRepository invoiceRepo;

    private static final DateTimeFormatter DAY_FMT   = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("MM/yyyy");
    private static final String SHOP_NAME = "NHÃ ĐAN SHOP";
    private static final String SHOP_ADDRESS = "235, Ấp 5, Xã Mỏ Cày, Tỉnh Vĩnh Long";

    // ══════════════════════════════════════════════════════════════════════
    // 1. TỔNG DOANH THU (daily / weekly / monthly / yearly)
    // ══════════════════════════════════════════════════════════════════════

    public RevenueTotalDto getTotalRevenue(LocalDate from, LocalDate to, String period) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        List<Object[]> rawDays = invoiceRepo.dailyRevenue(fromDt, toDt);

        // Build map date → amount
        // Native query trả về: r[0] = String/Date (yyyy-MM-dd), r[1] = BigDecimal
        Map<LocalDate, BigDecimal> dayMap = new LinkedHashMap<>();
        for (Object[] r : rawDays) {
            LocalDate d;
            if (r[0] instanceof java.sql.Date sqlDate) {
                d = sqlDate.toLocalDate();
            } else {
                d = LocalDate.parse(r[0].toString().substring(0, 10));
            }
            BigDecimal amt = r[1] != null ? new java.math.BigDecimal(r[1].toString()) : BigDecimal.ZERO;
            dayMap.put(d, amt);
        }

        List<RevenueRowDto> rows = switch (period.toLowerCase()) {
            case "daily"   -> buildDailyRows(from, to, dayMap);
            case "weekly"  -> buildWeeklyRows(from, to, dayMap);
            case "monthly" -> buildMonthlyRows(from, to, dayMap);
            case "yearly"  -> buildYearlyRows(from, to, dayMap);
            default        -> buildDailyRows(from, to, dayMap);
        };

        BigDecimal total = rows.stream()
                .map(RevenueRowDto::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new RevenueTotalDto(period, from.format(DAY_FMT), to.format(DAY_FMT), rows, total);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. DOANH THU THEO SẢN PHẨM
    // ══════════════════════════════════════════════════════════════════════

    public List<RevenueByProductDto> getRevenueByProduct(LocalDate from, LocalDate to, String period) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        List<Object[]> raw = invoiceRepo.revenueByProduct(fromDt, toDt);
        List<RevenueByProductDto> result = new ArrayList<>();

        for (Object[] r : raw) {
            Long productId      = (Long) r[0];
            String code         = (String) r[1];
            String name         = (String) r[2];
            String categoryName = r[3] != null ? (String) r[3] : "Không phân loại";
            String unit         = r[4] != null ? (String) r[4] : "";
            Long totalQty       = r[5] != null ? ((Number) r[5]).longValue() : 0L;
            BigDecimal totalAmt = r[6] != null ? (BigDecimal) r[6] : BigDecimal.ZERO;

            // Rows trống (API product không cần breakdown kỳ — chỉ 1 dòng tổng kỳ)
            List<RevenueRowDto> rows = List.of(
                    new RevenueRowDto(from.format(DAY_FMT) + " → " + to.format(DAY_FMT), totalAmt));

            result.add(new RevenueByProductDto(productId, code, name, categoryName, unit, rows, totalAmt, totalQty));
        }
        // Sort DESC vì JPQL không hỗ trợ ORDER BY aggregate
        result.sort((a, b) -> b.totalAmount().compareTo(a.totalAmount()));
        return result;
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. DOANH THU THEO DANH MỤC
    // ══════════════════════════════════════════════════════════════════════

    public List<RevenueByCategoryDto> getRevenueByCategory(LocalDate from, LocalDate to, String period) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        List<Object[]> raw = invoiceRepo.revenueByCategory(fromDt, toDt);
        List<RevenueByCategoryDto> result = new ArrayList<>();

        for (Object[] r : raw) {
            Long catId     = (Long) r[0];
            String catName = (String) r[1];
            BigDecimal amt = r[2] != null ? (BigDecimal) r[2] : BigDecimal.ZERO;

            List<RevenueRowDto> rows = List.of(
                    new RevenueRowDto(from.format(DAY_FMT) + " → " + to.format(DAY_FMT), amt));

            result.add(new RevenueByCategoryDto(catId, catName, rows, amt));
        }
        // Sort DESC
        result.sort((a, b) -> b.totalAmount().compareTo(a.totalAmount()));
        return result;
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. XUẤT EXCEL — MẪU SỔ DOANH THU S1a-HKD
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Xuất Excel tổng doanh thu theo template S1a-HKD.
     * Cột: Ngày tháng | Diễn giải | Số tiền
     */
    public byte[] exportTotalRevenueExcel(LocalDate from, LocalDate to, String period) throws IOException {
        RevenueTotalDto data = getTotalRevenue(from, to, period);
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("So D-thu S1a");
            buildS1aSheet(wb, sheet, data.rows(), data.totalAmount(), period, from, to);
            return toBytes(wb);
        }
    }

    /**
     * Xuất Excel doanh thu theo sản phẩm.
     */
    public byte[] exportRevenueByProductExcel(LocalDate from, LocalDate to, String period) throws IOException {
        List<RevenueByProductDto> data = getRevenueByProduct(from, to, period);
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("So D-thu S1a");

            // Convert: mỗi sản phẩm → 1 dòng: label = tên SP, amount = tổng
            List<RevenueRowDto> rows = data.stream()
                    .map(p -> new RevenueRowDto(
                            "[" + p.productCode() + "] " + p.productName()
                            + " (" + p.totalQty() + " " + p.unit() + ")",
                            p.totalAmount()))
                    .collect(Collectors.toList());

            BigDecimal total = data.stream().map(RevenueByProductDto::totalAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            buildS1aSheet(wb, sheet, rows, total, period, from, to);
            return toBytes(wb);
        }
    }

    /**
     * Xuất Excel doanh thu theo danh mục.
     */
    public byte[] exportRevenueByCategoryExcel(LocalDate from, LocalDate to, String period) throws IOException {
        List<RevenueByCategoryDto> data = getRevenueByCategory(from, to, period);
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("So D-thu S1a");

            List<RevenueRowDto> rows = data.stream()
                    .map(c -> new RevenueRowDto(c.categoryName(), c.totalAmount()))
                    .collect(Collectors.toList());

            BigDecimal total = data.stream().map(RevenueByCategoryDto::totalAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            buildS1aSheet(wb, sheet, rows, total, period, from, to);
            return toBytes(wb);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PRIVATE — Build sheet theo mẫu S1a-HKD
    // ══════════════════════════════════════════════════════════════════════

    private void buildS1aSheet(XSSFWorkbook wb, Sheet sheet,
                               List<RevenueRowDto> rows, BigDecimal total,
                               String period, LocalDate from, LocalDate to) {

        DataFormat df = wb.createDataFormat();

        // ── Color palette ──────────────────────────────────────────────
        XSSFColor headerBg  = new XSSFColor(new byte[]{(byte)0xC6, (byte)0xEF, (byte)0xCE}, null); // light green
        XSSFColor titleRed  = new XSSFColor(new byte[]{(byte)0xC0, (byte)0x00, (byte)0x00}, null); // dark red
        XSSFColor totalBg   = new XSSFColor(new byte[]{(byte)0xC6, (byte)0xEF, (byte)0xCE}, null);

        // ── Fonts ──────────────────────────────────────────────────────
        Font boldFont = wb.createFont(); boldFont.setBold(true);
        Font boldLg   = wb.createFont(); boldLg.setBold(true); boldLg.setFontHeightInPoints((short)13);
        Font italicFont = wb.createFont(); italicFont.setItalic(true);

        XSSFFont redFont = wb.createFont();
        redFont.setColor(titleRed);
        redFont.setBold(true);

        XSSFFont redSmallFont = wb.createFont();
        redSmallFont.setColor(titleRed);
        redSmallFont.setFontHeightInPoints((short)10);

        // ── Styles ─────────────────────────────────────────────────────
        // Header cell (Ngày tháng / Diễn giải / Số tiền)
        XSSFCellStyle headerStyle = wb.createCellStyle();
        headerStyle.setFillForegroundColor(headerBg);
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setFont(boldFont);
        headerStyle.setAlignment(HorizontalAlignment.CENTER);
        headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(headerStyle, BorderStyle.THIN);
        headerStyle.setWrapText(true);

        // Data cell
        XSSFCellStyle dataStyle = wb.createCellStyle();
        setBorder(dataStyle, BorderStyle.THIN);
        dataStyle.setVerticalAlignment(VerticalAlignment.CENTER);

        // Number cell
        XSSFCellStyle numStyle = wb.createCellStyle();
        numStyle.setDataFormat(df.getFormat("#,##0"));
        setBorder(numStyle, BorderStyle.THIN);
        numStyle.setAlignment(HorizontalAlignment.RIGHT);

        // Total label
        XSSFCellStyle totalLabelStyle = wb.createCellStyle();
        totalLabelStyle.setFillForegroundColor(totalBg);
        totalLabelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        totalLabelStyle.setFont(boldFont);
        totalLabelStyle.setAlignment(HorizontalAlignment.CENTER);
        setBorder(totalLabelStyle, BorderStyle.THIN);

        // Total amount
        XSSFCellStyle totalNumStyle = wb.createCellStyle();
        totalNumStyle.setFillForegroundColor(totalBg);
        totalNumStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        totalNumStyle.setFont(boldFont);
        totalNumStyle.setDataFormat(df.getFormat("#,##0"));
        totalNumStyle.setAlignment(HorizontalAlignment.RIGHT);
        setBorder(totalNumStyle, BorderStyle.THIN);

        // Title center bold
        XSSFCellStyle centerBold = wb.createCellStyle();
        centerBold.setFont(boldLg);
        centerBold.setAlignment(HorizontalAlignment.CENTER);

        // Red center
        XSSFCellStyle redCenter = wb.createCellStyle();
        redCenter.setFont(redFont);
        redCenter.setAlignment(HorizontalAlignment.CENTER);

        // Red small
        XSSFCellStyle redSmall = wb.createCellStyle();
        redSmall.setFont(redSmallFont);
        redSmall.setAlignment(HorizontalAlignment.CENTER);

        // Italic center
        XSSFCellStyle italicCenter = wb.createCellStyle();
        italicCenter.setFont(italicFont);
        italicCenter.setAlignment(HorizontalAlignment.CENTER);

        // Right align normal
        XSSFCellStyle rightStyle = wb.createCellStyle();
        rightStyle.setAlignment(HorizontalAlignment.RIGHT);
        rightStyle.setFont(redSmallFont);

        // ── Column widths (units = 1/256 of char) ─────────────────────
        sheet.setColumnWidth(0, 5000);   // A: Ngày tháng
        sheet.setColumnWidth(1, 18000);  // B: Diễn giải
        sheet.setColumnWidth(2, 6500);   // C: Số tiền
        sheet.setColumnWidth(3, 8000);   // D: Ghi chú (lưu ý)

        int r = 0;

        // ── Row 0: HỌ KINH DOANH + Mẫu số S1a-HKD ─────────────────────
        Row row0 = sheet.createRow(r++);
        row0.setHeightInPoints(16);
        Cell hkd = row0.createCell(0); hkd.setCellValue("HỌ KINH DOANH"); hkd.setCellStyle(wb.createCellStyle());
        ((XSSFCellStyle)hkd.getCellStyle()).getFont().setBold(true);
        XSSFCellStyle boldLeft = wb.createCellStyle(); boldLeft.setFont(boldFont);
        hkd.setCellStyle(boldLeft);
        Cell mau = row0.createCell(2); mau.setCellValue("Mẫu số S1a - HKĐ"); mau.setCellStyle(redCenter);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 2, 3));

        // ── Row 1: Địa chỉ + (Kèm theo...) ────────────────────────────
        Row row1 = sheet.createRow(r++);
        row1.createCell(0).setCellValue("Địa chỉ : " + SHOP_ADDRESS);
        XSSFCellStyle smallRedCenter = wb.createCellStyle(); smallRedCenter.setFont(redSmallFont); smallRedCenter.setAlignment(HorizontalAlignment.CENTER);
        Cell kem = row1.createCell(2); kem.setCellValue("(Kèm theo Thông tư số 152/2025)"); kem.setCellStyle(smallRedCenter);
        sheet.addMergedRegion(new CellRangeAddress(1, 1, 2, 3));

        // ── Row 2: MST ─────────────────────────────────────────────────
        Row row2 = sheet.createRow(r++);
        row2.createCell(0).setCellValue("MST:");
        Cell btc = row2.createCell(2); btc.setCellValue("ngày 31 tháng 12 năm 2025 của Bộ trưởng BTC"); btc.setCellStyle(smallRedCenter);
        sheet.addMergedRegion(new CellRangeAddress(2, 2, 2, 3));

        // ── Row 3: blank ───────────────────────────────────────────────
        sheet.createRow(r++);

        // ── Row 4: Tiêu đề chính ───────────────────────────────────────
        Row row4 = sheet.createRow(r++);
        row4.setHeightInPoints(20);
        Cell title = row4.createCell(0);
        title.setCellValue("SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ");
        title.setCellStyle(centerBold);
        sheet.addMergedRegion(new CellRangeAddress(4, 4, 0, 3));

        // ── Row 5: Địa điểm kinh doanh ─────────────────────────────────
        Row row5 = sheet.createRow(r++);
        Cell diadiem = row5.createCell(0);
        diadiem.setCellValue("Địa điểm kinh doanh : " + SHOP_NAME);
        diadiem.setCellStyle(italicCenter);
        sheet.addMergedRegion(new CellRangeAddress(5, 5, 0, 3));

        // ── Row 6: Kỳ kê khai ──────────────────────────────────────────
        Row row6 = sheet.createRow(r++);
        String kyLabel = buildKyLabel(period, from, to);
        Cell ky = row6.createCell(0);
        ky.setCellValue("Kỳ kê khai : " + kyLabel);
        ky.setCellStyle(redCenter);
        sheet.addMergedRegion(new CellRangeAddress(6, 6, 0, 3));

        // ── Row 7: Đơn vị tính ─────────────────────────────────────────
        Row row7 = sheet.createRow(r++);
        Cell dvt = row7.createCell(2);
        dvt.setCellValue("Đơn vị tính :VNĐ");
        dvt.setCellStyle(rightStyle);
        sheet.addMergedRegion(new CellRangeAddress(7, 7, 2, 3));

        // ── Row 8: Header bảng ─────────────────────────────────────────
        Row hRow = sheet.createRow(r++);
        hRow.setHeightInPoints(28);
        Cell hA = hRow.createCell(0); hA.setCellValue("Ngày tháng"); hA.setCellStyle(headerStyle);
        Cell hB = hRow.createCell(1); hB.setCellValue("Diễn giải");  hB.setCellStyle(headerStyle);
        Cell hC = hRow.createCell(2); hC.setCellValue("Số tiền");    hC.setCellStyle(headerStyle);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 2, 3));

        // ── Row 9: index row A / B / 1 ─────────────────────────────────
        Row idxRow = sheet.createRow(r++);
        idxRow.setHeightInPoints(16);
        XSSFCellStyle idxStyle = wb.createCellStyle();
        idxStyle.setFillForegroundColor(headerBg);
        idxStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        idxStyle.setAlignment(HorizontalAlignment.CENTER);
        setBorder(idxStyle, BorderStyle.THIN);
        Cell iA = idxRow.createCell(0); iA.setCellValue("A"); iA.setCellStyle(idxStyle);
        Cell iB = idxRow.createCell(1); iB.setCellValue("B"); iB.setCellStyle(idxStyle);
        Cell iC = idxRow.createCell(2); iC.setCellValue("1"); iC.setCellStyle(idxStyle);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 2, 3));

        // ── Data rows ──────────────────────────────────────────────────
        for (RevenueRowDto row : rows) {
            Row dr = sheet.createRow(r++);
            dr.setHeightInPoints(18);

            Cell dateCell = dr.createCell(0);
            dateCell.setCellValue(row.label().length() > 12 ? "" : row.label()); // ngày ngắn → cột A
            dateCell.setCellStyle(dataStyle);

            Cell descCell = dr.createCell(1);
            // Nếu label dài (diễn giải sản phẩm/danh mục) → cột B
            descCell.setCellValue(row.label().length() > 12 ? row.label() : "Doanh thu " + row.label());
            descCell.setCellStyle(dataStyle);

            Cell amtCell = dr.createCell(2);
            amtCell.setCellValue(row.amount().doubleValue());
            amtCell.setCellStyle(numStyle);
            sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 2, 3));
        }

        // ── Tổng cộng ──────────────────────────────────────────────────
        Row totRow = sheet.createRow(r++);
        totRow.setHeightInPoints(20);
        Cell tLabel = totRow.createCell(0); tLabel.setCellStyle(totalLabelStyle);
        Cell tDesc  = totRow.createCell(1);
        tDesc.setCellValue("Tổng cộng");
        tDesc.setCellStyle(totalLabelStyle);
        Cell tAmt = totRow.createCell(2);
        tAmt.setCellValue(total.doubleValue());
        tAmt.setCellStyle(totalNumStyle);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 2, 3));

        // ── Blank row ──────────────────────────────────────────────────
        sheet.createRow(r++);
        sheet.createRow(r++);

        // ── Ngày ký ───────────────────────────────────────────────────
        Row signDateRow = sheet.createRow(r++);
        Cell signDate = signDateRow.createCell(1);
        signDate.setCellValue("Ngày .... Tháng ... năm " + to.getYear());
        signDate.setCellStyle(italicCenter);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 1, 3));

        // ── Chức danh ký ──────────────────────────────────────────────
        Row signTitleRow = sheet.createRow(r++);
        Cell signTitle = signTitleRow.createCell(1);
        signTitle.setCellValue("NGƯỜI ĐẠI DIỆN HỌ KINH DOANH/CÁ NHÂN KINH DOANH");
        XSSFCellStyle signBold = wb.createCellStyle(); signBold.setFont(boldFont); signBold.setAlignment(HorizontalAlignment.CENTER);
        signTitle.setCellStyle(signBold);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 1, 3));

        Row signNoteRow = sheet.createRow(r++);
        Cell signNote = signNoteRow.createCell(1);
        signNote.setCellValue("(Ký, ghi rõ họ tên, đóng dấu (nếu có))");
        signNote.setCellStyle(italicCenter);
        sheet.addMergedRegion(new CellRangeAddress(r - 1, r - 1, 1, 3));
    }

    // ══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ══════════════════════════════════════════════════════════════════════

    private List<RevenueRowDto> buildDailyRows(LocalDate from, LocalDate to, Map<LocalDate, BigDecimal> dayMap) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate cur = from;
        while (!cur.isAfter(to)) {
            BigDecimal amt = dayMap.getOrDefault(cur, BigDecimal.ZERO);
            rows.add(new RevenueRowDto(cur.format(DAY_FMT), amt));
            cur = cur.plusDays(1);
        }
        return rows;
    }

    private List<RevenueRowDto> buildWeeklyRows(LocalDate from, LocalDate to, Map<LocalDate, BigDecimal> dayMap) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate weekStart = from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int weekNo = 1;
        while (!weekStart.isAfter(to)) {
            LocalDate weekEnd = weekStart.plusDays(6);
            LocalDate effectiveStart = weekStart.isBefore(from) ? from : weekStart;
            LocalDate effectiveEnd   = weekEnd.isAfter(to)   ? to   : weekEnd;

            BigDecimal weekAmt = BigDecimal.ZERO;
            for (LocalDate d = effectiveStart; !d.isAfter(effectiveEnd); d = d.plusDays(1)) {
                weekAmt = weekAmt.add(dayMap.getOrDefault(d, BigDecimal.ZERO));
            }
            String label = "Tuần " + weekNo + " (" + effectiveStart.format(DAY_FMT)
                         + " - " + effectiveEnd.format(DAY_FMT) + ")";
            rows.add(new RevenueRowDto(label, weekAmt));
            weekStart = weekStart.plusWeeks(1);
            weekNo++;
        }
        return rows;
    }

    private List<RevenueRowDto> buildMonthlyRows(LocalDate from, LocalDate to, Map<LocalDate, BigDecimal> dayMap) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate monthStart = from.withDayOfMonth(1);
        while (!monthStart.isAfter(to)) {
            LocalDate monthEnd = monthStart.with(TemporalAdjusters.lastDayOfMonth());
            LocalDate effectiveStart = monthStart.isBefore(from) ? from : monthStart;
            LocalDate effectiveEnd   = monthEnd.isAfter(to)   ? to   : monthEnd;

            BigDecimal monthAmt = BigDecimal.ZERO;
            for (LocalDate d = effectiveStart; !d.isAfter(effectiveEnd); d = d.plusDays(1)) {
                monthAmt = monthAmt.add(dayMap.getOrDefault(d, BigDecimal.ZERO));
            }
            rows.add(new RevenueRowDto("Tháng " + monthStart.format(MONTH_FMT), monthAmt));
            monthStart = monthStart.plusMonths(1);
        }
        return rows;
    }

    private List<RevenueRowDto> buildYearlyRows(LocalDate from, LocalDate to, Map<LocalDate, BigDecimal> dayMap) {
        List<RevenueRowDto> rows = new ArrayList<>();
        int startYear = from.getYear();
        int endYear   = to.getYear();
        for (int y = startYear; y <= endYear; y++) {
            LocalDate yStart = LocalDate.of(y, 1, 1);
            LocalDate yEnd   = LocalDate.of(y, 12, 31);
            LocalDate es = yStart.isBefore(from) ? from : yStart;
            LocalDate ee = yEnd.isAfter(to)     ? to   : yEnd;

            BigDecimal yearAmt = BigDecimal.ZERO;
            for (LocalDate d = es; !d.isAfter(ee); d = d.plusDays(1)) {
                yearAmt = yearAmt.add(dayMap.getOrDefault(d, BigDecimal.ZERO));
            }
            rows.add(new RevenueRowDto("Năm " + y, yearAmt));
        }
        return rows;
    }

    private String buildKyLabel(String period, LocalDate from, LocalDate to) {
        return switch (period.toLowerCase()) {
            case "daily"   -> "Ngày " + from.format(DAY_FMT) + " - " + to.format(DAY_FMT);
            case "weekly"  -> "Tuần " + from.format(DAY_FMT) + " - " + to.format(DAY_FMT);
            case "monthly" -> "Tháng " + from.format(MONTH_FMT) + " - " + to.format(MONTH_FMT);
            case "yearly"  -> "Năm " + from.getYear() + (from.getYear() != to.getYear() ? " - " + to.getYear() : "");
            default        -> from.format(DAY_FMT) + " - " + to.format(DAY_FMT);
        };
    }

    private void setBorder(XSSFCellStyle style, BorderStyle bs) {
        style.setBorderTop(bs); style.setBorderBottom(bs);
        style.setBorderLeft(bs); style.setBorderRight(bs);
    }

    private byte[] toBytes(XSSFWorkbook wb) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        wb.write(out);
        return out.toByteArray();
    }
}
