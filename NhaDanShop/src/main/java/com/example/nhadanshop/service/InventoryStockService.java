package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryStockReport;
import com.example.nhadanshop.dto.InventoryStockReportRow;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.InventoryMovementRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.StockAdjustmentItemRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
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
 * Công thức tồn kho (tất cả theo đơn vị BÁN LẺ), sau Slice 6 inclusive of production ledger:
 *
 *   Ngày “hôm nay” và kẹp {@code to} dùng {@link java.time.Clock} (bean {@code businessClock}) để đồng bộ với timestamp movement (Slice 6).
 *
 *   ProdNet = Σ qty_delta trên {@code inventory_movements} với source_type thuộc
 *   production_consume / production_output / production_void_restore / production_void_output
 *
 *   openingStock  = currentStock - recv(from→∞) + sold(from→∞) - prodNet(from→∞) - adjustmentNet(from→∞)
 *   totalReceived = tổng nhập kho (receipt) trong kỳ [from, to] — chỉ nhập kho*, không gồm SX
 *   totalSold     = tổng xuất bán (invoice) trong kỳ [from, to]
 *   closingStock  = openingStock + totalReceived - totalSold + prodNet + adjustmentNet trong kỳ [from,to]
 *
 * *) Cột nhập/xuất vẫn là nhập/bán; chênh SX được cộng trừ qua prodNet trong công thức đóng.
 *
 * Giá trị tồn cuối kỳ:
 *   closingValue = closingStock * avgCostPrice(batches hiện tại)
 */

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InventoryStockService {

    private final Clock businessClock;
    private final EntityManager entityManager;
    private final InventoryReceiptRepository receiptRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final ProductBatchRepository batchRepository;
    private final InventoryMovementRepository movementRepository;
    private final ProductVariantRepository variantRepository; // [Sprint 0]
    private final StockAdjustmentItemRepository stockAdjustmentItemRepository;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /**
     * Tính báo cáo tồn kho tất cả VARIANTS trong kỳ [from, to].
     *
     * Rules:
     *   - to ≤ TODAY (không cho phép to > ngày hiện tại)
     *   - to ≥ from
     *   - Default khi load trang: from = đầu tháng, to = TODAY
     *
     * opening/closing reconcile với Slice 6 sản xuất qua ProdNet(xem javadoc class).
     */
    public InventoryStockReport getStockReport(LocalDate from, LocalDate to) {
        return getStockReport(from, to, null, null, null, null);
    }

    /**
     * @param keyword    lọc theo tên SP / variant / mã / tên danh mục (contains)
     * @param categoryId lọc theo id danh mục (ưu tiên hơn categoryName nếu cả hai có)
     * @param categoryName tên danh mục như trên UI; đối chiếu với "Không phân loại" khi trống
     * @param sort       ví dụ {@code product:asc}, {@code closing:desc}
     */
    public InventoryStockReport getStockReport(
            LocalDate from,
            LocalDate to,
            String keyword,
            Long categoryId,
            String categoryName,
            String sort
    ) {
        LocalDate today = LocalDate.now(businessClock);

        if (to.isAfter(today)) {
            log.warn("getStockReport: toDate {} > today {}, clamped to today", to, today);
            to = today;
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException(
                    "Đến ngày (" + to + ") không được nhỏ hơn Từ ngày (" + from + ")");
        }

        List<InventoryStockReportRow> rows = buildRowsInternal(from, to);
        rows = filterInventoryRows(rows, keyword, categoryId, categoryName);
        rows = sortInventoryRows(rows, sort);
        return new InventoryStockReport(from, to, rows);
    }

    private List<InventoryStockReportRow> buildRowsInternal(LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt = to.atTime(LocalTime.MAX);

        // Ensure ledger rows written in the same persistence transaction are visible to aggregate JPQL
        entityManager.flush();

        // [Fix Issue 1] Dùng FETCH JOIN query để load product+category trong 1 lần
        List<ProductVariant> variants = variantRepository.findAllActiveWithProductAndCategory();

        // Nhập trong kỳ [from, to] → cho totalReceived (Nhập kỳ)
        Map<Long, Integer> receivedInPeriod = buildVariantQtyMap(
                receiptRepository.sumReceivedQtyByVariantBetween(fromDt, toDt));
        // Bán trong kỳ [from, to] → cho totalSold (Xuất kỳ)
        Map<Long, Integer> soldInPeriod = buildVariantQtyMap(
                invoiceRepository.sumSoldQtyByVariantBetween(fromDt, toDt));

        // [Fix OpeningStock] Nhập & bán từ fromDt → ∞ (toàn bộ lịch sử sau from)
        // Không phụ thuộc vào LocalDateTime.now() — tránh lỗi khi now == toDate
        Map<Long, Integer> receivedAfterFrom = buildVariantQtyMap(
                receiptRepository.sumReceivedQtyByVariantAfter(fromDt));
        Map<Long, Integer> soldAfterFrom = buildVariantQtyMap(
                invoiceRepository.sumSoldQtyByVariantAfter(fromDt));

        Map<Long, Integer> prodNetAfterFrom = buildSignedIntQtyMap(
                movementRepository.sumProductionQtyDeltaByVariantCreatedOnOrAfter(fromDt));
        Map<Long, Integer> prodNetInPeriod = buildSignedIntQtyMap(
                movementRepository.sumProductionQtyDeltaByVariantBetweenInclusive(fromDt, toDt));
        Map<Long, Integer> adjustedAfterFrom = buildSignedIntQtyMap(
                stockAdjustmentItemRepository.sumConfirmedDiffByVariantConfirmedOnOrAfter(fromDt));
        Map<Long, Integer> adjustedInPeriod = buildSignedIntQtyMap(
                stockAdjustmentItemRepository.sumConfirmedDiffByVariantBetweenInclusive(fromDt, toDt));

        // [Fix closingValue] Dùng avg cost price theo variant từ batch hiện tại
        // closingValue = closingStock * avgCostPrice  ← phụ thuộc closingStock của kỳ
        // (không dùng SUM(remainingQty*costPrice) tĩnh vì không theo kỳ báo cáo)
        Map<Long, BigDecimal> avgCostByVariant = buildAvgCostPriceByVariantMap();
        Map<Long, Integer> valuationQtyByVariant = buildValuationQtyByVariantMap();

        List<InventoryStockReportRow> rows = new ArrayList<>();
        for (ProductVariant v : variants) {
            Long vid = v.getId();
            Product p = v.getProduct();

            int currentStock   = valuationQtyByVariant.getOrDefault(vid, 0);
            // openingStock = currentStock - (tất cả nhập từ from→∞) + (tất cả bán từ from→∞)
            int recvAfter  = receivedAfterFrom.getOrDefault(vid, 0);
            int soldAfter  = soldAfterFrom.getOrDefault(vid, 0);
            int prodAfter  = prodNetAfterFrom.getOrDefault(vid, 0);
            int adjAfter   = adjustedAfterFrom.getOrDefault(vid, 0);
            int openingStock = currentStock - recvAfter + soldAfter - prodAfter - adjAfter;

            int totalReceived = receivedInPeriod.getOrDefault(vid, 0);
            int totalSold     = soldInPeriod.getOrDefault(vid, 0);
            int prodPeriod    = prodNetInPeriod.getOrDefault(vid, 0);
            int totalAdjusted = adjustedInPeriod.getOrDefault(vid, 0);
            int closingStock  = openingStock + totalReceived - totalSold + prodPeriod + totalAdjusted;

            requireNonNegativeStockReportFigures(vid, v.getVariantCode(), openingStock, closingStock);

            // closingValue = closingStock * avgCostPrice (fallback về variant.costPrice nếu chưa có batch)
            BigDecimal avgCost = avgCostByVariant.getOrDefault(vid, v.getCostPrice());
            if (avgCost == null) avgCost = BigDecimal.ZERO;
            BigDecimal closingValue = avgCost.multiply(BigDecimal.valueOf(closingStock));

            String sellUnit = v.getSellUnit() != null ? v.getSellUnit() : "cai";

            String displayCat = p.getCategory() != null ? p.getCategory().getName() : "";
            Long catId = p.getCategory() != null ? p.getCategory().getId() : null;
            rows.add(new InventoryStockReportRow(
                    p.getId(), p.getCode(), p.getName(),
                    displayCat,
                    catId,
                    sellUnit,
                    vid, v.getVariantCode(), v.getVariantName(),
                    openingStock,
                    totalReceived, totalSold,
                    totalAdjusted,
                    closingStock,
                    closingValue,
                    v.getMinStockQty() != null ? v.getMinStockQty() : 5,
                    from, to
            ));
        }
        return rows;
    }

    private static String nrm(String s) {
        return s == null ? "" : s.trim();
    }

    private List<InventoryStockReportRow> filterInventoryRows(
            List<InventoryStockReportRow> rows,
            String keyword,
            Long categoryId,
            String categoryName
    ) {
        String kw = nrm(keyword).toLowerCase();
        String catName = nrm(categoryName);
        List<InventoryStockReportRow> out = new ArrayList<>();
        for (InventoryStockReportRow r : rows) {
            if (categoryId != null && (r.categoryId() == null || !categoryId.equals(r.categoryId()))) {
                continue;
            }
            if (!catName.isEmpty()) {
                String rowCat = r.categoryName() == null || r.categoryName().isEmpty()
                        ? "Không phân loại" : r.categoryName();
                if (!catName.equals(rowCat)) {
                    continue;
                }
            }
            if (!kw.isEmpty()) {
                String blob = String.join(" ",
                        r.productName(), r.variantName(), r.variantCode(),
                        r.categoryName() != null ? r.categoryName() : "").toLowerCase();
                if (!blob.contains(kw)) {
                    continue;
                }
            }
            out.add(r);
        }
        return out;
    }

    private List<InventoryStockReportRow> sortInventoryRows(List<InventoryStockReportRow> rows, String sortSpec) {
        if (sortSpec == null || sortSpec.isBlank()) {
            return rows;
        }
        String[] p = sortSpec.trim().split(":", 2);
        String key = p[0].trim().toLowerCase();
        boolean asc = p.length < 2 || !"desc".equalsIgnoreCase(p[1].trim());
        List<InventoryStockReportRow> copy = new ArrayList<>(rows);
        java.util.Comparator<InventoryStockReportRow> cmp = switch (key) {
            case "code" -> java.util.Comparator.comparing(
                    r -> r.variantCode() != null ? r.variantCode() : "", java.util.Comparator.naturalOrder());
            case "product" -> java.util.Comparator.comparing(
                    r -> (r.productName() + " " + r.variantName()).toLowerCase());
            case "category" -> java.util.Comparator.comparing(
                    r -> r.categoryName() != null ? r.categoryName() : "", java.util.Comparator.naturalOrder());
            case "opening" -> java.util.Comparator.comparingInt(InventoryStockReportRow::openingStock);
            case "received" -> java.util.Comparator.comparingInt(InventoryStockReportRow::totalReceived);
            case "sold" -> java.util.Comparator.comparingInt(InventoryStockReportRow::totalSold);
            case "adjusted" -> java.util.Comparator.comparingInt(InventoryStockReportRow::totalAdjusted);
            case "closing" -> java.util.Comparator.comparingInt(InventoryStockReportRow::closingStock);
            case "value" -> java.util.Comparator.comparing(
                    InventoryStockReportRow::closingStockValue, java.util.Comparator.nullsFirst(BigDecimal::compareTo));
            default -> java.util.Comparator.comparing(
                    r -> (r.productName() + " " + r.variantName()).toLowerCase());
        };
        if (!asc) {
            cmp = cmp.reversed();
        }
        copy.sort(cmp);
        return copy;
    }

    /**
     * CRIT-007: không kẹp âm về 0 — tồn đầu/cuối kỳ âm là dấu hiệu lệch dữ liệu hoặc lịch sử không khớp tồn hiện tại.
     */
    private static void requireNonNegativeStockReportFigures(
            long variantId, String variantCode, int openingStock, int closingStock) {
        if (openingStock < 0 || closingStock < 0) {
            throw new IllegalStateException(String.format(
                    "Báo cáo tồn kho: tồn đầu kỳ hoặc cuối kỳ âm — kiểm tra đồng bộ nhập/bán/tồn hiện tại. "
                            + "variantId=%d variantCode=%s openingStock=%d closingStock=%d",
                    variantId, variantCode != null ? variantCode : "?", openingStock, closingStock));
        }
    }

    /**
     * Build map variantId → giá vốn bình quân (avgCostPrice) từ batch còn hàng.
     * avgCostPrice = SUM(remainingQty * costPrice) / SUM(remainingQty)
     * Dùng để tính: closingValue = closingStock * avgCostPrice
     */
    private Map<Long, BigDecimal> buildAvgCostPriceByVariantMap() {
        Map<Long, BigDecimal> map = new HashMap<>();
        batchRepository.avgCostPriceByVariant(LocalDate.now(businessClock)).forEach(row -> {
            Long vid = ((Number) row[0]).longValue();
            BigDecimal avg = row[1] != null ? new BigDecimal(row[1].toString()) : BigDecimal.ZERO;
            map.put(vid, avg);
        });
        return map;
    }

    private Map<Long, Integer> buildValuationQtyByVariantMap() {
        Map<Long, Integer> map = new HashMap<>();
        batchRepository.sumValuationRemainingQtyByVariant(LocalDate.now(businessClock)).forEach(row -> {
            Long vid = ((Number) row[0]).longValue();
            int qty = row[1] != null ? ((Number) row[1]).intValue() : 0;
            map.put(vid, qty);
        });
        return map;
    }

    /**
     * [Sprint 0] Build map variantId → tổng giá trị tồn theo lô (tĩnh, không theo kỳ).
     * @deprecated Dùng buildAvgCostPriceByVariantMap() + closingStock thay thế.
     */
    @Deprecated
    private Map<Long, BigDecimal> buildBatchValueByVariantMap() {
        Map<Long, BigDecimal> map = new HashMap<>();
        batchRepository.sumBatchValueByVariant().forEach(row -> {
            Long vid   = ((Number) row[0]).longValue();
            BigDecimal val = row[1] != null ? new BigDecimal(row[1].toString()) : BigDecimal.ZERO;
            map.put(vid, val);
        });
        return map;
    }


    /**
     * Xuất báo cáo tồn kho ra file Excel (.xlsx).
     */
    public byte[] exportStockReportToExcel(LocalDate from, LocalDate to) throws IOException {
        return exportStockReportToExcel(from, to, null, null, null, null);
    }

    public byte[] exportStockReportToExcel(
            LocalDate from,
            LocalDate to,
            String keyword,
            Long categoryId,
            String categoryName,
            String sort
    ) throws IOException {
        InventoryStockReport report = getStockReport(from, to, keyword, categoryId, categoryName, sort);

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
            StringBuilder sub = new StringBuilder("Kỳ: " + from.format(DATE_FMT) + " → " + to.format(DATE_FMT));
            if (nrm(categoryName).length() > 0) {
                sub.append(" · Danh mục: ").append(nrm(categoryName));
            }
            if (nrm(keyword).length() > 0) {
                sub.append(" · Lọc: ").append(nrm(keyword));
            }
            subCell.setCellValue(sub.toString());
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

                boolean isLow = row.closingStock() <= (row.minStockQty() != null ? row.minStockQty() : 5);
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

    private Map<Long, Integer> buildVariantQtyMap(List<Object[]> rows) {
        Map<Long, Integer> map = new HashMap<>();
        for (Object[] row : rows) {
            Long vid = ((Number) row[0]).longValue();
            int qty  = ((Number) row[1]).intValue();
            map.merge(vid, qty, Integer::sum);
        }
        return map;
    }

    /** Signed integers (movement qty_delta aggregates). */
    private Map<Long, Integer> buildSignedIntQtyMap(List<Object[]> rows) {
        Map<Long, Integer> map = new HashMap<>();
        for (Object[] row : rows) {
            Long vid = ((Number) row[0]).longValue();
            int qty  = ((Number) row[1]).intValue();
            map.merge(vid, qty, Integer::sum);
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
