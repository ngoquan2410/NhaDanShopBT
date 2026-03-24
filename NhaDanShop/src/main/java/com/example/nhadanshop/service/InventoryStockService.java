package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryStockReport;
import com.example.nhadanshop.dto.InventoryStockReportRow;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service thống kê tồn kho theo kỳ và xuất Excel.
 *
 * Công thức tồn kho (tất cả theo đơn vị BÁN LẺ):
 *   totalReceived  = tổng nhập trong kỳ (đã x piecesPerImportUnit)
 *   totalSold      = tổng bán trong kỳ
 *   openingStock   = currentStock - totalReceived(from→now) + totalSold(from→now)
 *   closingStock   = openingStock + totalReceived(from→to) - totalSold(from→to)
 *
 * Giá trị tồn cuối kỳ:
 *   closingValue = sum(batch.remainingQty * batch.costPrice) cho các lô còn hàng cuối kỳ
 *   (dùng giá thực tế từng lô thay vì product.costPrice đồng nhất)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryStockService {

    private final ProductRepository productRepository;
    private final InventoryReceiptRepository receiptRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final ProductBatchRepository batchRepository;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /**
     * Tính báo cáo tồn kho tất cả sản phẩm trong kỳ [from, to].
     */
    public InventoryStockReport getStockReport(LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.atTime(LocalTime.MAX);
        LocalDateTime nowDt  = LocalDateTime.now();

        List<Product> products = productRepository.findByActiveTrue();

        // ── Nhập kỳ (đã quy đổi sang bán lẻ, piecesPerImportUnit đã nhân trong query) ──
        Map<Long, Integer> receivedInPeriod = buildQtyMap(
                receiptRepository.sumReceivedQtyByProductBetween(fromDt, toDt));

        // ── Bán trong kỳ ──────────────────────────────────────────────────────────────
        Map<Long, Integer> soldInPeriod = buildQtyMap(
                invoiceRepository.sumSoldQtyByProductBetween(fromDt, toDt));

        // ── Nhập & bán từ from → NOW (để tính ngược opening stock) ───────────────────
        Map<Long, Integer> receivedFromNow = buildQtyMap(
                receiptRepository.sumReceivedQtyByProductBetween(fromDt, nowDt));
        Map<Long, Integer> soldFromNow = buildQtyMap(
                invoiceRepository.sumSoldQtyByProductBetween(fromDt, nowDt));

        // ── Giá trị tồn cuối kỳ theo lô thực tế (batch-aware) ───────────────────────
        // Dùng remainingQty * costPrice từ từng batch còn hàng
        Map<Long, BigDecimal> batchValueByProduct = buildBatchValueMap();

        List<InventoryStockReportRow> rows = new ArrayList<>();
        for (Product p : products) {
            Long pid = p.getId();

            // Tồn hiện tại (real-time)
            int currentStock = p.getStockQty() != null ? p.getStockQty() : 0;

            // Opening = currentStock - (nhập from→now) + (bán from→now)
            int recvFromNow = receivedFromNow.getOrDefault(pid, 0);
            int soldFrNow   = soldFromNow.getOrDefault(pid, 0);
            int openingStock = currentStock - recvFromNow + soldFrNow;

            // Nhập & bán trong kỳ
            int totalReceived = receivedInPeriod.getOrDefault(pid, 0);
            int totalSold     = soldInPeriod.getOrDefault(pid, 0);

            // Closing = opening + nhập kỳ - bán kỳ
            int closingStock = openingStock + totalReceived - totalSold;

            // Giá trị tồn cuối kỳ:
            // Ưu tiên dùng giá trị thực tế từ các lô (batch-aware)
            // Nếu không có lô nào (sản phẩm chưa nhập kho qua batch) → fallback product.costPrice
            BigDecimal closingValue;
            if (batchValueByProduct.containsKey(pid)) {
                closingValue = batchValueByProduct.get(pid);
            } else {
                closingValue = p.getCostPrice()
                        .multiply(BigDecimal.valueOf(Math.max(0, closingStock)));
            }

            String sellUnit = p.getSellUnit() != null ? p.getSellUnit()
                    : (p.getUnit() != null ? p.getUnit() : "bịch");

            rows.add(new InventoryStockReportRow(
                    pid,
                    p.getCode(),
                    p.getName(),
                    p.getCategory() != null ? p.getCategory().getName() : "",
                    sellUnit,
                    Math.max(0, openingStock),
                    totalReceived,
                    totalSold,
                    Math.max(0, closingStock),
                    closingValue,
                    from,
                    to
            ));
        }

        return new InventoryStockReport(from, to, rows);
    }

    /**
     * Build map productId → tổng giá trị tồn (remainingQty * costPrice) từ tất cả lô còn hàng.
     * Phản ánh đúng giá vốn từng lô nhập, không đồng nhất theo product.costPrice.
     */
    private Map<Long, BigDecimal> buildBatchValueMap() {
        Map<Long, BigDecimal> map = new HashMap<>();
        batchRepository.findAll().stream()
                .filter(b -> b.getRemainingQty() > 0)
                .forEach(b -> {
                    Long pid = b.getProduct().getId();
                    BigDecimal value = b.getCostPrice()
                            .multiply(BigDecimal.valueOf(b.getRemainingQty()));
                    map.merge(pid, value, BigDecimal::add);
                });
        return map;
    }

    /**
     * Xuất báo cáo tồn kho ra file Excel (.xlsx).
     */
    public byte[] exportStockReportToExcel(LocalDate from, LocalDate to) throws IOException {
        InventoryStockReport report = getStockReport(from, to);

        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet("Tồn Kho");

            // ── Styles ──────────────────────────────────────────────
            CellStyle titleStyle = createTitleStyle(workbook);
            CellStyle headerStyle = createHeaderStyle(workbook);
            CellStyle numberStyle = createNumberStyle(workbook);
            CellStyle moneyStyle  = createMoneyStyle(workbook);
            CellStyle dataStyle   = createDataStyle(workbook);
            CellStyle alertStyle  = createAlertStyle(workbook);

            // ── Tiêu đề ────────────────────────────────────────────
            int rowIdx = 0;
            Row titleRow = sheet.createRow(rowIdx++);
            titleRow.setHeightInPoints(30);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("BÁO CÁO TỒN KHO");
            titleCell.setCellStyle(titleStyle);
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 9));

            Row subTitleRow = sheet.createRow(rowIdx++);
            Cell subCell = subTitleRow.createCell(0);
            subCell.setCellValue("Kỳ: " + from.format(DATE_FMT) + " → " + to.format(DATE_FMT));
            subCell.setCellStyle(dataStyle);
            sheet.addMergedRegion(new CellRangeAddress(1, 1, 0, 9));

            rowIdx++; // dòng trống

            // ── Header ──────────────────────────────────────────────
            String[] headers = {
                    "STT", "Mã SP", "Tên sản phẩm", "Danh mục", "Đơn vị",
                    "Tồn đầu kỳ", "Nhập trong kỳ", "Xuất trong kỳ",
                    "Tồn cuối kỳ", "Giá trị tồn (VND)"
            };
            Row headerRow = sheet.createRow(rowIdx++);
            headerRow.setHeightInPoints(22);
            for (int c = 0; c < headers.length; c++) {
                Cell cell = headerRow.createCell(c);
                cell.setCellValue(headers[c]);
                cell.setCellStyle(headerStyle);
            }

            // ── Data ────────────────────────────────────────────────
            int stt = 1;
            for (InventoryStockReportRow row : report.rows()) {
                Row dataRow = sheet.createRow(rowIdx++);
                dataRow.setHeightInPoints(18);

                boolean isLow = row.closingStock() <= 5;
                CellStyle numSt  = isLow ? alertStyle : numberStyle;
                CellStyle dataSt = isLow ? alertStyle : dataStyle;

                setCellInt(dataRow, 0, stt++, numSt);
                setCellStr(dataRow, 1, row.productCode(), dataSt);
                setCellStr(dataRow, 2, row.productName(), dataSt);
                setCellStr(dataRow, 3, row.categoryName(), dataSt);
                setCellStr(dataRow, 4, row.sellUnit(), dataSt);
                setCellInt(dataRow, 5, row.openingStock(), numSt);
                setCellInt(dataRow, 6, row.totalReceived(), numSt);
                setCellInt(dataRow, 7, row.totalSold(), numSt);
                setCellInt(dataRow, 8, row.closingStock(), numSt);
                setCellMoney(dataRow, 9, row.closingStockValue(), isLow ? alertStyle : moneyStyle);
            }

            // ── Totals ──────────────────────────────────────────────
            rowIdx++; // dòng trống
            Row totalRow = sheet.createRow(rowIdx);
            totalRow.setHeightInPoints(20);
            CellStyle totalLabelSt = createTotalLabelStyle(workbook);
            CellStyle totalNumSt   = createTotalNumberStyle(workbook);

            setCellStr(totalRow, 0, "TỔNG", totalLabelSt);
            sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 4));

            int sumOpening = report.rows().stream().mapToInt(InventoryStockReportRow::openingStock).sum();
            int sumRecv    = report.rows().stream().mapToInt(InventoryStockReportRow::totalReceived).sum();
            int sumSold    = report.rows().stream().mapToInt(InventoryStockReportRow::totalSold).sum();
            int sumClosing = report.rows().stream().mapToInt(InventoryStockReportRow::closingStock).sum();
            BigDecimal sumValue = report.rows().stream()
                    .map(InventoryStockReportRow::closingStockValue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            setCellInt(totalRow, 5, sumOpening, totalNumSt);
            setCellInt(totalRow, 6, sumRecv,    totalNumSt);
            setCellInt(totalRow, 7, sumSold,    totalNumSt);
            setCellInt(totalRow, 8, sumClosing, totalNumSt);
            setCellMoney(totalRow, 9, sumValue, totalNumSt);

            // ── Ghi chú ─────────────────────────────────────────────
            rowIdx += 2;
            Row noteRow = sheet.createRow(rowIdx);
            Cell noteCell = noteRow.createCell(0);
            noteCell.setCellValue("* Ô màu vàng: sản phẩm tồn cuối kỳ ≤ 5 (cần bổ sung hàng)");
            noteCell.setCellStyle(dataStyle);
            sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 9));

            // ── Cột width ───────────────────────────────────────────
            sheet.setColumnWidth(0, 8 * 256);      // STT
            sheet.setColumnWidth(1, 15 * 256);     // Mã SP
            sheet.setColumnWidth(2, 35 * 256);     // Tên SP
            sheet.setColumnWidth(3, 20 * 256);     // Danh mục
            sheet.setColumnWidth(4, 12 * 256);     // Đơn vị
            sheet.setColumnWidth(5, 14 * 256);     // Tồn đầu
            sheet.setColumnWidth(6, 15 * 256);     // Nhập
            sheet.setColumnWidth(7, 15 * 256);     // Xuất
            sheet.setColumnWidth(8, 14 * 256);     // Tồn cuối
            sheet.setColumnWidth(9, 22 * 256);     // Giá trị

            workbook.write(out);
            return out.toByteArray();
        }
    }

    // ─── Helper: build map từ query result ───────────────────────────────────

    private Map<Long, Integer> buildQtyMap(List<Object[]> rows) {
        Map<Long, Integer> map = new HashMap<>();
        for (Object[] row : rows) {
            Long pid = ((Number) row[0]).longValue();
            int qty  = ((Number) row[1]).intValue();
            map.merge(pid, qty, Integer::sum);
        }
        return map;
    }

    // ─── Helper: set cell value ───────────────────────────────────────────────

    private void setCellStr(Row row, int col, String value, CellStyle style) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value != null ? value : "");
        cell.setCellStyle(style);
    }

    private void setCellInt(Row row, int col, int value, CellStyle style) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private void setCellMoney(Row row, int col, BigDecimal value, CellStyle style) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value != null ? value.doubleValue() : 0.0);
        cell.setCellStyle(style);
    }

    // ─── Style helpers ────────────────────────────────────────────────────────

    private CellStyle createTitleStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 16);
        font.setColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFont(font);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private CellStyle createHeaderStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        return style;
    }

    private CellStyle createNumberStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
        return style;
    }

    private CellStyle createMoneyStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        style.setAlignment(HorizontalAlignment.RIGHT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
        return style;
    }

    private CellStyle createDataStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        return style;
    }

    private CellStyle createAlertStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        style.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
        return style;
    }

    private CellStyle createTotalLabelStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        return style;
    }

    private CellStyle createTotalNumberStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorder(style);
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
        return style;
    }

    private void setBorder(CellStyle style) {
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
    }
}
