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

            // AUTO-DETECT: bỏ qua TẤT CẢ header rows, tìm row đầu tiên có mã SP hợp lệ
            int startRow = findDataStartRow(sheet);
            log.info("Products import: data từ row index {} (Excel row {})", startRow, startRow + 1);

            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row)) continue;
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
                        errors.add("Dòng " + (rowIdx + 1) + ": Category không được trống");
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

                    // Auto-generate code nếu trống
                    if (code == null || code.isBlank()) {
                        code = productService.generateProductCode(category);
                        log.info("Dòng {}: Auto-generate code '{}' cho '{}'", rowIdx + 1, code, name);
                    } else {
                        code = code.trim().toUpperCase();
                    }

                    if (productRepository.existsByCode(code)) {
                        log.info("Dòng {}: Skip - mã '{}' đã tồn tại", rowIdx + 1, code);
                        skipCount++; continue;
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

                    // GOP: tự chia giá theo số bịch/đơn vị nhập
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
                    log.info("Dòng {}: OK '{}'", rowIdx + 1, code);
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

    /** Tìm row data thực: row đầu tiên có cột A là mã SP hợp lệ (không phải header text) */
    private int findDataStartRow(Sheet sheet) {
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            if (isValidProductCode(getCellString(row, COL_CODE))) return i;
        }
        return 1;
    }

    /** Mã SP hợp lệ: không chứa ký tự đặc biệt của header (*¶\n/) và không phải từ khóa header */
    private boolean isValidProductCode(String val) {
        if (val == null || val.isBlank() || val.length() > 50) return false;
        if (val.contains("*") || val.contains("¶") || val.contains("\n")
                || val.contains("(") || val.contains("/") || val.contains("\\")) return false;
        String lower = val.trim().toLowerCase();
        return !lower.equals("code") && !lower.equals("ma") && !lower.equals("stt")
                && !lower.equals("ten") && !lower.equals("name")
                && !lower.startsWith("nhà dân") && !lower.startsWith("nha dan")
                && !lower.startsWith("import") && !lower.startsWith("api:");
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
