package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
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
 *  - Top/Slow product report (Sprint 2)
 */
@Service
@RequiredArgsConstructor
public class RevenueService {

    private final SalesInvoiceRepository invoiceRepo;
    private final ProductVariantRepository variantRepo; // Sprint 2 — slow products
    private final Clock businessClock;

    private static final DateTimeFormatter DAY_FMT   = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("MM/yyyy");
    private static final String SHOP_NAME = "NHÃ ĐAN SHOP";
    private static final String SHOP_ADDRESS = "235, Ấp 5, Xã Mỏ Cày, Tỉnh Vĩnh Long";

    // ══════════════════════════════════════════════════════════════════════
    // 1. TỔNG DOANH THU (daily / weekly / monthly / yearly)
    // ══════════════════════════════════════════════════════════════════════

    public RevenueTotalDto getTotalRevenue(LocalDate from, LocalDate to, String period) {
        return getTotalRevenue(from, to, period, null);
    }

    /**
     * {@code productIds} non-empty: merchandise net revenue per persisted invoice lines for those products only
     * (COALESCE(lineNetRevenue, qty×unitPrice)); invoiceCount/itemsSold are meaningful per period bucket.
     */
    public RevenueTotalDto getTotalRevenue(LocalDate from, LocalDate to, String period, List<Long> productIds) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        if (productIds != null && !productIds.isEmpty()) {
            List<Long> distinct = productIds.stream().distinct().toList();
            List<Object[]> rawDays = invoiceRepo.dailyMerchandiseStatsByProducts(fromDt, toDt, distinct);

            Map<LocalDate, BigDecimal> dayMerch = new LinkedHashMap<>();
            Map<LocalDate, Long> dayInvoices = new LinkedHashMap<>();
            Map<LocalDate, Long> dayQty = new LinkedHashMap<>();
            fillDailyMerchandiseTripleMaps(rawDays, dayMerch, dayInvoices, dayQty);

            List<RevenueRowDto> rows = switch (period.toLowerCase(Locale.ROOT)) {
                case "daily"   -> buildDailyRowsFiltered(from, to, dayMerch, dayInvoices, dayQty);
                case "weekly"  -> buildWeeklyRowsFiltered(from, to, dayMerch, dayInvoices, dayQty);
                case "monthly" -> buildMonthlyRowsFiltered(from, to, dayMerch, dayInvoices, dayQty);
                case "yearly"  -> buildYearlyRowsFiltered(from, to, dayMerch, dayInvoices, dayQty);
                default        -> buildDailyRowsFiltered(from, to, dayMerch, dayInvoices, dayQty);
            };

            BigDecimal total = rows.stream()
                    .map(RevenueRowDto::amount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new RevenueTotalDto(period, from.format(DAY_FMT), to.format(DAY_FMT), rows, total);
        }

        List<Object[]> rawDays = invoiceRepo.dailyRevenue(fromDt, toDt);
        List<Object[]> rawCounts = invoiceRepo.dailySalesCounts(fromDt, toDt);

        Map<LocalDate, BigDecimal> dayMap = new LinkedHashMap<>();
        for (Object[] r : rawDays) {
            LocalDate d = parseRowLocalDate(r[0]);
            BigDecimal amt = r[1] != null ? new BigDecimal(r[1].toString()) : BigDecimal.ZERO;
            dayMap.put(d, amt);
        }
        Map<LocalDate, Long> dayInvoices = new LinkedHashMap<>();
        Map<LocalDate, Long> dayQty = new LinkedHashMap<>();
        for (Object[] r : rawCounts) {
            LocalDate d = parseRowLocalDate(r[0]);
            long inv = r[1] instanceof Number n ? n.longValue() : 0L;
            long qty = r[2] instanceof Number n ? n.longValue() : 0L;
            dayInvoices.put(d, inv);
            dayQty.put(d, qty);
        }

        List<RevenueRowDto> rows = switch (period.toLowerCase(Locale.ROOT)) {
            case "daily"   -> buildDailyRowsFiltered(from, to, dayMap, dayInvoices, dayQty);
            case "weekly"  -> buildWeeklyRowsFiltered(from, to, dayMap, dayInvoices, dayQty);
            case "monthly" -> buildMonthlyRowsFiltered(from, to, dayMap, dayInvoices, dayQty);
            case "yearly"  -> buildYearlyRowsFiltered(from, to, dayMap, dayInvoices, dayQty);
            default        -> buildDailyRowsFiltered(from, to, dayMap, dayInvoices, dayQty);
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
        return getRevenueByProduct(from, to, period, null);
    }

    public List<RevenueByProductDto> getRevenueByProduct(LocalDate from, LocalDate to, String period, List<Long> productIds) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        List<Object[]> raw = (productIds != null && !productIds.isEmpty())
                ? invoiceRepo.revenueByProductForProductIds(fromDt, toDt, productIds.stream().distinct().toList())
                : invoiceRepo.revenueByProduct(fromDt, toDt);
        List<RevenueByProductDto> result = new ArrayList<>();

        for (Object[] r : raw) {
            Long productId      = (Long) r[0];
            String code         = (String) r[1];
            String name         = (String) r[2];
            String categoryName = r[3] != null ? (String) r[3] : "Không phân loại";
            String unit         = r[4] != null ? (String) r[4] : "";
            Long totalQty       = r[5] != null ? ((Number) r[5]).longValue() : 0L;
            BigDecimal netMerch = r[6] != null ? (BigDecimal) r[6] : BigDecimal.ZERO;
            BigDecimal allocTot = r[7] != null ? (BigDecimal) r[7] : BigDecimal.ZERO;
            BigDecimal merchCost = r[8] != null ? (BigDecimal) r[8] : BigDecimal.ZERO;
            BigDecimal merchProfit = r[9] != null ? (BigDecimal) r[9] : BigDecimal.ZERO;

            List<RevenueRowDto> rows = List.of(
                    RevenueRowDto.ofAmount(from.format(DAY_FMT) + " → " + to.format(DAY_FMT), netMerch));

            result.add(new RevenueByProductDto(
                    productId, code, name, categoryName, unit, rows, netMerch, totalQty,
                    netMerch, allocTot, merchCost, merchProfit));
        }
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
            BigDecimal netMerch = r[2] != null ? (BigDecimal) r[2] : BigDecimal.ZERO;
            BigDecimal merchCost = r[3] != null ? (BigDecimal) r[3] : BigDecimal.ZERO;
            BigDecimal merchProfit = r[4] != null ? (BigDecimal) r[4] : BigDecimal.ZERO;

            List<RevenueRowDto> rows = List.of(
                    RevenueRowDto.ofAmount(from.format(DAY_FMT) + " → " + to.format(DAY_FMT), netMerch));

            result.add(new RevenueByCategoryDto(catId, catName, rows, netMerch, netMerch, merchCost, merchProfit));
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
        RevenueTotalDto data = getTotalRevenue(from, to, period, null);
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
        List<RevenueByProductDto> data = getRevenueByProduct(from, to, period, null);
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("So D-thu S1a");

            // Convert: mỗi sản phẩm → 1 dòng: label = tên SP, amount = tổng
            List<RevenueRowDto> rows = data.stream()
                    .map(p -> RevenueRowDto.ofAmount(
                            "[" + p.productCode() + "] " + p.productName()
                            + " (" + p.totalQty() + " " + p.sellUnit() + ")",
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
                    .map(c -> RevenueRowDto.ofAmount(c.categoryName(), c.totalAmount()))
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
            rows.add(RevenueRowDto.ofAmount(cur.format(DAY_FMT), amt));
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
            rows.add(RevenueRowDto.ofAmount(label, weekAmt));
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
            rows.add(RevenueRowDto.ofAmount("Tháng " + monthStart.format(MONTH_FMT), monthAmt));
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
            rows.add(RevenueRowDto.ofAmount("Năm " + y, yearAmt));
        }
        return rows;
    }

    private void fillDailyMerchandiseTripleMaps(
            List<Object[]> rawDays,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        for (Object[] r : rawDays) {
            LocalDate d = parseRowLocalDate(r[0]);
            BigDecimal merch = r[1] != null ? new BigDecimal(r[1].toString()) : BigDecimal.ZERO;
            long inv = r[2] instanceof Number n ? n.longValue() : 0L;
            long qty = r[3] instanceof Number n ? n.longValue() : 0L;
            dayMerch.put(d, merch);
            dayInvoices.put(d, inv);
            dayQty.put(d, qty);
        }
    }

    private TripleSum sumTripleRange(
            LocalDate effectiveStart,
            LocalDate effectiveEnd,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        BigDecimal merch = BigDecimal.ZERO;
        long invSum = 0L;
        long qtySum = 0L;
        for (LocalDate d = effectiveStart; !d.isAfter(effectiveEnd); d = d.plusDays(1)) {
            merch = merch.add(dayMerch.getOrDefault(d, BigDecimal.ZERO));
            invSum += dayInvoices.getOrDefault(d, 0L);
            qtySum += dayQty.getOrDefault(d, 0L);
        }
        return new TripleSum(merch, invSum, qtySum);
    }

    private List<RevenueRowDto> buildDailyRowsFiltered(
            LocalDate from,
            LocalDate to,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate cur = from;
        while (!cur.isAfter(to)) {
            TripleSum t = sumTripleRange(cur, cur, dayMerch, dayInvoices, dayQty);
            rows.add(RevenueRowDto.withCounts(cur.format(DAY_FMT), t.merch, t.inv, t.qty));
            cur = cur.plusDays(1);
        }
        return rows;
    }

    private List<RevenueRowDto> buildWeeklyRowsFiltered(
            LocalDate from,
            LocalDate to,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate weekStart = from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int weekNo = 1;
        while (!weekStart.isAfter(to)) {
            LocalDate weekEnd = weekStart.plusDays(6);
            LocalDate effectiveStart = weekStart.isBefore(from) ? from : weekStart;
            LocalDate effectiveEnd = weekEnd.isAfter(to) ? to : weekEnd;
            TripleSum t = sumTripleRange(effectiveStart, effectiveEnd, dayMerch, dayInvoices, dayQty);
            String label = "Tuần " + weekNo + " (" + effectiveStart.format(DAY_FMT)
                    + " - " + effectiveEnd.format(DAY_FMT) + ")";
            rows.add(RevenueRowDto.withCounts(label, t.merch, t.inv, t.qty));
            weekStart = weekStart.plusWeeks(1);
            weekNo++;
        }
        return rows;
    }

    private List<RevenueRowDto> buildMonthlyRowsFiltered(
            LocalDate from,
            LocalDate to,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        List<RevenueRowDto> rows = new ArrayList<>();
        LocalDate monthStart = from.withDayOfMonth(1);
        while (!monthStart.isAfter(to)) {
            LocalDate monthEnd = monthStart.with(TemporalAdjusters.lastDayOfMonth());
            LocalDate effectiveStart = monthStart.isBefore(from) ? from : monthStart;
            LocalDate effectiveEnd = monthEnd.isAfter(to) ? to : monthEnd;
            TripleSum t = sumTripleRange(effectiveStart, effectiveEnd, dayMerch, dayInvoices, dayQty);
            rows.add(RevenueRowDto.withCounts("Tháng " + monthStart.format(MONTH_FMT), t.merch, t.inv, t.qty));
            monthStart = monthStart.plusMonths(1);
        }
        return rows;
    }

    private List<RevenueRowDto> buildYearlyRowsFiltered(
            LocalDate from,
            LocalDate to,
            Map<LocalDate, BigDecimal> dayMerch,
            Map<LocalDate, Long> dayInvoices,
            Map<LocalDate, Long> dayQty) {
        List<RevenueRowDto> rows = new ArrayList<>();
        int startYear = from.getYear();
        int endYear = to.getYear();
        for (int y = startYear; y <= endYear; y++) {
            LocalDate yStart = LocalDate.of(y, 1, 1);
            LocalDate yEnd = LocalDate.of(y, 12, 31);
            LocalDate es = yStart.isBefore(from) ? from : yStart;
            LocalDate ee = yEnd.isAfter(to) ? to : yEnd;
            TripleSum t = sumTripleRange(es, ee, dayMerch, dayInvoices, dayQty);
            rows.add(RevenueRowDto.withCounts("Năm " + y, t.merch, t.inv, t.qty));
        }
        return rows;
    }

    private LocalDate parseRowLocalDate(Object cell) {
        if (cell instanceof java.sql.Date sqlDate) {
            return sqlDate.toLocalDate();
        }
        if (cell instanceof LocalDate ld) {
            return ld;
        }
        String s = cell.toString();
        return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
    }

    private record TripleSum(BigDecimal merch, long inv, long qty) {}

    private String buildKyLabel(String period, LocalDate from, LocalDate to) {
        return switch (period.toLowerCase(Locale.ROOT)) {
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

    // ══════════════════════════════════════════════════════════════════════
    // SPRINT 2 — TOP PRODUCTS / SLOW PRODUCTS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Top N variant bán chạy nhất trong kỳ — sắp xếp theo tổng số lượng bán giảm dần.
     *
     * @param from  ngày bắt đầu (inclusive)
     * @param to    ngày kết thúc (inclusive)
     * @param limit số variant muốn lấy (mặc định 10)
     */
    public List<TopProductDto> getTopProducts(LocalDate from, LocalDate to, int limit) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);

        List<Object[]> raw = invoiceRepo.topProducts(fromDt, toDt, PageRequest.of(0, Math.min(limit, 100)));
        List<TopProductDto> result = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            Object[] r = raw.get(i);
            result.add(new TopProductDto(
                    i + 1,
                    toLong(r[0]),   // variantId
                    str(r[1]),      // variantCode
                    str(r[2]),      // variantName
                    toLong(r[3]),   // productId
                    str(r[4]),      // productCode
                    str(r[5]),      // productName
                    r[6] != null ? str(r[6]) : "Không phân loại", // categoryName
                    r[7] != null ? str(r[7]) : "cai",             // sellUnit
                    toLong(r[8]),   // totalQty
                    toBD(r[9]),     // totalRevenue
                    toBD(r[10])     // totalProfit
            ));
        }
        return result;
    }

