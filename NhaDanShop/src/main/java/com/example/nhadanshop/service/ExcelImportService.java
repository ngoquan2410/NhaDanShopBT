package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExcelImportResult;
import com.example.nhadanshop.dto.ProductExcelPreviewResponse;
import com.example.nhadanshop.dto.ProductExcelPreviewResponse.ProductPreviewRow;
import com.example.nhadanshop.dto.ProductVariantRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductImportUnit;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductImportUnitRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Service import sản phẩm từ file Excel (.xlsx).
 *
 * Luồng 2 bước:
 *  Pass 1 (previewProducts): validate toàn bộ, KHÔNG ghi DB → ProductExcelPreviewResponse
 *  Pass 2 (importProducts):  re-validate + ghi DB, chỉ chạy khi Pass 1 sạch
 *
 * Layout cột Excel (14 cột A-N, header row 3, data từ row 4):
 *   A: Mã SP (optional → auto-gen)   B: Tên SP (*)      C: Danh mục (*)
 *   D: Đơn vị bán lẻ (*)             E: Giá vốn (*)     F: Giá bán (*)
 *   G: Tồn kho ban đầu               H: Hạn dùng (ngày) I: Hoạt động (TRUE/FALSE)
 *   J: ĐV nhập kho                   K: ĐV bán lẻ       L: Số lẻ/ĐV nhập
 *   M: Ghi chú quy đổi               N: Tồn kho tối thiểu (mặc định 5)
 *
 * Validation rules (đồng bộ với ProductService.create() + ProductVariantService.createVariant()):
 *   R1: Tên SP bắt buộc
 *   R2: Danh mục bắt buộc
 *   R3: Đơn vị bắt buộc
 *   R4: Giá vốn bắt buộc > 0
 *   R5: Giá bán bắt buộc > 0
 *   R6: Số lẻ/ĐV >= 1 nếu có nhập
 *   R7: Hạn dùng >= 0 nếu có nhập
 *   R8: Mã SP nhập tay → phải unique trong DB
 *   R9: Trùng tên trong danh mục → SKIP (giống ProductService)
 *   R10: Giá vốn > giá bán → WARNING
 *   R11: Mã SP nhập tay không được trùng variant_code của SP khác (namespace)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelImportService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductService productService;
    private final ProductVariantRepository variantRepository;
    private final ProductImportUnitRepository importUnitRepository;
    @Lazy
    private final ProductVariantService variantService;

    // ── Column indices (0-based) — 13 cột A-M ────────────────────────────────
    // Bỏ cột D (Don vi) cũ → dùng cột J (ĐV bán lẻ) làm chính
    private static final int COL_CODE              = 0;   // A: Mã SP
    private static final int COL_NAME              = 1;   // B: Tên SP (*)
    private static final int COL_CATEGORY          = 2;   // C: Danh mục (*)
    private static final int COL_COST_PRICE        = 3;   // D: Giá vốn (*)
    private static final int COL_SELL_PRICE        = 4;   // E: Giá bán (*)
    private static final int COL_STOCK_QTY         = 5;   // F: Tồn kho ban đầu
    private static final int COL_EXPIRY_DAYS       = 6;   // G: Hạn dùng (ngày)
    private static final int COL_ACTIVE            = 7;   // H: Hoạt động (TRUE/FALSE)
    private static final int COL_IMPORT_UNIT       = 8;   // I: ĐV nhập kho
    private static final int COL_SELL_UNIT         = 9;   // J: ĐV bán lẻ (*)
    private static final int COL_PIECES_PER_IMPORT = 10;  // K: Số lẻ/ĐV nhập
    private static final int COL_CONVERSION_NOTE   = 11;  // L: Ghi chú quy đổi
    private static final int COL_MIN_STOCK         = 12;  // M: Tồn kho tối thiểu

    // ── Internal record ───────────────────────────────────────────────────────
    private record ParsedRow(
            int rowIdx,
            String rawCode, String name, String categoryName,
            BigDecimal costPrice, BigDecimal sellPrice,
            Integer stockQty, Integer expiryDays, Boolean active,
            String importUnit, String sellUnit, Integer pieces,
            String conversionNote,
            Integer minStockQty,
            String errorMessage, String warningMessage,
            boolean willSkip,
            boolean isNewCategory,
            boolean isAutoCode,
            String resolvedCode
    ) {}

    // ═════════════════════════════════════════════════════════════════════════
    // PASS 1 — Preview (validate only, KHÔNG ghi DB)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Preview file Excel import sản phẩm.
     * Validate toàn bộ, KHÔNG ghi DB.
     * Trả về danh sách rows kèm trạng thái để FE hiển thị preview.
     */
    @Transactional(readOnly = true)
    public ProductExcelPreviewResponse previewProducts(MultipartFile file) throws IOException {
        validateFile(file);

        List<ParsedRow> parsed = parseSheet(file);
        List<ProductPreviewRow> rows = new ArrayList<>();
        List<String> warnings        = new ArrayList<>();
        int errorRows = 0, skipRows  = 0;

        Set<String> seenCodes = new LinkedHashSet<>();
        Set<String> seenNames = new LinkedHashSet<>();

        for (ParsedRow pr : parsed) {
            String  errorMsg  = pr.errorMessage();
            String  warningMsg= pr.warningMessage();
            boolean willSkip  = pr.willSkip();
            boolean isValid   = (errorMsg == null);
            String  status;

            if (errorMsg != null) {
                status = "ERROR"; errorRows++;
            } else if (willSkip) {
                status = "SKIP_DUPLICATE"; skipRows++;
            } else {
                String codeKey = pr.resolvedCode() != null ? pr.resolvedCode().toUpperCase() : null;
                String nameKey = (pr.name() + "|" + pr.categoryName()).toLowerCase();
                if (codeKey != null && seenCodes.contains(codeKey)) {
                    errorMsg = "Mã '" + pr.resolvedCode() + "' xuất hiện nhiều lần trong file";
                    status = "ERROR"; errorRows++; isValid = false;
                } else if (seenNames.contains(nameKey)) {
                    errorMsg = "Tên '" + pr.name() + "' trong danh mục '" + pr.categoryName()
                             + "' xuất hiện nhiều lần trong file";
                    status = "ERROR"; errorRows++; isValid = false;
                } else {
                    if (codeKey != null) seenCodes.add(codeKey);
                    seenNames.add(nameKey);
                    status = pr.isNewCategory() ? "NEW_CATEGORY" : "OK";
                }
            }

            if (warningMsg != null) warnings.add("⚠️ Dòng " + pr.rowIdx() + ": " + warningMsg);

            rows.add(new ProductPreviewRow(
                    pr.rowIdx(),
                    pr.rawCode(), pr.name(), pr.categoryName(),
                    pr.costPrice(), pr.sellPrice(),
                    pr.stockQty(), pr.expiryDays(), pr.active(),
                    pr.importUnit(), pr.sellUnit(), pr.pieces(), pr.conversionNote(),
                    isValid, willSkip, pr.isNewCategory(), pr.isAutoCode(),
                    pr.resolvedCode(), status, errorMsg, warningMsg
            ));
        }

        int totalRows = rows.size();
        int validRows = totalRows - errorRows - skipRows;
        boolean canImport = errorRows == 0 && totalRows > 0;

        return new ProductExcelPreviewResponse(
                totalRows, validRows, skipRows, errorRows, canImport, rows, warnings);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PASS 2 — Import (ghi DB, chỉ chạy khi Pass 1 sạch)
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional
    public ExcelImportResult importProducts(MultipartFile file) throws IOException {
        validateFile(file);

        // Re-validate trước khi ghi DB
        ProductExcelPreviewResponse preview = previewProducts(file);
        if (preview.errorRows() > 0) {
            List<String> errs = preview.rows().stream()
                    .filter(r -> r.errorMessage() != null)
                    .map(r -> "Dòng " + r.lineNumber() + ": " + r.errorMessage())
                    .toList();
            return new ExcelImportResult(preview.totalRows(), 0, preview.skipRows(),
                    preview.errorRows(), errs);
        }

        // parseSheet lại để lấy minStockQty (ProductPreviewRow không có field này)
        List<ParsedRow> parsedRows = parseSheet(file);
        Map<Integer, ParsedRow> parsedByLine = new LinkedHashMap<>();
        for (ParsedRow pr : parsedRows) parsedByLine.put(pr.rowIdx(), pr);

        List<String> errors = new ArrayList<>();
        int successCount = 0, skipCount = 0, errorCount = 0;

        for (ProductPreviewRow row : preview.rows()) {
            if ("SKIP_DUPLICATE".equals(row.status())) { skipCount++; continue; }
            if (!row.isValid())                          { errorCount++; continue; }

            // Lấy ParsedRow gốc để đọc minStockQty
            ParsedRow pr = parsedByLine.get(row.lineNumber());
            int minStock = (pr != null && pr.minStockQty() != null && pr.minStockQty() >= 0)
                    ? pr.minStockQty() : 5;

            try {
                // ── 1. Resolve / tạo Category ─────────────────────────────────
                String catName = row.categoryName().trim();
                Category category = categoryRepository.findByNameIgnoreCase(catName)
                        .orElseGet(() -> {
                            Category c = new Category();
                            c.setName(catName); c.setActive(true);
                            c.setCreatedAt(LocalDateTime.now());
                            c.setUpdatedAt(LocalDateTime.now());
                            return categoryRepository.save(c);
                        });

                // Race condition guard — trùng tên
                if (productRepository.existsByNameIgnoreCaseAndCategoryId(
                        row.name().trim(), category.getId())) {
                    log.info("Skip (trùng tên): '{}' / '{}'", row.name(), catName);
                    skipCount++; continue;
                }

                // ── 2. Resolve mã SP ──────────────────────────────────────────
                String code = (row.resolvedCode() != null && !row.resolvedCode().isBlank()
                               && !row.isAutoCode())
                        ? row.resolvedCode().toUpperCase()
                        : productService.generateProductCode(category);

                // Race condition guard — trùng mã
                if (productRepository.existsByCode(code)) {
                    errors.add("Dòng " + row.lineNumber() + ": Mã '" + code + "' bị trùng lúc ghi DB → bỏ qua");
                    skipCount++; continue;
                }

                // ── 3. Tạo Product ────────────────────────────────────────────
                Product product = new Product();
                product.setCode(code);
                product.setName(row.name().trim());
                product.setCategory(category);
                product.setActive(row.active() != null ? row.active() : Boolean.TRUE);
                product.setProductType(Product.ProductType.SINGLE);
                product.setCreatedAt(LocalDateTime.now());
                product.setUpdatedAt(LocalDateTime.now());
                Product saved = productRepository.saveAndFlush(product);

                // ── 4. Tính giá lẻ ────────────────────────────────────────────
                String importUnit    = row.importUnit();
                // J (sellUnit) bắt buộc, đã validate ở Pass 1 → không null
                String sellUnitFinal = (row.sellUnit() != null && !row.sellUnit().isBlank())
                        ? row.sellUnit().trim() : "cai";
                boolean isAtomic     = UnitConverter.isAtomicUnit(importUnit);
                int effectivePieces  = isAtomic ? 1
                        : (row.piecesPerUnit() != null && row.piecesPerUnit() > 0
                           ? row.piecesPerUnit() : 1);

                // null → ZERO (giá sẽ điền sau khi nhập kho)
                BigDecimal safeCostPrice = row.costPrice() != null ? row.costPrice() : BigDecimal.ZERO;
                BigDecimal safeSellPrice = row.sellPrice() != null ? row.sellPrice() : BigDecimal.ZERO;

                BigDecimal costPerUnit = (isAtomic || effectivePieces == 1)
                        ? safeCostPrice
                        : safeCostPrice.divide(BigDecimal.valueOf(effectivePieces), 2,
                                               java.math.RoundingMode.HALF_UP);
                BigDecimal sellPerUnit = (isAtomic || effectivePieces == 1)
                        ? safeSellPrice
                        : safeSellPrice.divide(BigDecimal.valueOf(effectivePieces), 2,
                                               java.math.RoundingMode.HALF_UP);

                int retailQty = UnitConverter.toRetailQty(importUnit, effectivePieces,
                        row.stockQty() != null ? row.stockQty() : 0);

                // ── 5. Tạo Variant qua variantService (Task 1) ────────────────
                // → tự động: namespace validation, clearDefault, đúng chuẩn với createVariant()
                ProductVariantRequest varReq = new ProductVariantRequest(
                        code,                                      // variantCode = product.code (default variant)
                        row.name().trim(),                         // variantName
                        sellUnitFinal,                             // sellUnit
                        (importUnit != null && !importUnit.isBlank()) ? importUnit.trim() : null,
                        effectivePieces,                           // piecesPerUnit
                        sellPerUnit,                               // sellPrice
                        costPerUnit,                               // costPrice
                        retailQty,                                 // stockQty (đã quy đổi)
                        minStock,                                  // minStockQty (Task 3: từ cột N)
                        row.expiryDays(),
                        true,                                      // isDefault
                        null,                                      // imageUrl (Task 4: N/A — SP mới)
                        row.conversionNote()
                );
                variantService.createVariant(saved.getId(), varReq);

                // ── 6. Tạo ProductImportUnit (Task 2 fix) ─────────────────────
                if (importUnit != null && !importUnit.isBlank()) {
                    ProductImportUnit piu = new ProductImportUnit();
                    piu.setProduct(saved);
                    piu.setImportUnit(importUnit.trim());
                    piu.setSellUnit(sellUnitFinal);
                    piu.setPiecesPerUnit(effectivePieces);
                    piu.setIsDefault(true);
                    piu.setNote(row.conversionNote());
                    importUnitRepository.save(piu);
                }

                successCount++;
                log.info("Import SP OK [code={}, variant={}, pieces={}, stockQty={}, minStock={}]",
                        code, code, effectivePieces, retailQty, minStock);

            } catch (Exception e) {
                errors.add("Dòng " + row.lineNumber() + ": Lỗi - " + e.getMessage());
                errorCount++;
                log.warn("Lỗi import SP dòng {}: {}", row.lineNumber(), e.getMessage(), e);
            }
        }

        return new ExcelImportResult(preview.totalRows(), successCount, skipCount, errorCount, errors);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PARSE SHEET
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Đọc toàn bộ sheet và validate từng dòng.
     * Không truy cập DB để ghi — chỉ đọc (cho preview an toàn trong @Transactional(readOnly)).
     */
    @Transactional(readOnly = true)
    private List<ParsedRow> parseSheet(MultipartFile file) throws IOException {
        List<ParsedRow> result = new ArrayList<>();

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            int startRow = detectStartRow(sheet);
            log.info("Product import: data từ row index {} (Excel row {})", startRow, startRow + 1);

            Map<String, Integer> categorySeq = new LinkedHashMap<>();

            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row) || isLegendRow(row)) continue;

                int lineNum = rowIdx + 1;
                String rawCode        = getCellString(row, COL_CODE);
                String name           = getCellString(row, COL_NAME);
                String categoryName   = getCellString(row, COL_CATEGORY);
                BigDecimal costPrice  = getCellDecimal(row, COL_COST_PRICE);
                BigDecimal sellPrice  = getCellDecimal(row, COL_SELL_PRICE);
                Integer stockQty      = getCellInt(row, COL_STOCK_QTY);
                Integer expiryDays    = getCellInt(row, COL_EXPIRY_DAYS);
                Boolean active        = getCellBoolean(row, COL_ACTIVE);
                String importUnit     = getCellString(row, COL_IMPORT_UNIT);
                String sellUnit       = getCellString(row, COL_SELL_UNIT);
                Integer pieces        = getCellInt(row, COL_PIECES_PER_IMPORT);
                String conversionNote = getCellString(row, COL_CONVERSION_NOTE);
                Integer minStockQty   = getCellInt(row, COL_MIN_STOCK);

                // Normalize
                if (rawCode != null)      rawCode      = rawCode.trim().toUpperCase();
                if (name != null)         name         = name.trim();
                if (categoryName != null) categoryName = categoryName.trim();
                if (sellUnit != null)     sellUnit      = sellUnit.trim();
                if (importUnit != null)   importUnit    = importUnit.trim();

                // ── VALIDATION RULES ──────────────────────────────────────────
                String  errorMsg  = null;
                String  warningMsg= null;
                boolean willSkip  = false;

                if (name == null || name.isBlank()) {
                    errorMsg = "Cột B (Tên SP) bắt buộc";
                } else if (categoryName == null || categoryName.isBlank()) {
                    errorMsg = "Cột C (Danh mục) bắt buộc";
                } else if (costPrice != null && costPrice.compareTo(BigDecimal.ZERO) < 0) {
                    errorMsg = "Cột D (Giá vốn) không được âm";
                } else if (sellPrice != null && sellPrice.compareTo(BigDecimal.ZERO) < 0) {
                    errorMsg = "Cột E (Giá bán) không được âm";
                } else if (sellUnit == null || sellUnit.isBlank()) {
                    errorMsg = "Cột J (ĐV bán lẻ) bắt buộc — VD: bịch, hộp, gói, hũ...";
                } else if (pieces != null && pieces < 1) {
                    errorMsg = "Cột K (Số lẻ/ĐV) phải >= 1";
                } else if (expiryDays == null || expiryDays <= 0) {
                    errorMsg = "Cột G (Hạn dùng) bắt buộc và phải > 0. Nếu SP không có HSD, điền 3650 (10 năm).";
                } else if (minStockQty != null && minStockQty < 0) {
                    errorMsg = "Cột M (Tồn tối thiểu) phải >= 0";
                } else {
                    // R8: Mã tay — unique trong DB
                    if (rawCode != null && !rawCode.isBlank()) {
                        if (productRepository.existsByCode(rawCode)) {
                            errorMsg = "Mã '" + rawCode + "' đã tồn tại trong hệ thống";
                        }
                        // R11: namespace — không trùng variant_code của SP khác (Task 1)
                        if (errorMsg == null
                                && variantRepository.findByVariantCodeIgnoreCase(rawCode).isPresent()) {
                            var conflictVar = variantRepository.findByVariantCodeIgnoreCase(rawCode).get();
                            // cho phép nếu là default variant của chính SP này (nhưng SP chưa tồn tại → lỗi)
                            errorMsg = "Mã '" + rawCode + "' đã được dùng làm mã variant của SP '"
                                    + conflictVar.getProduct().getCode() + "'";
                        }
                    }

                    if (errorMsg == null) {
                        // R9: trùng tên trong DM → SKIP
                        Optional<Category> catOpt = categoryRepository.findByNameIgnoreCase(categoryName);
                        if (catOpt.isPresent() &&
                            productRepository.existsByNameIgnoreCaseAndCategoryId(
                                    name, catOpt.get().getId())) {
                            willSkip = true;
                        }
                        // R10a: giá bán = 0 → WARNING (chưa có giá, cần điền sau)
                        if (!willSkip && (sellPrice == null || sellPrice.compareTo(BigDecimal.ZERO) == 0)) {
                            warningMsg = "Giá bán = 0 — SP sẽ hiện 0₫ trên POS, vui lòng cập nhật sau khi nhập kho";
                        }
                        // R10b: giá vốn > giá bán → WARNING (chỉ khi cả 2 đều > 0)
                        if (!willSkip && warningMsg == null
                                && costPrice != null && costPrice.compareTo(BigDecimal.ZERO) > 0
                                && sellPrice != null && sellPrice.compareTo(BigDecimal.ZERO) > 0
                                && costPrice.compareTo(sellPrice) > 0) {
                            warningMsg = "Giá vốn (" + costPrice.toPlainString()
                                    + ") > Giá bán (" + sellPrice.toPlainString() + ") — kiểm tra lại";
                        }
                    }
                }

                // ── Resolve mã SP ───────────────────────────────────────��─────
                boolean isAutoCode = (rawCode == null || rawCode.isBlank());
                boolean isNewCat   = categoryRepository
                        .findByNameIgnoreCase(categoryName != null ? categoryName : "").isEmpty();
                String resolvedCode = null;

                if (errorMsg == null && !willSkip) {
                    if (!isAutoCode) {
                        resolvedCode = rawCode;
                    } else {
                        // Sinh preview code (không ghi DB)
                        String catKey  = categoryName != null ? categoryName.toLowerCase() : "xx";
                        int seq        = categorySeq.getOrDefault(catKey, 0) + 1;
                        categorySeq.put(catKey, seq);
                        String prefix  = (categoryName != null && !categoryName.isBlank())
                                ? categoryName.trim().replaceAll("[^A-Za-z0-9]", "").toUpperCase()
                                        .substring(0, Math.min(3, categoryName.trim()
                                                .replaceAll("[^A-Za-z0-9]", "").length()))
                                : "SP";
                        if (prefix.isBlank()) prefix = "SP";
                        resolvedCode = prefix + "-AUTO-" + String.format("%03d", seq);
                    }
                }

                result.add(new ParsedRow(
                        lineNum, rawCode, name, categoryName,
                        costPrice, sellPrice, stockQty, expiryDays, active,
                        importUnit, sellUnit, pieces, conversionNote,
                        minStockQty,
                        errorMsg, warningMsg, willSkip, isNewCat, isAutoCode, resolvedCode
                ));
            }
        }
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty())
            throw new IllegalArgumentException("File Excel không được rỗng");
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx"))
            throw new IllegalArgumentException("Chỉ hỗ trợ file .xlsx");
    }

    private int detectStartRow(Sheet sheet) {
        Row row3 = sheet.getRow(3);
        if (row3 != null) {
            String colB = getCellString(row3, COL_NAME);
            String colE = getCellString(row3, COL_COST_PRICE);
            if (colB != null && !colB.isBlank() && colE != null) {
                try { Double.parseDouble(colE.replace(",", "")); return 3; }
                catch (NumberFormatException ignored) {}
            }
        }
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String colE = getCellString(row, COL_COST_PRICE);
            if (colE != null && !colE.isBlank()) {
                try { if (Double.parseDouble(colE.replace(",", "")) > 0) return i; }
                catch (NumberFormatException ignored) {}
            }
        }
        return 3;
    }

    private boolean isLegendRow(Row row) {
        for (int c = COL_CODE; c <= COL_NAME; c++) {
            String val = getCellString(row, c);
            if (val == null) continue;
            String l = val.trim().toLowerCase();
            if (l.startsWith("mau xanh") || l.startsWith("màu xanh")
                    || l.startsWith("mau vang") || l.startsWith("màu vàng")
                    || l.startsWith("legend")   || l.startsWith("chu thich")
                    || l.startsWith("chú thích")|| l.startsWith("(*) =")
                    || l.startsWith("luu y")    || l.startsWith("lưu ý")) return true;
        }
        return false;
    }

    private boolean isRowEmpty(Row row) {
        // Kiểm tra từ cột A đến H (COL_ACTIVE = 7) — đủ để xác định row có data không
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
            case FORMULA -> { try { yield cell.getStringCellValue().trim(); }
                catch (Exception e) { yield String.valueOf((long) cell.getNumericCellValue()); } }
            default -> null;
        };
    }

    private BigDecimal getCellDecimal(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        try {
            return switch (cell.getCellType()) {
                case NUMERIC -> BigDecimal.valueOf(cell.getNumericCellValue());
                case STRING  -> new BigDecimal(cell.getStringCellValue().trim().replace(",", ""));
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
                    yield s.isBlank() ? null : (int) Double.parseDouble(s); }
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
