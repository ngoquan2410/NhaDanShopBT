package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExcelImportResult;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Service import sản phẩm từ file Excel (.xlsx)
 *
 * Cấu trúc file Excel (bắt đầu từ row 2, row 1 là header):
 * | A: code | B: name | C: categoryName | D: unit | E: costPrice | F: sellPrice |
 * | G: stockQty | H: expiryDays | I: active | J: importUnit | K: sellUnit |
 * | L: piecesPerImportUnit | M: conversionNote |
 *
 * QUY TẮC GIÁ (costPrice / sellPrice):
 *   - importUnit ATOMIC (bich/hop/chai): costPrice & sellPrice = giá 1 đơn vị đó
 *   - importUnit GOP (kg/xau): costPrice & sellPrice trong Excel = giá 1 đơn vị NHẬP (kg/xâu)
 *     → Hệ thống TỰ CHIA: costPrice_lẻ = costPrice / pieces, sellPrice_lẻ = sellPrice / pieces
 *     → Bán lẻ theo bịch với giá đã chia
 *
 * VD: BT Rong bien, importUnit=kg, pieces=10, costPrice=65000 (giá/kg), sellPrice=65000 (giá/kg)
 *   → Lưu DB: costPrice=6500/bịch, sellPrice=6500/bịch (chưa có markup)
 *   → Nếu muốn markup, nhập sellPrice cao hơn trong Excel: sellPrice=90000/kg → 9000/bịch
 *
 * stockQty trong Excel là số lượng theo đơn vị NHẬP.
 * Hệ thống sẽ tự nhân với piecesPerImportUnit để lưu theo đơn vị bán lẻ.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelImportService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductService productService;

    private static final int COL_CODE              = 0;
    private static final int COL_NAME              = 1;
    private static final int COL_CATEGORY          = 2;
    private static final int COL_UNIT              = 3;
    private static final int COL_COST_PRICE        = 4;
    private static final int COL_SELL_PRICE        = 5;
    private static final int COL_STOCK_QTY         = 6;
    private static final int COL_EXPIRY_DAYS       = 7;
    private static final int COL_ACTIVE            = 8;
    private static final int COL_IMPORT_UNIT       = 9;
    private static final int COL_SELL_UNIT         = 10;
    private static final int COL_PIECES_PER_IMPORT = 11;
    private static final int COL_CONVERSION_NOTE   = 12;

    @Transactional
    public ExcelImportResult importProducts(MultipartFile file) throws IOException {
        if (file.isEmpty()) throw new IllegalArgumentException("File Excel không được rỗng");
        if (!isExcelFile(file)) throw new IllegalArgumentException("Chỉ hỗ trợ file .xlsx");

        List<String> errors = new ArrayList<>();
        int successCount = 0, skipCount = 0, errorCount = 0, totalRows = 0;

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);

            // Template sản phẩm CỐ ĐỊNH: dòng 1=Title, 2=Subtitle, 3=Header → data từ dòng 4 (index 3)
            // Nếu file tự tạo (không phải template) → fallback detect
            int startRow = detectStartRow(sheet);
            log.info("Products import: data từ row index {} (Excel row {})", startRow, startRow + 1);

            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row) || isLegendRow(row)) continue;
                totalRows++;
                try {
                    String code = getCellString(row, COL_CODE);
                    String name = getCellString(row, COL_NAME);
                    if (name == null || name.isBlank()) {
                        errors.add("Dòng " + (rowIdx + 1) + ": Tên SP không được trống");
                        errorCount++; continue;
                    }
                    String categoryName = getCellString(row, COL_CATEGORY);
                    if (categoryName == null || categoryName.isBlank()) {
                        errors.add("Dòng " + (rowIdx + 1) + ": Danh mục không được trống");
                        errorCount++; continue;
                    }
                    Category category = categoryRepository.findByNameIgnoreCase(categoryName.trim())
                            .orElseGet(() -> {
                                Category c2 = new Category();
                                c2.setName(categoryName.trim());
                                c2.setActive(true);
                                c2.setCreatedAt(LocalDateTime.now());
                                c2.setUpdatedAt(LocalDateTime.now());
                                return categoryRepository.save(c2);
                            });

                    // ── CHECK TRÙNG: name + categoryId (giống logic API tạo mới) ──
                    if (productRepository.existsByNameIgnoreCaseAndCategoryId(name.trim(), category.getId())) {
                        log.info("Dòng {}: Skip - '{}' đã tồn tại trong danh mục '{}'", rowIdx + 1, name.trim(), categoryName.trim());
                        errors.add("Dòng " + (rowIdx + 1) + ": SP '" + name.trim() + "' đã tồn tại trong danh mục '" + categoryName.trim() + "' → bỏ qua");
                        skipCount++; continue;
                    }

                    // ── GENERATE CODE: luôn auto-generate, bỏ qua code trong Excel ──
                    // (giống logic API tạo mới: code tự sinh theo category)
                    if (code != null && !code.isBlank()) {
                        code = code.trim().toUpperCase();
                        // Nếu code được nhập tay bị trùng → báo lỗi
                        if (productRepository.existsByCode(code)) {
                            errors.add("Dòng " + (rowIdx + 1) + ": Mã '" + code + "' đã tồn tại → bỏ qua");
                            skipCount++; continue;
                        }
                    } else {
                        // Không nhập mã → tự generate theo category (giống API)
                        code = productService.generateProductCode(category);
                        log.info("Dòng {}: Auto-generate code '{}' cho '{}'", rowIdx + 1, code, name);
                    }

                    String unit       = getCellString(row, COL_UNIT);
                    BigDecimal costPrice = getCellDecimal(row, COL_COST_PRICE);
                    BigDecimal sellPrice = getCellDecimal(row, COL_SELL_PRICE);
                    if (costPrice == null || sellPrice == null) {
                        errors.add("Dòng " + (rowIdx + 1) + ": Giá vốn/giá bán không được trống");
                        errorCount++; continue;
                    }
                    Integer stockQty        = getCellInt(row, COL_STOCK_QTY);
                    Integer expiryDays      = getCellInt(row, COL_EXPIRY_DAYS);
                    Boolean active          = getCellBoolean(row, COL_ACTIVE);
                    String importUnit       = getCellString(row, COL_IMPORT_UNIT);
                    String sellUnit         = getCellString(row, COL_SELL_UNIT);
                    Integer piecesPerImport = getCellInt(row, COL_PIECES_PER_IMPORT);
                    String conversionNote   = getCellString(row, COL_CONVERSION_NOTE);

                    boolean isAtomic = UnitConverter.isAtomicUnit(importUnit);
                    int effectivePieces = isAtomic ? 1
                            : (piecesPerImport != null && piecesPerImport > 0 ? piecesPerImport : 1);

                    BigDecimal costPerUnit = isAtomic ? costPrice
                            : costPrice.divide(BigDecimal.valueOf(effectivePieces), 2, java.math.RoundingMode.HALF_UP);
                    BigDecimal sellPerUnit = isAtomic ? sellPrice
                            : sellPrice.divide(BigDecimal.valueOf(effectivePieces), 2, java.math.RoundingMode.HALF_UP);

                    int retailQty = UnitConverter.toRetailQty(importUnit, effectivePieces,
                            stockQty != null ? stockQty : 0);

                    Product product = new Product();
                    product.setCode(code);
                    product.setName(name.trim());
                    product.setCategory(category);
                    product.setUnit(unit != null && !unit.isBlank() ? unit.trim() : "bich");
                    product.setCostPrice(costPerUnit);
                    product.setSellPrice(sellPerUnit);
                    product.setStockQty(retailQty);
                    product.setExpiryDays(expiryDays);
                    product.setImportUnit(importUnit);
                    product.setSellUnit(sellUnit != null ? sellUnit : "bich");
                    product.setPiecesPerImportUnit(effectivePieces);
                    product.setConversionNote(conversionNote);
                    product.setActive(active != null ? active : Boolean.TRUE);
                    product.setCreatedAt(LocalDateTime.now());
                    product.setUpdatedAt(LocalDateTime.now());
                    productRepository.save(product);
                    successCount++;
                    log.info("Dòng {}: OK '{}' - '{}'", rowIdx + 1, code, name);
                } catch (Exception e) {
                    errors.add("Dòng " + (rowIdx + 1) + ": Lỗi - " + e.getMessage());
                    errorCount++;
                    log.warn("Lỗi import dòng {}: {}", rowIdx + 1, e.getMessage());
                }
            }
        }
        return new ExcelImportResult(totalRows, successCount, skipCount, errorCount, errors);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Detect dòng data đầu tiên.
     * Template cố định: Row 0=Title, Row 1=Subtitle, Row 2=Header → data từ Row 3 (index).
     * Nếu dòng 3 (index) có data số hợp lệ (giá/số lượng) → dùng luôn.
     * Fallback: tìm dòng đầu tiên có cột B (tên) không phải header text.
     */
    private int detectStartRow(Sheet sheet) {
        // Thử row index 3 trước (template cố định: 3 dòng header)
        Row row3 = sheet.getRow(3);
        if (row3 != null) {
            String colB = getCellString(row3, COL_NAME);
            String colE = getCellString(row3, COL_COST_PRICE);
            // Nếu cột B không trống và cột E là số → đây là data
            if (colB != null && !colB.isBlank() && colE != null) {
                try { Double.parseDouble(colE.replace(",", "")); return 3; } catch (NumberFormatException ignored) {}
            }
        }
        // Fallback: tìm dòng đầu tiên có cột E hoặc F là số dương (giá)
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String colE = getCellString(row, COL_COST_PRICE);
            if (colE != null && !colE.isBlank()) {
                try {
                    double val = Double.parseDouble(colE.replace(",", ""));
                    if (val > 0) return i;
                } catch (NumberFormatException ignored) {}
            }
        }
        return 3; // default: skip 3 dòng header
    }

    /** @deprecated dùng detectStartRow thay thế */
    private int findDataStartRow(Sheet sheet) { return detectStartRow(sheet); }

    /** Bỏ qua dòng legend / chú thích màu trong template */
    private boolean isLegendRow(Row row) {
        for (int c = COL_CODE; c <= COL_NAME; c++) {
            String val = getCellString(row, c);
            if (val == null) continue;
            String l = val.trim().toLowerCase();
            if (l.startsWith("mau xanh") || l.startsWith("màu xanh")
                    || l.startsWith("mau vang") || l.startsWith("màu vàng")
                    || l.startsWith("legend") || l.startsWith("chu thich")
                    || l.startsWith("chú thích") || l.startsWith("ghi chu mau")
                    || l.startsWith("(*) =") || l.startsWith("luu y")) return true;
        }
        return false;
    }

    private boolean isExcelFile(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name != null && name.toLowerCase().endsWith(".xlsx");
    }

    private boolean isRowEmpty(Row row) {
        for (int c = COL_CODE; c <= COL_ACTIVE; c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String val = getCellString(row, c);
                if (val != null && !val.isBlank()) return false;
            }
        }
        return true;
    }

    private String getCellString(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        return switch (cell.getCellType()) {
            case STRING  -> cell.getStringCellValue().trim();
            case NUMERIC -> { double d = cell.getNumericCellValue();
                yield d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d); }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> { try { yield cell.getStringCellValue(); }
                catch (Exception e) { yield String.valueOf(cell.getNumericCellValue()); } }
            default -> null;
        };
    }

    private BigDecimal getCellDecimal(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        try {
            return switch (cell.getCellType()) {
                case NUMERIC -> BigDecimal.valueOf(cell.getNumericCellValue());
                case STRING  -> new BigDecimal(cell.getStringCellValue().trim());
                default      -> null;
            };
        } catch (NumberFormatException e) { return null; }
    }

    private Integer getCellInt(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        try {
            return switch (cell.getCellType()) {
                case NUMERIC -> (int) cell.getNumericCellValue();
                case STRING  -> { String s = cell.getStringCellValue().trim();
                    yield s.isBlank() ? null : Integer.parseInt(s); }
                default -> null;
            };
        } catch (NumberFormatException e) { return null; }
    }

    private Boolean getCellBoolean(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return Boolean.TRUE;
        return switch (cell.getCellType()) {
            case BOOLEAN -> cell.getBooleanCellValue();
            case STRING  -> { String v = cell.getStringCellValue().trim().toLowerCase();
                yield !v.equals("false") && !v.equals("0") && !v.equals("no"); }
            case NUMERIC -> cell.getNumericCellValue() != 0;
            default      -> Boolean.TRUE;
        };
    }
}