    /**
     * Danh sách variant không có giao dịch bán trong N ngày gần nhất.
     * Chỉ bao gồm variant đang active và còn tồn kho > 0.
     *
     * @param days số ngày không có giao dịch (VD: 30 = không bán trong 30 ngày)
     */
    public List<SlowProductDto> getSlowProducts(int days) {
        LocalDateTime now = LocalDateTime.now(businessClock);
        LocalDateTime threshold = now.minusDays(Math.max(1, days));

        // Load variants cần xét trong 1 query thay vì findAll + filter in-memory
        List<ProductVariant> allVariants = variantRepo.findAllActiveInStockWithProductAndCategory();

        if (allVariants.isEmpty()) return List.of();

        // Load map variantId → lastSaleDate
        Map<Long, LocalDateTime> lastSaleMap = new HashMap<>();
        invoiceRepo.lastSaleDateByVariant().forEach(r -> {
            Long vid  = toLong(r[0]);
            LocalDateTime dt = r[1] != null ? (LocalDateTime) r[1] : null;
            if (vid != null) lastSaleMap.put(vid, dt);
        });

        List<SlowProductDto> result = new ArrayList<>();
        for (ProductVariant v : allVariants) {
            LocalDateTime lastSale = lastSaleMap.get(v.getId());
            // Slow nếu: chưa bán bao giờ, HOẶC lần bán cuối < threshold
            if (lastSale == null || lastSale.isBefore(threshold)) {
                long daysWithout = lastSale == null ? -1L
                        : Duration.between(lastSale, now).toDays();
                result.add(new SlowProductDto(
                        v.getId(), v.getVariantCode(), v.getVariantName(),
                        v.getProduct().getId(), v.getProduct().getCode(), v.getProduct().getName(),
                        v.getProduct().getCategory() != null ? v.getProduct().getCategory().getName() : "Không phân loại",
                        v.getSellUnit(), v.getStockQty(),
                        lastSale,
                        lastSale == null ? null : daysWithout
                ));
            }
        }

        // Sort: chưa bán bao giờ lên trước, sau đó theo lastSaleDate cũ nhất
        result.sort(Comparator
                .comparing((SlowProductDto d) -> d.lastSaleDate() != null)
                .thenComparing(d -> d.lastSaleDate() == null ? LocalDateTime.MIN : d.lastSaleDate()));

        return result;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Long l) return l;
        if (o instanceof Number n) return n.longValue();
        return null;
    }

    private String str(Object o) {
        return o != null ? o.toString() : null;
    }

    private BigDecimal toBD(Object o) {
        if (o == null) return BigDecimal.ZERO;
        if (o instanceof BigDecimal bd) return bd;
        return new BigDecimal(o.toString());
    }
}
