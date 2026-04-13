package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExcelPreviewResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service nhập phiếu nhập kho từ file Excel — 2 pass:
 *  Pass 1: validate toàn bộ, KHÔNG ghi DB.
 *  Pass 2: ghi DB chỉ khi Pass 1 hoàn toàn sạch.
 *
 * LAYOUT CỘT EXCEL — 2 chế độ tự động detect:
 *
 * [13 cột A..M — NEW FORMAT — có cột B: variant_code]:
 *   A: product_code  — bắt buộc
 *   B: variant_code  — optional (để trống = dùng default variant)
 *   C: Tên SP
 *   D: Số lượng (*)
 *   E: Giá nhập (*)
 *   F: Giá bán
 *   G: Chiết khấu %
 *   H: Ghi chú
 *   I: Danh mục (SP mới)
 *   J: Đơn vị (SP mới)
 *   K: ĐV nhập kho
 *   L: ĐV bán lẻ
 *   M: Số lẻ/ĐV nhập
 *
 * [12 cột A..L — OLD FORMAT — không có cột B: variant_code]:
 *   A: product_code, B: Tên SP, C: Số lượng, D: Giá nhập,
 *   E: Giá bán, F: Chiết khấu %, G: Ghi chú, H: Danh mục,
 *   I: Đơn vị, J: ĐV nhập kho, K: ĐV bán lẻ, L: Số lẻ
 *
 * LOGIC VARIANT RESOLUTION:
 *   if product_code không tồn tại:
 *     → cần danh mục → create product + create default variant
 *   else product tồn tại:
 *     if variant_code trống (OLD format / new format không điền):
 *       → smart-match: tìm variant khớp (importUnit, sellUnit, pieces) từ Excel
 *       → nếu duy nhất 1 khớp → dùng variant đó
 *       → nếu nhiều khớp → ưu tiên default
 *       → nếu không khớp → fallback default variant
 *       → nếu importUnit DB ≠ Excel và không NULL → FAIL Pass1 với thông báo rõ
 *     if variant_code có (NEW format):
 *       - variant_code tồn tại:
 *         - importUnit DB = NULL  → update từ Excel ✅
 *         - importUnit KHỚP Excel → ✅
 *         - importUnit KHÔNG KHỚP → FAIL Pass1 với thông báo rõ ràng
 *       - variant_code CHƯA tồn tại → create variant mới (is_default=false)
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class ExcelReceiptImportService {


    private final ProductRepository productRepository;
    private final InventoryReceiptRepository receiptRepository;
    private final InventoryReceiptItemRepository receiptItemRepository;
    private final ProductBatchRepository batchRepository;
    private final UserRepository userRepository;
    private final InvoiceNumberGenerator numberGenerator;
    private final CategoryRepository categoryRepository;
    private final ProductService productService;
    private final ProductComboRepository comboItemRepo;
    private final ProductImportUnitRepository importUnitRepo;
    private final ProductVariantService variantService;
    private final ProductVariantRepository variantRepo;
    private final ProductComboService comboService;
    private final SupplierRepository supplierRepository; // Sprint 1 S1-3

    // ── Column indices — NEW FORMAT (13 cột A..M) ────────────────────────────
    private static final int COL_PRODUCT_CODE    = 0;  // A
    private static final int COL_VARIANT_CODE    = 1;  // B (NEW — optional)
    private static final int COL_NAME            = 2;  // C
    private static final int COL_QUANTITY        = 3;  // D
    private static final int COL_COST            = 4;  // E
    private static final int COL_SELL            = 5;  // F
    private static final int COL_DISCOUNT        = 6;  // G
    private static final int COL_NOTE            = 7;  // H
    private static final int COL_CATEGORY        = 8;  // I
    private static final int COL_UNIT            = 9;  // J
    private static final int COL_IMPORT_UNIT     = 10; // K
    private static final int COL_SELL_UNIT       = 11; // L
    private static final int COL_PIECES          = 12; // M
    private static final int COL_EXPIRY_DATE     = 13; // N (Sprint 1 S1-2 — optional, ghi đè HSD)

    // ── Column indices — OLD FORMAT (12 cột A..L, không có cột B variant) ───
    private static final int OLD_COL_NAME        = 1;  // B
    private static final int OLD_COL_QUANTITY    = 2;  // C
    private static final int OLD_COL_COST        = 3;  // D
    private static final int OLD_COL_SELL        = 4;  // E
    private static final int OLD_COL_DISCOUNT    = 5;  // F
    private static final int OLD_COL_NOTE        = 6;  // G
    private static final int OLD_COL_CATEGORY    = 7;  // H
    private static final int OLD_COL_UNIT        = 8;  // I
    private static final int OLD_COL_IMPORT_UNIT = 9;  // J
    private static final int OLD_COL_SELL_UNIT   = 10; // K
    private static final int OLD_COL_PIECES      = 11; // L

    // ── Public API types ──────────────────────────────────────────────────────

    public record ExcelReceiptResult(
            String receiptNo, String supplierName,
            int totalRows, int successItems, int skippedItems, int errorItems,
            int newProducts, BigDecimal totalAmount,
            List<String> errors, List<String> warnings) {}

    public static class ExcelImportValidationException extends RuntimeException {
        private final List<String> validationErrors;
        public ExcelImportValidationException(List<String> errors) {
            super("File Excel có " + errors.size() + " lỗi — không thể import");
            this.validationErrors = errors;
        }
        public List<String> getValidationErrors() { return validationErrors; }
    }

    // ── Internal types ────────────────────────────────────────────────────────

    private enum VariantAction { EXISTING_EXACT, CREATE_NEW, NEW_PRODUCT }

    private record ValidatedRow(
            VariantAction action,
            Product product,
            ProductVariant resolvedVariant,
            boolean isLegacyVariant,
            String excelVariantCode,
            String newProductName,
            String newCategoryName,
            String newUnit,
            String newCode,
            int qty,
            BigDecimal cost,
            BigDecimal sellPrice,
            BigDecimal discountPct,
            boolean isCombo,
            int lineNum,
            String lineNote,
            String importUnit,
            String sellUnit,
            Integer piecesPerImportUnit,
            /** Sprint 1 S1-2: Ngày HSD thực tế ghi đè từ cột N Excel — null → tự tính từ expiryDays */
            java.time.LocalDate expiryDateOverride) {

        /** Constructor backward-compat (không có expiryDateOverride) */
        ValidatedRow(VariantAction action, Product product, ProductVariant resolvedVariant,
                     boolean isLegacyVariant, String excelVariantCode,
                     String newProductName, String newCategoryName, String newUnit, String newCode,
                     int qty, BigDecimal cost, BigDecimal sellPrice, BigDecimal discountPct,
                     boolean isCombo, int lineNum, String lineNote,
                     String importUnit, String sellUnit, Integer piecesPerImportUnit) {
            this(action, product, resolvedVariant, isLegacyVariant, excelVariantCode,
                 newProductName, newCategoryName, newUnit, newCode,
                 qty, cost, sellPrice, discountPct, isCombo, lineNum, lineNote,
                 importUnit, sellUnit, piecesPerImportUnit, null);
        }
    }

    // ── Main method ───────────────────────────────────────────────────────────

    /**
     * Preview file Excel — KHÔNG ghi DB.
     * Chạy Pass 1 (validate + parse), trả về danh sách rows kèm trạng thái lỗi/hợp lệ.
     * FE dùng để hiển thị preview trước khi admin xác nhận tạo phiếu.
     */
    @Transactional(readOnly = true)
    public ExcelPreviewResponse previewExcel(MultipartFile file) throws IOException {
        validateFile(file);
        List<String> errors   = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<ExcelPreviewResponse.PreviewRow> previewRows = new ArrayList<>();
        java.math.BigDecimal totalAmount        = java.math.BigDecimal.ZERO;
        java.math.BigDecimal totalAfterDiscount = java.math.BigDecimal.ZERO;

        try (var workbook = new XSSFWorkbook(file.getInputStream())) {
            // ── Chỉ đọc Sheet 1: SP Don ──────────────────────────────────
            // Sheet Combo tạm thời bị vô hiệu hoá (combo nhập kho qua form thủ công)
            previewSheet(workbook, "SP Don", false, previewRows, errors, warnings);
            // Fallback: nếu không có sheet tên cụ thể → đọc sheet 0 (legacy format)
            if (previewRows.isEmpty()) {
                previewSheet(workbook, null, false, previewRows, errors, warnings);
            }
        }

        for (ExcelPreviewResponse.PreviewRow r : previewRows) {
            if (r.isValid() && r.unitCost() != null && r.quantity() != null) {
                totalAmount        = totalAmount.add(r.lineTotal() != null ? r.lineTotal() : java.math.BigDecimal.ZERO);
                java.math.BigDecimal disc = r.discountPercent() != null ? r.discountPercent() : java.math.BigDecimal.ZERO;
                java.math.BigDecimal afterDisc = r.unitCost()
                        .multiply(java.math.BigDecimal.ONE.subtract(
                                disc.divide(java.math.BigDecimal.valueOf(100), 10, java.math.RoundingMode.HALF_UP)))
                        .multiply(java.math.BigDecimal.valueOf(r.quantity()))
                        .setScale(0, java.math.RoundingMode.HALF_UP);
                totalAfterDiscount = totalAfterDiscount.add(afterDisc);
            }
        }

        int errorRows = (int) previewRows.stream().filter(r -> !r.isValid()).count();
        return new ExcelPreviewResponse(
                previewRows.size(), previewRows.size() - errorRows, errorRows,
                errorRows == 0 && !previewRows.isEmpty(),
                totalAmount, totalAfterDiscount,
                previewRows, warnings
        );
    }

    /**
     * Parse 1 sheet → danh sách PreviewRow.
     * sheetName = null → dùng sheet index 0 (legacy).
     * isComboSheet = true → mỗi dòng là 1 combo (5 cột đơn giản).
     */
    private void previewSheet(XSSFWorkbook workbook, String sheetName, boolean isComboSheet,
                               List<ExcelPreviewResponse.PreviewRow> previewRows,
                               List<String> errors, List<String> warnings) {
        org.apache.poi.ss.usermodel.Sheet sheet = null;
        if (sheetName != null) {
            sheet = workbook.getSheet(sheetName);
            if (sheet == null) {
                // Thử tên không dấu
                for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                    String sn = workbook.getSheetName(i).toLowerCase().replace(" ", "");
                    if (sn.contains("combo") && isComboSheet) { sheet = workbook.getSheetAt(i); break; }
                    if ((sn.contains("spdon") || sn.contains("dondong") || sn.contains("sanpham")) && !isComboSheet) { sheet = workbook.getSheetAt(i); break; }
                }
                if (sheet == null && sheetName != null) return; // sheet không tồn tại → skip
            }
        } else {
            sheet = workbook.getSheetAt(0);
        }

        if (isComboSheet) {
            parseComboSheet(sheet, previewRows, errors, warnings);
        } else {
            parseSingleSheet(sheet, previewRows, errors, warnings);
        }
    }

    /** Parse sheet SP đơn (13 cột A-M, format hiện tại) */
    private void parseSingleSheet(org.apache.poi.ss.usermodel.Sheet sheet,
                                   List<ExcelPreviewResponse.PreviewRow> previewRows,
                                   List<String> errors, List<String> warnings) {
        if (sheet == null) return;
        int startRow = findDataStartRow(sheet);
        boolean isNewFormat = detectNewFormat(sheet, startRow);

        for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
            org.apache.poi.ss.usermodel.Row row = sheet.getRow(rowIdx);
            if (row == null || isRowEmpty(row, isNewFormat) || isLegendRow(row)) continue;
            int lineNum = rowIdx + 1;

            String productCode = getCellString(row, COL_PRODUCT_CODE);
            String variantCode = isNewFormat ? getCellString(row, COL_VARIANT_CODE) : null;
            String name        = isNewFormat ? getCellString(row, COL_NAME) : getCellString(row, OLD_COL_NAME);
            Integer qty        = isNewFormat ? getCellInt(row, COL_QUANTITY) : getCellInt(row, OLD_COL_QUANTITY);
            java.math.BigDecimal cost      = isNewFormat ? getCellDecimal(row, COL_COST)     : getCellDecimal(row, OLD_COL_COST);
            java.math.BigDecimal sellPrice = isNewFormat ? getCellDecimal(row, COL_SELL)     : getCellDecimal(row, OLD_COL_SELL);
            java.math.BigDecimal discPct   = isNewFormat ? getCellDecimal(row, COL_DISCOUNT) : getCellDecimal(row, OLD_COL_DISCOUNT);
            String note        = isNewFormat ? getCellString(row, COL_NOTE)        : getCellString(row, OLD_COL_NOTE);
            String importUnit  = isNewFormat ? getCellString(row, COL_IMPORT_UNIT) : getCellString(row, OLD_COL_IMPORT_UNIT);
            String sellUnit    = isNewFormat ? getCellString(row, COL_SELL_UNIT)   : getCellString(row, OLD_COL_SELL_UNIT);
            Integer pieces     = isNewFormat ? getCellIntOptional(row, COL_PIECES) : getCellIntOptional(row, OLD_COL_PIECES);
            if (discPct == null) discPct = java.math.BigDecimal.ZERO;

            // Validate cơ bản
            String errorMsg = null;
            String warnMsg  = null;
            boolean isCombo = false;
            boolean isNew   = false;
            String status   = "OK";

            if (productCode == null || productCode.isBlank()) {
                errorMsg = "Cột A (Mã SP) bắt buộc";
            } else if (qty == null || qty <= 0) {
                errorMsg = "Số lượng phải > 0";
            } else if (cost == null || cost.compareTo(java.math.BigDecimal.ZERO) <= 0) {
                errorMsg = "Giá nhập phải > 0";
            } else if (discPct.compareTo(java.math.BigDecimal.ZERO) < 0 || discPct.compareTo(java.math.BigDecimal.valueOf(100)) > 0) {
                errorMsg = "Chiết khấu % phải 0–100";
            } else {
                // Kiểm tra product/combo tồn tại
                String upperCode = productCode.trim().toUpperCase();
                var productOpt = productRepository.findByCode(upperCode);
                if (productOpt.isPresent()) {
                    if (productOpt.get().isCombo()) {
                        // Combo tạm thời không hỗ trợ nhập kho qua Excel
                        errorMsg = "'" + upperCode + "' là Combo — nhập kho combo qua Excel hiện chưa hỗ trợ. Dùng form nhập kho thủ công.";
                    } else if (!productOpt.get().getActive()) {
                        errorMsg = "SP '" + upperCode + "' đã ngừng kinh doanh";
                    } else {
                        // ── Validate variant + importUnit (đồng bộ với Pass 1) ──────────
                        String trimmedVariantCode = (variantCode != null && !variantCode.isBlank())
                                ? variantCode.trim() : null;
                        String passImportUnit = (importUnit != null && !importUnit.isBlank())
                                ? importUnit.trim() : null;

                        if (trimmedVariantCode != null) {
                            // Có variant_code → tìm chính xác và kiểm tra importUnit
                            var varOpt = variantRepo.findByVariantCodeIgnoreCase(trimmedVariantCode);
                            if (varOpt.isPresent()) {
                                ProductVariant ev = varOpt.get();
                                // Variant thuộc SP khác
                                if (!ev.getProduct().getId().equals(productOpt.get().getId())) {
                                    errorMsg = "Variant '" + trimmedVariantCode + "' thuộc SP '"
                                            + ev.getProduct().getCode() + "', không phải '" + upperCode + "'";
                                } else {
                                    boolean isLegacy = ev.getImportUnit() == null || ev.getImportUnit().isBlank();
                                    // ImportUnit không khớp DB
                                    if (!isLegacy && passImportUnit != null
                                            && !passImportUnit.equalsIgnoreCase(ev.getImportUnit())) {
                                        errorMsg = "Variant '" + trimmedVariantCode + "' có importUnit='"
                                                + ev.getImportUnit() + "', Excel nhập='" + passImportUnit + "' — không khớp.";
                                    }
                                }
                            }
                            // Variant chưa tồn tại → sẽ tạo mới (không lỗi, đã có warnMsg bên dưới)
                        } else if (passImportUnit != null) {
                            // Không có variant_code → smart-match theo importUnit
                            java.util.List<ProductVariant> allVariants =
                                    variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(productOpt.get().getId());
                            if (!allVariants.isEmpty()) {
                                final String fIU = passImportUnit;
                                // Kiểm tra tất cả variant đều có importUnit
                                boolean allHave = allVariants.stream()
                                        .allMatch(v -> v.getImportUnit() != null && !v.getImportUnit().isBlank());
                                if (allHave) {
                                    // Không có variant nào khớp importUnit → lỗi
                                    boolean anyMatch = allVariants.stream()
                                            .anyMatch(v -> fIU.equalsIgnoreCase(v.getImportUnit()));
                                    if (!anyMatch) {
                                        String avail = allVariants.stream()
                                                .map(v -> v.getVariantCode() + "(" + v.getImportUnit() + ")")
                                                .collect(java.util.stream.Collectors.joining(", "));
                                        errorMsg = "SP '" + upperCode + "' không có variant với importUnit='"
                                                + fIU + "'. Có: [" + avail + "]";
                                    }
                                }
                                // Nếu có legacy variant (importUnit=null) → vẫn cho qua, warning
                                if (errorMsg == null && !allHave) {
                                    boolean anyMatch = allVariants.stream()
                                            .anyMatch(v -> v.getImportUnit() != null
                                                    && fIU.equalsIgnoreCase(v.getImportUnit()));
                                    if (!anyMatch) {
                                        warnMsg = "importUnit='" + fIU + "' không khớp variant nào có sẵn → sẽ dùng variant mặc định";
                                    }
                                }
                            }
                        }
                    }
                } else {
                    if (name == null || name.isBlank()) {
                        errorMsg = "SP '" + upperCode + "' chưa có — cần điền Tên SP (cột C) và Danh mục (cột I) để tạo mới";
                    } else {
                        isNew = true; status = "NEW_PRODUCT";
                        warnMsg = "SP mới '" + (name.trim()) + "' sẽ được tạo";
                    }
                }
            }

            java.math.BigDecimal lineTotal = (cost != null && qty != null)
                ? cost.multiply(java.math.BigDecimal.valueOf(qty))
                : java.math.BigDecimal.ZERO;

            previewRows.add(new ExcelPreviewResponse.PreviewRow(
                lineNum, "SP_DON",
                productCode != null ? productCode.trim().toUpperCase() : "",
                variantCode != null ? variantCode.trim() : "",
                name != null ? name.trim() : "",
                qty, cost, sellPrice, discPct, lineTotal,
                importUnit, sellUnit, pieces, note,
                errorMsg == null, isCombo, isNew, status,
                errorMsg, warnMsg
            ));
        }
    }

    /** Parse sheet Combo (5 cột: Mã combo, Tên, SL, Giá nhập, CK%) */
    private void parseComboSheet(org.apache.poi.ss.usermodel.Sheet sheet,
                                  List<ExcelPreviewResponse.PreviewRow> previewRows,
                                  List<String> errors, List<String> warnings) {
        if (sheet == null) return;
        int startRow = findDataStartRow(sheet);

        for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
            org.apache.poi.ss.usermodel.Row row = sheet.getRow(rowIdx);
            if (row == null) continue;
            String comboCode = getCellString(row, 0);
            if (comboCode == null || comboCode.isBlank()) continue;
            if (isLegendRow(row)) continue;
            int lineNum = rowIdx + 1;

            Integer qty        = getCellInt(row, 2);
            java.math.BigDecimal cost    = getCellDecimal(row, 3);
            java.math.BigDecimal discPct = getCellDecimal(row, 4);
            String note        = getCellString(row, 5);
            if (discPct == null) discPct = java.math.BigDecimal.ZERO;

            String errorMsg = null;
            String warnMsg  = null;
            String status   = "COMBO_EXPAND";
            int componentCount = 0;

            if (qty == null || qty <= 0) {
                errorMsg = "Số lượng combo phải > 0";
            } else if (cost == null || cost.compareTo(java.math.BigDecimal.ZERO) <= 0) {
                errorMsg = "Giá nhập combo phải > 0";
            } else {
                String upperCode = comboCode.trim().toUpperCase();
                var productOpt = productRepository.findByCode(upperCode);
                if (productOpt.isEmpty()) {
                    errorMsg = "Không tìm thấy combo '" + upperCode + "' trong hệ thống";
                } else if (!productOpt.get().isCombo()) {
                    errorMsg = "'" + upperCode + "' không phải combo (productType = SINGLE)";
                } else if (!productOpt.get().getActive()) {
                    errorMsg = "Combo '" + upperCode + "' đã ngừng kinh doanh";
                } else {
                    componentCount = comboItemRepo.findByComboProduct(productOpt.get()).size();
                    if (componentCount == 0) {
                        errorMsg = "Combo '" + upperCode + "' chưa có thành phần nào";
                    } else {
                        warnMsg = "Sẽ expand thành " + componentCount + " SP thành phần";
                    }
                }
            }

            java.math.BigDecimal lineTotal = (cost != null && qty != null)
                ? cost.multiply(java.math.BigDecimal.valueOf(qty))
                : java.math.BigDecimal.ZERO;

            previewRows.add(new ExcelPreviewResponse.PreviewRow(
                lineNum, "COMBO",
                comboCode.trim().toUpperCase(), "", "",
                qty, cost, null, discPct, lineTotal,
                null, null, null, note,
                errorMsg == null, true, false, status,
                errorMsg, warnMsg
            ));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public ExcelReceiptResult importReceiptFromExcel(
            MultipartFile file, String supplierName, Long supplierId, String note,
            BigDecimal shippingFee, BigDecimal vatPercent, LocalDateTime receiptDate) throws IOException {

        validateFile(file);
        if (shippingFee == null || shippingFee.compareTo(BigDecimal.ZERO) < 0) shippingFee = BigDecimal.ZERO;
        if (vatPercent  == null || vatPercent.compareTo(BigDecimal.ZERO)  < 0) vatPercent  = BigDecimal.ZERO;
        if (vatPercent.compareTo(BigDecimal.valueOf(100)) > 0)
            throw new ExcelImportValidationException(List.of("VAT % phải trong khoảng 0–100, hiện là: " + vatPercent));

        List<String> errors   = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // ═══════════════════════════════════════════════════════════════════
        // PASS 1 — Validate toàn bộ, KHÔNG ghi DB
        // ═══��═══════════════════════════════════════════════════════════════
        List<ValidatedRow> validatedRows = new ArrayList<>();
        try (var workbook = new XSSFWorkbook(file.getInputStream())) {

            // ── Resolve sheet SP Don ────────────────────────────────────────
            // Ưu tiên: tìm theo tên "SP Don" / "SP Đơn" trước, fallback sheet 0
            Sheet spSheet = null;
            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                String sn = workbook.getSheetName(i).toLowerCase().trim()
                        .replace("đ", "d").replace("ơ", "o").replace(" ", "");
                if (sn.contains("spdon") || sn.contains("sanpham") || sn.contains("singleproduct")) {
                    spSheet = workbook.getSheetAt(i); break;
                }
            }
            if (spSheet == null) spSheet = workbook.getSheetAt(0); // fallback sheet 0 (legacy)


            // Track product_code đã plan tạo mới trong Pass 1
            Map<String, ValidatedRow> pendingNewProductRows = new LinkedHashMap<>();
            Set<String> pendingNewVariantCodes = new LinkedHashSet<>();

            // ── Parse sheet SP Don ──────────────────────────────────────────
            int dataRowCount = 0;
            {
                Sheet sheet = spSheet;
                int startRow = findDataStartRow(sheet);
                boolean isNewFormat = detectNewFormat(sheet, startRow);
                log.info("Receipt Excel [SP Don]: sheet='{}', data từ row index {}, format={}",
                        sheet.getSheetName(), startRow, isNewFormat ? "NEW-13col" : "OLD-12col");

                for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                    Row row = sheet.getRow(rowIdx);
                    if (row == null || isRowEmpty(row, isNewFormat) || isLegendRow(row)) continue;
                    dataRowCount++;
                    int lineNum = rowIdx + 1;

                    // Đọc cột theo format
                    String productCode;
                    String variantCode;
                    String name;
                    Integer qty;
                    BigDecimal cost;
                    BigDecimal sellPrice;
                    BigDecimal discountPct;
                    String lineNote;
                    String excelImportUnit;
                    String excelSellUnit;
                    Integer excelPieces;
                    LocalDate expiryDateOverride = null; // Sprint 1 S1-2: cột N

                    if (isNewFormat) {
                        productCode     = getCellString(row, COL_PRODUCT_CODE);
                        variantCode     = getCellString(row, COL_VARIANT_CODE);
                        name            = getCellString(row, COL_NAME);
                        qty             = getCellInt(row, COL_QUANTITY);
                        cost            = getCellDecimal(row, COL_COST);
                        sellPrice       = getCellDecimal(row, COL_SELL);
                        discountPct     = getCellDecimal(row, COL_DISCOUNT);
                        lineNote        = getCellString(row, COL_NOTE);
                        excelImportUnit = getCellString(row, COL_IMPORT_UNIT);
                        excelSellUnit   = getCellString(row, COL_SELL_UNIT);
                        excelPieces     = getCellIntOptional(row, COL_PIECES);
                        expiryDateOverride = getCellLocalDate(row, COL_EXPIRY_DATE); // Sprint 1 S1-2: cột N
                    } else {
                        productCode     = getCellString(row, COL_PRODUCT_CODE);
                        variantCode     = null;
                        name            = getCellString(row, OLD_COL_NAME);
                        qty             = getCellInt(row, OLD_COL_QUANTITY);
                        cost            = getCellDecimal(row, OLD_COL_COST);
                        sellPrice       = getCellDecimal(row, OLD_COL_SELL);
                        discountPct     = getCellDecimal(row, OLD_COL_DISCOUNT);
                        lineNote        = getCellString(row, OLD_COL_NOTE);
                        excelImportUnit = getCellString(row, OLD_COL_IMPORT_UNIT);
                        excelSellUnit   = getCellString(row, OLD_COL_SELL_UNIT);
                        excelPieces     = getCellIntOptional(row, OLD_COL_PIECES);
                    }

                    if (discountPct == null) discountPct = BigDecimal.ZERO;
                    if (productCode != null) productCode = productCode.trim();
                    if (variantCode != null) variantCode = variantCode.trim();
                    boolean hasVariantCode = variantCode != null && !variantCode.isBlank();
                    boolean hasProductCode = productCode != null && !productCode.isBlank();

                    if (!hasProductCode) {
                        errors.add("❌ Dòng " + lineNum + " [SP Don]: Cột A (Mã SP) bắt buộc."); continue;
                    }
                    if (qty == null || qty <= 0) {
                        errors.add("❌ Dòng " + lineNum + " [SP Don]: Số lượng phải > 0"); continue;
                    }
                    if (cost == null || cost.compareTo(BigDecimal.ZERO) <= 0) {
                        errors.add("❌ Dòng " + lineNum + " [SP Don]: Giá nhập phải > 0"); continue;
                    }
                    if (discountPct.compareTo(BigDecimal.ZERO) < 0 || discountPct.compareTo(BigDecimal.valueOf(100)) > 0) {
                        errors.add("❌ Dòng " + lineNum + " [SP Don]: Chiết khấu % phải 0–100"); continue;
                    }

                    String passImportUnit = (excelImportUnit != null && !excelImportUnit.isBlank()) ? excelImportUnit.trim() : null;
                    String passSellUnit   = (excelSellUnit   != null && !excelSellUnit.isBlank())   ? excelSellUnit.trim()   : null;
                    Integer passPieces    = (excelPieces != null && excelPieces > 0) ? excelPieces : null;

                    final String upperCode = productCode.toUpperCase();

                    Optional<Product> productOpt = productRepository.findByCode(upperCode);
                    boolean isPendingNew = !productOpt.isPresent() && pendingNewProductRows.containsKey(upperCode);

                    if (productOpt.isEmpty() && !isPendingNew) {
                        if (name == null || name.isBlank()) {
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Mã SP '" + productCode + "' chưa tồn tại — cần điền Tên SP để tạo mới."); continue;
                        }
                        String categoryName = isNewFormat ? getCellString(row, COL_CATEGORY) : getCellString(row, OLD_COL_CATEGORY);
                        if (categoryName == null || categoryName.isBlank()) {
                            final String spNameLower = name.trim().toLowerCase();
                            categoryName = categoryRepository.findAll().stream()
                                    .filter(cat -> cat.getActive() != null && cat.getActive())
                                    .filter(cat -> spNameLower.contains(cat.getName().trim().toLowerCase()))
                                    .map(Category::getName).findFirst().orElse(null);
                            if (categoryName == null) {
                                errors.add("❌ Dòng " + lineNum + " [SP Don]: SP '" + name.trim() + "' chưa tồn tại — cần điền Danh mục để tạo SP mới."); continue;
                            }
                            warnings.add("ℹ️ Dòng " + lineNum + ": Danh mục tự động: '" + categoryName + "'");
                        }
                        String unitCol = isNewFormat ? getCellString(row, COL_UNIT) : getCellString(row, OLD_COL_UNIT);
                        String unit = (unitCol != null && !unitCol.isBlank()) ? unitCol : "cái";
                        String newVariantCode = hasVariantCode ? variantCode : upperCode;
                        if (pendingNewVariantCodes.contains(newVariantCode)) {
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '" + newVariantCode + "' đã xuất hiện ở dòng trước."); continue;
                        }
                        ValidatedRow vRow = new ValidatedRow(
                                VariantAction.NEW_PRODUCT, null, null, false, newVariantCode,
                                name.trim(), categoryName.trim(), unit.trim(), upperCode,
                                qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                passImportUnit, passSellUnit, passPieces, expiryDateOverride);
                        validatedRows.add(vRow);
                        pendingNewProductRows.put(upperCode, vRow);
                        pendingNewVariantCodes.add(newVariantCode);
                        continue;
                    }

                    if (isPendingNew) {
                        String newVCodeForPending = hasVariantCode ? variantCode : null;
                        if (newVCodeForPending == null) {
                            String su = (passSellUnit != null && !passSellUnit.isBlank()) ? passSellUnit : "cai";
                            newVCodeForPending = upperCode + "-" + su.toUpperCase();
                        }
                        if (pendingNewVariantCodes.contains(newVCodeForPending)) {
                            int sfx = 2; String base = newVCodeForPending;
                            while (pendingNewVariantCodes.contains(newVCodeForPending)) newVCodeForPending = base + "-" + sfx++;
                        }
                        pendingNewVariantCodes.add(newVCodeForPending);
                        warnings.add("ℹ️ Dòng " + lineNum + ": SP '" + upperCode + "' plan tạo mới → thêm variant '" + newVCodeForPending + "'.");
                        validatedRows.add(new ValidatedRow(
                                VariantAction.CREATE_NEW, null, null, false, newVCodeForPending,
                                null, null, null, upperCode,
                                qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                passImportUnit, passSellUnit, passPieces, expiryDateOverride));
                        continue;
                    }

                    Product product = productOpt.get();
                    if (!product.getActive()) {
                        errors.add("❌ Dòng " + lineNum + " [SP Don]: SP '" + product.getCode() + "' đã ngừng kinh doanh."); continue;
                    }
                    boolean isCombo = product.isCombo();

                    if (isCombo) {
                        List<ProductComboItem> comboItems = comboItemRepo.findByComboProduct(product);
                        if (comboItems.isEmpty()) {
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Combo '" + product.getCode() + "' chưa có thành phần."); continue;
                        }
                        int totalComponentQty = comboItems.stream().mapToInt(ProductComboItem::getQuantity).sum();
                        BigDecimal totalComboCost = cost.multiply(BigDecimal.valueOf(qty));
                        warnings.add("ℹ️ Dòng " + lineNum + ": Combo '" + product.getCode() + "' × " + qty + " → expand.");
                        for (ProductComboItem ci : comboItems) {
                            Product comp = ci.getProduct();
                            if (!comp.getActive()) { errors.add("❌ Thành phần '" + comp.getCode() + "' đã ngừng KD."); break; }
                            BigDecimal ratio = totalComponentQty > 0
                                    ? BigDecimal.valueOf(ci.getQuantity()).divide(BigDecimal.valueOf(totalComponentQty), 10, RoundingMode.HALF_UP)
                                    : BigDecimal.ZERO;
                            BigDecimal componentUnitCost = totalComboCost.multiply(ratio)
                                    .divide(BigDecimal.valueOf((long) ci.getQuantity() * qty), 2, RoundingMode.HALF_UP);
                            Optional<ProductVariant> compVarOpt = variantRepo.findByProductIdAndIsDefaultTrue(comp.getId());
                            validatedRows.add(new ValidatedRow(
                                    VariantAction.EXISTING_EXACT, comp, compVarOpt.orElse(null), compVarOpt.isEmpty(),
                                    null, null, null, null, null,
                                    ci.getQuantity() * qty, componentUnitCost, null, discountPct, false,
                                    lineNum, "Expand từ combo " + product.getCode(),
                                    null, null, null, null));
                        }
                        continue;
                    }

                    // Variant matching (giống logic cũ)
                    if (!hasVariantCode) {
                        List<ProductVariant> allVariants = variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(product.getId());
                        if (allVariants.isEmpty()) {
                            validatedRows.add(new ValidatedRow(VariantAction.CREATE_NEW, product, null, false, null,
                                    null, null, null, null, qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                    passImportUnit, passSellUnit, passPieces, expiryDateOverride));
                            warnings.add("⚠️ Dòng " + lineNum + ": SP '" + product.getCode() + "' chưa có variant → tạo mới.");
                            continue;
                        }
                        ProductVariant matchedVar = null;
                        if (passImportUnit != null) {
                            final String fIU = passImportUnit; final String fSU = passSellUnit; final Integer fP = passPieces;
                            List<ProductVariant> strict = allVariants.stream().filter(v -> v.getImportUnit() != null
                                    && fIU.equalsIgnoreCase(v.getImportUnit())
                                    && (fSU == null || v.getSellUnit() == null || fSU.equalsIgnoreCase(v.getSellUnit()))
                                    && (fP == null || fP.equals(v.getPiecesPerUnit()))).collect(Collectors.toList());
                            List<ProductVariant> loose = strict.isEmpty() ? allVariants.stream().filter(v -> v.getImportUnit() != null
                                    && fIU.equalsIgnoreCase(v.getImportUnit())
                                    && (fSU == null || v.getSellUnit() == null || fSU.equalsIgnoreCase(v.getSellUnit()))
                                    && (fP == null || v.getPiecesPerUnit() == null)).collect(Collectors.toList()) : strict;
                            if (loose.size() == 1) matchedVar = loose.get(0);
                            else if (loose.size() > 1) matchedVar = loose.stream().filter(v -> Boolean.TRUE.equals(v.getIsDefault())).findFirst().orElse(loose.get(0));
                            else {
                                boolean allHave = allVariants.stream().allMatch(v -> v.getImportUnit() != null && !v.getImportUnit().isBlank());
                                if (allHave) {
                                    String avail = allVariants.stream().map(v -> v.getVariantCode() + "(" + v.getImportUnit() + ")").collect(Collectors.joining(", "));
                                    errors.add("❌ Dòng " + lineNum + " [SP Don]: SP '" + product.getCode() + "' không có variant với importUnit='" + fIU + "'. Có: [" + avail + "]"); continue;
                                }
                                List<ProductVariant> legacy = allVariants.stream().filter(v -> v.getImportUnit() == null || v.getImportUnit().isBlank()).collect(Collectors.toList());
                                if (legacy.isEmpty()) {
                                    errors.add("❌ Dòng " + lineNum + " [SP Don]: Không khớp variant nào với importUnit='" + fIU + "'."); continue;
                                }
                                matchedVar = legacy.stream().filter(v -> Boolean.TRUE.equals(v.getIsDefault())).findFirst().orElse(legacy.get(0));
                            }
                        } else {
                            matchedVar = allVariants.stream().filter(v -> Boolean.TRUE.equals(v.getIsDefault())).findFirst().orElse(allVariants.get(0));
                        }
                        boolean isLegacy = matchedVar != null && (matchedVar.getImportUnit() == null || matchedVar.getImportUnit().isBlank());
                        if (!isLegacy && matchedVar != null && passImportUnit != null && !passImportUnit.equalsIgnoreCase(matchedVar.getImportUnit())) {
                            // Fix Case B: không silently drop — báo lỗi rõ ràng giống Case A (có variant_code)
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '" + matchedVar.getVariantCode()
                                    + "' có importUnit='" + matchedVar.getImportUnit()
                                    + "', Excel nhập='" + passImportUnit + "' — không khớp."
                                    + " Hãy điền đúng importUnit hoặc thêm cột B (variant_code)."); continue;
                        }
                        validatedRows.add(new ValidatedRow(VariantAction.EXISTING_EXACT, product, matchedVar, isLegacy, null,
                                null, null, null, null, qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                passImportUnit, passSellUnit, passPieces, expiryDateOverride));
                        continue;
                    }

                    Optional<ProductVariant> variantOpt = variantRepo.findByVariantCodeIgnoreCase(variantCode);
                    if (variantOpt.isPresent()) {
                        ProductVariant ev = variantOpt.get();
                        if (!ev.getProduct().getId().equals(product.getId())) {
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '" + variantCode + "' thuộc SP '" + ev.getProduct().getCode() + "', không phải '" + product.getCode() + "'."); continue;
                        }
                        boolean isLegacy = ev.getImportUnit() == null || ev.getImportUnit().isBlank();
                        if (!isLegacy && passImportUnit != null && !passImportUnit.equalsIgnoreCase(ev.getImportUnit())) {
                            errors.add("❌ Dòng " + lineNum + " [SP Don]: Variant '" + variantCode + "' có importUnit='" + ev.getImportUnit() + "', Excel nhập='" + passImportUnit + "' — không khớp."); continue;
                        }
                        if (!isLegacy && passPieces != null && ev.getPiecesPerUnit() != null && !passPieces.equals(ev.getPiecesPerUnit())) {
                            warnings.add("⚠️ Dòng " + lineNum + ": pieces DB=" + ev.getPiecesPerUnit() + " vs Excel=" + passPieces + " → dùng DB.");
                            passPieces = ev.getPiecesPerUnit();
                        }
                        validatedRows.add(new ValidatedRow(VariantAction.EXISTING_EXACT, product, ev, isLegacy, variantCode,
                                null, null, null, null, qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                passImportUnit, passSellUnit, passPieces, expiryDateOverride));
                    } else {
                        validatedRows.add(new ValidatedRow(VariantAction.CREATE_NEW, product, null, false, variantCode,
                                null, null, null, null, qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                                passImportUnit, passSellUnit, passPieces, expiryDateOverride));
                        warnings.add("ℹ️ Dòng " + lineNum + " [SP Don]: Variant '" + variantCode + "' chưa tồn tại → sẽ tạo mới.");
                    }
                } // end for SP Don rows
            } // end SP Don block

            // ── Sheet Combo: tạm thời bị vô hiệu hoá ──────────────────────
            // Nhập kho combo qua Excel chưa được hỗ trợ do vấn đề cập nhật giá bán.
            // Admin dùng form nhập kho thủ công để nhập combo.
            // TODO: Re-enable khi đã có giải pháp tách biệt cost update vs sell_price update.

            if (dataRowCount == 0)
                throw new ExcelImportValidationException(List.of(
                    "File Excel không có dòng dữ liệu nào. Kiểm tra sheet 'SP Don'."));
        }

        if (!errors.isEmpty()) {
            log.warn("Validate Excel thất bại: {} lỗi", errors.size());
            throw new ExcelImportValidationException(errors);
        }

        // ═══════════════════════════════════════════════════════════════════
        // PASS 2 — Ghi DB (chỉ chạy khi Pass 1 hoàn toàn sạch)
        // ═══════════════════════════════════════════════════════════════════
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGenerator.nextReceiptNo());
        receipt.setSupplierName(supplierName);
        receipt.setNote(note);
        // Dùng receiptDate từ tham số nếu hợp lệ (không tương lai), ngược lại dùng now()
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime finalReceiptDate = (receiptDate != null && !receiptDate.isAfter(now))
                ? receiptDate : now;
        receipt.setReceiptDate(finalReceiptDate);
        receipt.setShippingFee(shippingFee);
        // Sprint 1 S1-3: set supplier FK nếu có supplierId
        if (supplierId != null) {
            supplierRepository.findById(supplierId).ifPresent(receipt::setSupplier);
        }
        String currentUser = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepository.findByUsername(currentUser).ifPresent(receipt::setCreatedBy);
        InventoryReceipt savedReceipt = receiptRepository.saveAndFlush(receipt);

        int successItems = 0, newProducts = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        final BigDecimal finalVatPercent = vatPercent;

        // itemKey → InventoryReceiptItem (gộp cùng variant trong cùng phiếu)
        Map<String, InventoryReceiptItem> itemMap = new LinkedHashMap<>();
        // itemKey → tổng discountedLineTotal (dùng phân bổ shipping/vat)
        Map<String, BigDecimal> discountedLineTotals = new LinkedHashMap<>();
        // itemKey → tổng (discountedCostPerUnit * retailQty) để tính weighted avg discountedCost
        Map<String, BigDecimal> weightedDiscountedCostSum = new LinkedHashMap<>();
        // Cache variant trong session (tránh duplicate insert)
        Map<String, ProductVariant> variantCache = new LinkedHashMap<>();
        // Cache product mới tạo trong Pass 2: product_code.toUpperCase() → Product
        // Tránh duplicate insert khi nhiều dòng cùng product_code chưa tồn tại trong DB
        Map<String, Product> productCache = new LinkedHashMap<>();
        // itemKey → tổng retailQty thực tế để tăng stockQty SAU khi phân bổ xong
        Map<String, Integer> variantRetailQtyDelta = new LinkedHashMap<>();
        // itemKey → variant (dùng sau phân bổ để update stockQty + costPrice)
        Map<String, ProductVariant> itemVariantMap = new LinkedHashMap<>();
        // itemKey → danh sách batch objects (set costPrice sau phân bổ)
        Map<String, List<ProductBatch>> itemBatchMap = new LinkedHashMap<>();

        for (ValidatedRow vr : validatedRows) {
            Product product;
            ProductVariant variant;

            // ── CASE A: Tạo SP + variant mới ─────────────────────────────
            if (vr.action() == VariantAction.NEW_PRODUCT) {
                final String catName = vr.newCategoryName();
                Category category = categoryRepository.findByNameIgnoreCase(catName)
                        .orElseGet(() -> {
                            Category c = new Category();
                            c.setName(catName); c.setActive(true);
                            c.setCreatedAt(LocalDateTime.now()); c.setUpdatedAt(LocalDateTime.now());
                            return categoryRepository.save(c);
                        });
                String resolvedCode = vr.newCode() != null ? vr.newCode() : productService.generateProductCode(category);
                // Kiểm tra cache trước → tránh duplicate insert khi nhiều dòng cùng product_code mới
                if (productCache.containsKey(resolvedCode)) {
                    // Trường hợp hiếm gặp — Pass 1 nên đã chuyển sang CREATE_NEW, nhưng phòng thủ thêm
                    log.warn("CASE A: product {} đã có trong cache (dòng {}) → bỏ qua tạo lại product", resolvedCode, vr.lineNum());
                    product = productCache.get(resolvedCode);
                } else {
                    Product np = new Product();
                    np.setCode(resolvedCode); np.setName(vr.newProductName());
                    np.setCategory(category); np.setActive(true);
                    np.setCreatedAt(LocalDateTime.now()); np.setUpdatedAt(LocalDateTime.now());
                    product = productRepository.saveAndFlush(np);
                    productCache.put(resolvedCode, product);
                    newProducts++;
                }

                int variantPieces = vr.piecesPerImportUnit() != null ? vr.piecesPerImportUnit() : 1;
                String variantSellUnit = vr.sellUnit() != null ? vr.sellUnit()
                        : (vr.newUnit() != null ? vr.newUnit() : "cai");
                // Nếu importUnit trống → dùng sellUnit làm importUnit (ATOMIC: pieces=1)
                String resolvedImportUnitNew = (vr.importUnit() != null && !vr.importUnit().isBlank())
                        ? vr.importUnit().trim() : variantSellUnit;
                if (vr.importUnit() == null || vr.importUnit().isBlank()) variantPieces = 1;
                String vCode = vr.excelVariantCode() != null ? vr.excelVariantCode() : resolvedCode;
                String finalVCode = vCode;
                int sfx = 2;
                Set<String> cached = variantCache.values().stream().map(ProductVariant::getVariantCode).collect(Collectors.toSet());
                while (variantRepo.existsByVariantCode(finalVCode) || cached.contains(finalVCode)) {
                    finalVCode = vCode + "-" + sfx++;
                }
                ProductVariant nv = new ProductVariant();
                nv.setProduct(product); nv.setVariantCode(finalVCode); nv.setVariantName(vr.newProductName());
                nv.setSellUnit(variantSellUnit); nv.setImportUnit(resolvedImportUnitNew); nv.setPiecesPerUnit(variantPieces);
                nv.setSellPrice(vr.sellPrice() != null && vr.sellPrice().compareTo(BigDecimal.ZERO) > 0
                        ? vr.sellPrice() : vr.cost());
                nv.setCostPrice(vr.cost());
                nv.setStockQty(0); nv.setMinStockQty(5); nv.setIsDefault(true); nv.setActive(true);
                nv.setCreatedAt(LocalDateTime.now()); nv.setUpdatedAt(LocalDateTime.now());
                variant = variantRepo.saveAndFlush(nv);
                variantCache.put("vid:" + variant.getId(), variant);

                if (vr.importUnit() != null && !vr.importUnit().isBlank()) {
                    ProductImportUnit piu = new ProductImportUnit();
                    piu.setProduct(product); piu.setImportUnit(resolvedImportUnitNew);
                    piu.setSellUnit(variantSellUnit); piu.setPiecesPerUnit(variantPieces); piu.setIsDefault(true);
                    piu.setNote("1 " + resolvedImportUnitNew + " = " + variantPieces + " " + variantSellUnit);
                    importUnitRepo.save(piu);
                } else {
                    // importUnit trống → vẫn lưu ProductImportUnit với sellUnit (ATOMIC)
                    ProductImportUnit piu = new ProductImportUnit();
                    piu.setProduct(product); piu.setImportUnit(resolvedImportUnitNew);
                    piu.setSellUnit(variantSellUnit); piu.setPiecesPerUnit(1); piu.setIsDefault(true);
                    piu.setNote("1 " + resolvedImportUnitNew + " = 1 " + variantSellUnit);
                    importUnitRepo.save(piu);
                }
                warnings.add("✅ Dòng " + vr.lineNum() + ": Tạo SP mới '" + resolvedCode + "' - " + vr.newProductName()
                        + " (variant: " + finalVCode + ")");
            }
            // ── CASE B: Tạo variant mới cho product đã có ─────────────────
            else if (vr.action() == VariantAction.CREATE_NEW) {
                // vr.product() có thể null khi isPendingNew (product vừa được tạo ở CASE A cùng batch)
                // → lookup từ productCache (key = newCode) hoặc DB
                if (vr.product() != null) {
                    product = vr.product();
                } else if (vr.newCode() != null && productCache.containsKey(vr.newCode())) {
                    product = productCache.get(vr.newCode());
                } else if (vr.newCode() != null) {
                    product = productRepository.findByCode(vr.newCode())
                            .orElseThrow(() -> new IllegalStateException(
                                    "CASE B: Không tìm thấy product '" + vr.newCode() + "' trong DB hoặc cache"));
                } else {
                    throw new IllegalStateException("CASE B: vr.product() == null và vr.newCode() == null tại dòng " + vr.lineNum());
                }
                String newVCode = vr.excelVariantCode();
                if (newVCode == null || newVCode.isBlank()) {
                    String su = (vr.sellUnit() != null && !vr.sellUnit().isBlank()) ? vr.sellUnit() : "cai";
                    newVCode = product.getCode() + "-" + su.toUpperCase();
                }
                String finalVCode2 = newVCode;
                int sfx2 = 2;
                Set<String> cached2 = variantCache.values().stream().map(ProductVariant::getVariantCode).collect(Collectors.toSet());
                while (variantRepo.existsByVariantCode(finalVCode2) || cached2.contains(finalVCode2)) {
                    finalVCode2 = newVCode + "-" + sfx2++;
                }
                int variantPieces2 = vr.piecesPerImportUnit() != null ? vr.piecesPerImportUnit() : 1;
                String fSellUnit = (vr.sellUnit() != null && !vr.sellUnit().isBlank()) ? vr.sellUnit() : "cai";
                // Nếu importUnit trống → dùng sellUnit (ATOMIC: pieces=1)
                String resolvedImportUnit2 = (vr.importUnit() != null && !vr.importUnit().isBlank())
                        ? vr.importUnit().trim() : fSellUnit;
                if (vr.importUnit() == null || vr.importUnit().isBlank()) variantPieces2 = 1;
                boolean dbHasDefault = variantRepo.findByProductIdAndIsDefaultTrue(product.getId()).isPresent();
                boolean cacheHasDefault = variantCache.values().stream()
                        .anyMatch(v -> v.getProduct().getId().equals(product.getId()) && Boolean.TRUE.equals(v.getIsDefault()));
                boolean noDefaultYet = !dbHasDefault && !cacheHasDefault;

                ProductVariant nv2 = new ProductVariant();
                nv2.setProduct(product); nv2.setVariantCode(finalVCode2);
                nv2.setVariantName(product.getName() + (noDefaultYet ? "" : " (" + fSellUnit + ")"));
                nv2.setSellUnit(fSellUnit); nv2.setImportUnit(resolvedImportUnit2); nv2.setPiecesPerUnit(variantPieces2);
                nv2.setSellPrice(vr.sellPrice() != null && vr.sellPrice().compareTo(BigDecimal.ZERO) > 0
                        ? vr.sellPrice() : BigDecimal.ZERO);
                nv2.setCostPrice(vr.cost());
                nv2.setStockQty(0); nv2.setMinStockQty(5); nv2.setIsDefault(noDefaultYet); nv2.setActive(true);
                nv2.setCreatedAt(LocalDateTime.now()); nv2.setUpdatedAt(LocalDateTime.now());
                variant = variantRepo.saveAndFlush(nv2);
                variantCache.put("vid:" + variant.getId(), variant);

                if (importUnitRepo.findByProductIdAndImportUnitIgnoreCase(product.getId(), resolvedImportUnit2).isEmpty()) {
                    ProductImportUnit piu2 = new ProductImportUnit();
                    piu2.setProduct(product); piu2.setImportUnit(resolvedImportUnit2);
                    piu2.setSellUnit(fSellUnit); piu2.setPiecesPerUnit(variantPieces2); piu2.setIsDefault(noDefaultYet);
                    piu2.setNote("1 " + resolvedImportUnit2 + " = " + variantPieces2 + " " + fSellUnit);
                    importUnitRepo.save(piu2);
                }
                warnings.add("✅ Dòng " + vr.lineNum() + ": Tạo variant mới '" + finalVCode2
                        + "' cho SP '" + product.getCode() + "' (isDefault=" + noDefaultYet + ")");
                log.info("Tạo variant mới: {} (isDefault={}, importUnit={}, pieces={})",
                        finalVCode2, noDefaultYet, resolvedImportUnit2, variantPieces2);
            }
            // ── CASE C: Variant đã tồn tại ────────────────────────────────
            else { // EXISTING_EXACT
                product = vr.product();
                ProductVariant existVar = vr.resolvedVariant();

                if (existVar == null) {
                    existVar = variantService.createDefaultVariantFromProduct(product);
                    variantCache.put("vid:" + existVar.getId(), existVar);
                }

                // Cập nhật legacy variant (importUnit=NULL) → update từ Excel
                if (vr.isLegacyVariant() && existVar != null) {
                    String newImportU;
                    int newPieces;
                    String newSellU = (vr.sellUnit() != null && !vr.sellUnit().isBlank())
                            ? vr.sellUnit().trim() : existVar.getSellUnit();
                    if (newSellU == null) newSellU = "cai";
                    if (vr.importUnit() != null && !vr.importUnit().isBlank()) {
                        newImportU = vr.importUnit().trim();
                        newPieces  = vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0
                                ? vr.piecesPerImportUnit() : 1;
                    } else {
                        // importUnit không có trong Excel → fallback sang sellUnit (ATOMIC)
                        newImportU = newSellU;
                        newPieces  = 1;
                    }
                    existVar.setImportUnit(newImportU);
                    existVar.setSellUnit(newSellU);
                    existVar.setPiecesPerUnit(newPieces);
                    existVar.setUpdatedAt(LocalDateTime.now());
                    variantRepo.save(existVar);
                    warnings.add("ℹ️ Dòng " + vr.lineNum() + ": Cập nhật importUnit/pieces cho variant '"
                            + existVar.getVariantCode() + "' → importUnit=" + newImportU + " pieces=" + newPieces);
                    if (importUnitRepo.findByProductIdAndImportUnitIgnoreCase(product.getId(), newImportU).isEmpty()) {
                        ProductImportUnit piu3 = new ProductImportUnit();
                        piu3.setProduct(product); piu3.setImportUnit(newImportU);
                        piu3.setSellUnit(newSellU); piu3.setPiecesPerUnit(newPieces);
                        piu3.setIsDefault(Boolean.TRUE.equals(existVar.getIsDefault()));
                        piu3.setNote("1 " + newImportU + " = " + newPieces + " " + newSellU);
                        importUnitRepo.save(piu3);
                    }
                }

                // Cập nhật giá bán nếu Excel cung cấp
                if (existVar != null && vr.sellPrice() != null && vr.sellPrice().compareTo(BigDecimal.ZERO) > 0) {
                    existVar.setSellPrice(vr.sellPrice());
                    existVar.setUpdatedAt(LocalDateTime.now());
                    variantRepo.save(existVar);
                    warnings.add("ℹ️ Dòng " + vr.lineNum() + ": Cập nhật giá bán variant '"
                            + existVar.getVariantCode() + "' → " + vr.sellPrice().toPlainString() + " ₫");
                }
                variant = existVar;
            }

            // ── Xác định importUnit + pieces (SINGLE và COMBO đều xử lý giống nhau) ─
            String resolvedImportUnit;
            int pieces;

            if (variant != null && variant.getImportUnit() != null && !variant.getImportUnit().isBlank()) {
                resolvedImportUnit = variant.getImportUnit();
                pieces = (variant.getPiecesPerUnit() != null && variant.getPiecesPerUnit() > 0)
                        ? variant.getPiecesPerUnit() : 1;
            } else if (vr.importUnit() != null && !vr.importUnit().isBlank()) {
                resolvedImportUnit = vr.importUnit();
                pieces = vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0
                        ? vr.piecesPerImportUnit() : 1;
            } else {
                var defaultPiu = importUnitRepo.findByProductIdAndIsDefaultTrue(product.getId());
                if (defaultPiu.isPresent()) {
                    resolvedImportUnit = defaultPiu.get().getImportUnit();
                    pieces = defaultPiu.get().getPiecesPerUnit();
                } else {
                    resolvedImportUnit = (variant != null && variant.getSellUnit() != null)
                            ? variant.getSellUnit() : "cai";
                    pieces = 1;
                }
            }

            // Tính cost (discount từng dòng độc lập)
            int addedRetailQty = UnitConverter.toRetailQty(pieces, vr.qty());
            BigDecimal costPerUnit = UnitConverter.costPerRetailUnit(vr.cost(), pieces);
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    vr.discountPct().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal discountedCostPerUnit = costPerUnit.multiply(discountFactor).setScale(2, RoundingMode.HALF_UP);
            // discountedLineTotal = tổng giá sau CK của dòng này (theo ĐV nhập, không nhân pieces)
            // dùng để phân bổ shipping/vat
            BigDecimal discountedLineTotal = vr.cost()
                    .multiply(discountFactor)
                    .multiply(BigDecimal.valueOf(vr.qty()))
                    .setScale(4, RoundingMode.HALF_UP);
            // weightedSum = discountedCostPerUnit * addedRetailQty (dùng tính weighted avg)
            BigDecimal weightedSum = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));
            // totalAmount tích lũy theo giá SAU chiết khấu; ship+VAT cộng vào cuối
            totalAmount = totalAmount.add(discountedLineTotal);

            // itemKey — dùng variantId để tránh gộp nhầm
            String itemKey = variant != null
                    ? "vid:" + variant.getId()
                    : product.getId() + "|" + resolvedImportUnit.toLowerCase() + "|" + pieces;

            if (itemMap.containsKey(itemKey)) {
                // Cùng variant trong phiếu → gộp số lượng, tính lại weighted avg discountedCost
                InventoryReceiptItem existing = itemMap.get(itemKey);
                int prevRetailQty = existing.getRetailQtyAdded() != null ? existing.getRetailQtyAdded() : existing.getQuantity();
                existing.setQuantity(existing.getQuantity() + vr.qty());
                existing.setRetailQtyAdded(prevRetailQty + addedRetailQty);
                discountedLineTotals.merge(itemKey, discountedLineTotal, BigDecimal::add);
                weightedDiscountedCostSum.merge(itemKey, weightedSum, BigDecimal::add);
                // Tính lại weighted average discountedCost
                int totalRetailQty = existing.getRetailQtyAdded();
                BigDecimal totalWeightedSum = weightedDiscountedCostSum.get(itemKey);
                BigDecimal avgDiscountedCost = totalRetailQty > 0
                        ? totalWeightedSum.divide(BigDecimal.valueOf(totalRetailQty), 2, RoundingMode.HALF_UP)
                        : discountedCostPerUnit;
                existing.setDiscountedCost(avgDiscountedCost);
                existing.setFinalCost(avgDiscountedCost);
                existing.setFinalCostWithVat(avgDiscountedCost);
                warnings.add("ℹ️ Dòng " + vr.lineNum() + ": Trùng variant '" + (variant != null ? variant.getVariantCode() : itemKey)
                        + "' → gộp SL, weighted avg cost=" + avgDiscountedCost.toPlainString());
            } else {
                InventoryReceiptItem item = new InventoryReceiptItem();
                item.setReceipt(savedReceipt); item.setProduct(product);
                item.setQuantity(vr.qty()); item.setUnitCost(vr.cost());
                item.setDiscountPercent(vr.discountPct());
                item.setDiscountedCost(discountedCostPerUnit);
                item.setVatPercent(finalVatPercent);
                item.setVatAllocated(BigDecimal.ZERO); item.setShippingAllocated(BigDecimal.ZERO);
                item.setFinalCost(discountedCostPerUnit); item.setFinalCostWithVat(discountedCostPerUnit);
                item.setImportUnitUsed(resolvedImportUnit); item.setPiecesUsed(pieces);
                item.setRetailQtyAdded(addedRetailQty);
                item.setVariant(variant);
                item.setExpiryDateOverride(vr.expiryDateOverride()); // Sprint 1 S1-2
                itemMap.put(itemKey, item);
                discountedLineTotals.put(itemKey, discountedLineTotal);
                weightedDiscountedCostSum.put(itemKey, weightedSum);
            }

            // Tạo Batch — 1 batch per row (costPrice tạm thời, sẽ update sau khi phân bổ shipping/VAT)
            if (variant != null) {
                // Sprint 1 S1-2: ưu tiên expiryDateOverride từ cột N Excel → fallback sang expiryDays
                LocalDate expiryDate;
                LocalDate importLocalDate = finalReceiptDate.toLocalDate();
                if (vr.expiryDateOverride() != null) {
                    expiryDate = vr.expiryDateOverride();
                } else if (variant.getExpiryDays() != null && variant.getExpiryDays() > 0) {
                    expiryDate = importLocalDate.plusDays(variant.getExpiryDays());
                } else {
                    expiryDate = importLocalDate.plusYears(10);
                }
                String batchCode = buildUniqueBatchCode(savedReceipt.getReceiptNo(), variant.getVariantCode());
                ProductBatch batch = new ProductBatch();
                batch.setProduct(product); batch.setVariant(variant); batch.setReceipt(savedReceipt);
                batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
                batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
                batch.setCostPrice(discountedCostPerUnit); // tạm thời — sẽ cập nhật sau phân bổ
                batchRepository.saveAndFlush(batch);
                // Ghi nhớ batch cho itemKey để update costPrice sau
                itemBatchMap.computeIfAbsent(itemKey, k -> new ArrayList<>()).add(batch);
                // Ghi nhớ delta stockQty để tăng SAU phân bổ (tránh em.clear() reset về 0)
                variantRetailQtyDelta.merge(itemKey, addedRetailQty, Integer::sum);
                // Ghi nhớ variant reference (chưa save stockQty ở đây)
                itemVariantMap.putIfAbsent(itemKey, variant);
            }
            successItems++;
        }

        // ── Lưu items vào DB TRƯỚC phân bổ (id được gán, tránh cascade conflict) ──
        receiptItemRepository.saveAllAndFlush(itemMap.values());

        // ── Phân bổ shippingFee + VAT theo tỷ lệ discountedLineTotal ──────
        final BigDecimal finalShippingFee = shippingFee;
        BigDecimal totalDiscountedValue = discountedLineTotals.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalVatAmount = totalDiscountedValue
                .multiply(vatPercent.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP))
                .setScale(2, RoundingMode.HALF_UP);

        for (Map.Entry<String, InventoryReceiptItem> entry : itemMap.entrySet()) {
            String itemKey = entry.getKey();
            InventoryReceiptItem item = entry.getValue();
            BigDecimal lineTotal = discountedLineTotals.getOrDefault(itemKey, BigDecimal.ZERO);
            int retailQty = item.getRetailQtyAdded() != null && item.getRetailQtyAdded() > 0
                    ? item.getRetailQtyAdded() : item.getQuantity();

            BigDecimal shippingForLine = BigDecimal.ZERO, vatForLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                shippingForLine = finalShippingFee.multiply(lineTotal).divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
                vatForLine      = totalVatAmount.multiply(lineTotal).divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal shippingPerUnit = retailQty > 0
                    ? shippingForLine.divide(BigDecimal.valueOf(retailQty), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            BigDecimal vatPerUnit = retailQty > 0
                    ? vatForLine.divide(BigDecimal.valueOf(retailQty), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            BigDecimal finalCostBeforeVat = item.getDiscountedCost().add(shippingPerUnit).setScale(2, RoundingMode.HALF_UP);
            BigDecimal finalCostWithVat   = finalCostBeforeVat.add(vatPerUnit).setScale(2, RoundingMode.HALF_UP);
            item.setShippingAllocated(shippingPerUnit); item.setVatAllocated(vatPerUnit);
            item.setFinalCost(finalCostBeforeVat); item.setFinalCostWithVat(finalCostWithVat);
            receiptItemRepository.save(item);

            // Cập nhật batch costPrice sau phân bổ (giá vốn chính xác)
            List<ProductBatch> batches = itemBatchMap.getOrDefault(itemKey, List.of());
            for (ProductBatch b : batches) {
                b.setCostPrice(finalCostWithVat);
                batchRepository.save(b);
            }

            // Cập nhật variant: costPrice + sellPrice + stockQty (1 lần duy nhất sau phân bổ)
            ProductVariant v = itemVariantMap.get(itemKey);
            if (v != null) {
                int deltaQty = variantRetailQtyDelta.getOrDefault(itemKey, 0);
                // Re-fetch để lấy stockQty mới nhất từ DB (tránh overwrite nếu có concurrent update)
                ProductVariant freshVar = variantRepo.findById(v.getId()).orElse(v);
                freshVar.setCostPrice(finalCostWithVat);
                if (item.getVariant() != null && item.getVariant().getSellPrice() != null
                        && item.getVariant().getSellPrice().compareTo(BigDecimal.ZERO) > 0) {
                    freshVar.setSellPrice(item.getVariant().getSellPrice());
                }
                freshVar.setStockQty((freshVar.getStockQty() != null ? freshVar.getStockQty() : 0) + deltaQty);
                freshVar.setUpdatedAt(LocalDateTime.now());
                variantRepo.save(freshVar);
            }
        }

        // totalAmount = sau CK (đã tích lũy) + ship + VAT = tổng thực trả
        BigDecimal grandTotal = totalAmount.add(shippingFee).add(totalVatAmount)
                .setScale(0, RoundingMode.HALF_UP);
        savedReceipt.setTotalAmount(grandTotal);
        savedReceipt.setTotalVat(totalVatAmount);
        receiptRepository.save(savedReceipt);

        // ── Refresh virtual stock của tất cả combo chứa SP vừa nhập ─────────
        itemVariantMap.values().stream()
                .map(v -> v.getProduct().getId())
                .distinct()
                .forEach(comboService::refreshCombosContaining);

        log.info("Import OK: {} — {} SP ({} mới)", savedReceipt.getReceiptNo(), successItems, newProducts);
        return new ExcelReceiptResult(savedReceipt.getReceiptNo(), supplierName,
                validatedRows.size(), successItems, 0, 0, newProducts, totalAmount, errors, warnings);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Detect xem Excel dùng format mới (13 cột, có cột B = variant_code) hay cũ (12 cột).
     * Kiểm tra: nếu hàng header có từ "variant" ở col B, hoặc col B của data row đầu tiên
     * trông như mã variant (ngắn, không có khoảng trắng), thì là NEW format.
     */
    private boolean detectNewFormat(Sheet sheet, int dataStartRow) {
        // Tìm hàng header (dataStartRow - 1 hoặc các hàng trước)
        for (int i = Math.max(0, dataStartRow - 3); i < dataStartRow; i++) {
            Row hRow = sheet.getRow(i);
            if (hRow == null) continue;
            String colB = getCellString(hRow, 1);
            if (colB != null) {
                String lower = colB.trim().toLowerCase();
                if (lower.contains("variant") || lower.equals("b: variant code")
                        || lower.equals("mã variant") || lower.equals("ma variant")
                        || lower.equals("variant code")) {
                    return true;
                }
                // Header cũ ở col B: "ten sp", "tên sp", "b: ten sp"
                if (lower.contains("ten sp") || lower.contains("tên sp") || lower.startsWith("b:")) {
                    return false;
                }
            }
        }
        // Kiểm tra data row đầu tiên — nếu col B là mã ngắn (không space, ≤20 ký tự) → NEW format
        // nếu col B là text dài (tên sản phẩm) → OLD format
        Row firstDataRow = sheet.getRow(dataStartRow);
        if (firstDataRow != null) {
            String colB = getCellString(firstDataRow, 1);
            if (colB != null && !colB.isBlank()) {
                // Tên sản phẩm thường dài hơn 20 ký tự hoặc có khoảng trắng
                if (colB.trim().length() > 20 || colB.trim().contains(" ")) {
                    return false; // OLD format — col B là tên SP
                }
                // Mã variant thường ngắn, không khoảng trắng
                return true; // NEW format
            }
            // Col B rỗng → NEW format (variant_code optional)
            return true;
        }
        return true; // mặc định NEW format
    }

    /** Xử lý 1 component SP cho combo expand. */
    private void processItem(Product product, int qty, BigDecimal unitCost, BigDecimal discountPct,
                             InventoryReceipt receipt,
                             Map<String, InventoryReceiptItem> itemMap,
                             Map<String, BigDecimal> discountedLineTotals,
                             Map<String, BigDecimal> weightedDiscountedCostSum,
                             Map<String, Integer> variantRetailQtyDelta,
                             Map<String, ProductVariant> itemVariantMap,
                             Map<String, List<ProductBatch>> itemBatchMap,
                             List<String> warnings) {
        ProductVariant variant = variantRepo.findByProductIdAndIsDefaultTrue(product.getId())
                .orElseGet(() -> variantService.createDefaultVariantFromProduct(product));
        int pieces = UnitConverter.effectivePieces(variant.getImportUnit(), variant.getPiecesPerUnit());
        String importUnitUsed = variant.getImportUnit() != null ? variant.getImportUnit() : "cai";
        int addedRetailQty = UnitConverter.toRetailQty(pieces, qty);
        BigDecimal costPerRetailUnit = UnitConverter.costPerRetailUnit(unitCost, pieces);
        BigDecimal discountFactor = BigDecimal.ONE.subtract(
                discountPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
        BigDecimal discountedCostPerUnit = costPerRetailUnit.multiply(discountFactor).setScale(2, RoundingMode.HALF_UP);
        BigDecimal discountedLineTotal = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));
        BigDecimal weightedSum = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));

        String itemKey = "vid:" + variant.getId();
        if (itemMap.containsKey(itemKey)) {
            InventoryReceiptItem existing = itemMap.get(itemKey);
            int prevRetailQty = existing.getRetailQtyAdded() != null ? existing.getRetailQtyAdded() : existing.getQuantity();
            existing.setQuantity(existing.getQuantity() + qty);
            existing.setRetailQtyAdded(prevRetailQty + addedRetailQty);
            discountedLineTotals.merge(itemKey, discountedLineTotal, BigDecimal::add);
            weightedDiscountedCostSum.merge(itemKey, weightedSum, BigDecimal::add);
            int totalRetailQty = existing.getRetailQtyAdded();
            BigDecimal totalWeighted = weightedDiscountedCostSum.get(itemKey);
            BigDecimal avgCost = totalRetailQty > 0
                    ? totalWeighted.divide(BigDecimal.valueOf(totalRetailQty), 2, RoundingMode.HALF_UP)
                    : discountedCostPerUnit;
            existing.setDiscountedCost(avgCost);
            existing.setFinalCost(avgCost);
            existing.setFinalCostWithVat(avgCost);
        } else {
            InventoryReceiptItem item = new InventoryReceiptItem();
            item.setReceipt(receipt); item.setProduct(product); item.setQuantity(qty);
            item.setUnitCost(unitCost); item.setDiscountPercent(discountPct);
            item.setDiscountedCost(discountedCostPerUnit);
            item.setVatPercent(BigDecimal.ZERO); item.setVatAllocated(BigDecimal.ZERO);
            item.setShippingAllocated(BigDecimal.ZERO);
            item.setFinalCost(discountedCostPerUnit); item.setFinalCostWithVat(discountedCostPerUnit);
            item.setImportUnitUsed(importUnitUsed); item.setPiecesUsed(pieces);
            item.setRetailQtyAdded(addedRetailQty);
            item.setVariant(variant);
            itemMap.put(itemKey, item);
            discountedLineTotals.put(itemKey, discountedLineTotal);
            weightedDiscountedCostSum.put(itemKey, weightedSum);
        }
        // Tạo batch (costPrice tạm — sẽ update sau phân bổ)
        LocalDate expiryDate = (variant.getExpiryDays() != null && variant.getExpiryDays() > 0)
                ? LocalDate.now().plusDays(variant.getExpiryDays()) : LocalDate.now().plusYears(10);
        String batchCode = buildUniqueBatchCode(receipt.getReceiptNo(), variant.getVariantCode());
        ProductBatch batch = new ProductBatch();
        batch.setProduct(product); batch.setVariant(variant); batch.setReceipt(receipt);
        batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
        batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
        batch.setCostPrice(discountedCostPerUnit);
        batchRepository.saveAndFlush(batch);
        itemBatchMap.computeIfAbsent(itemKey, k -> new ArrayList<>()).add(batch);
        variantRetailQtyDelta.merge(itemKey, addedRetailQty, Integer::sum);
        itemVariantMap.putIfAbsent(itemKey, variant);
    }

    private int findDataStartRow(Sheet sheet) {
        // Thử row index 3 (row 4 Excel) trước
        Row row3 = sheet.getRow(3);
        if (row3 != null) {
            String colA = getCellString(row3, COL_PRODUCT_CODE);
            String colD = getCellString(row3, COL_QUANTITY);
            if (colA != null && !colA.isBlank() && !isHeaderText(colA)) {
                if (colD != null && !colD.isBlank()) {
                    try { if (Double.parseDouble(colD.replace(",", "")) > 0) return 3; } catch (NumberFormatException ignored) {}
                }
            }
        }
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String colA = getCellString(row, COL_PRODUCT_CODE);
            if (colA == null || colA.isBlank() || isHeaderText(colA)) continue;
            // Col A không phải header và có giá trị → đây là data row đầu tiên
            // Xác nhận thêm bằng cách kiểm tra col C hoặc D có số không
            String colC = getCellString(row, 2);
            String colD = getCellString(row, 3);
            if (colD != null) {
                try { if (Double.parseDouble(colD.replace(",", "")) > 0) return i; } catch (NumberFormatException ignored) {}
            }
            if (colC != null) {
                try { if (Double.parseDouble(colC.replace(",", "")) > 0) return i; } catch (NumberFormatException ignored) {}
            }
        }
        return 3;
    }

    private boolean isHeaderText(String val) {
        if (val == null) return false;
        String l = val.trim().toLowerCase();
        return l.equals("ten sp") || l.equals("tên sp") || l.equals("name") || l.startsWith("template")
                || l.startsWith("nha dan") || l.startsWith("huong dan") || l.startsWith("do tim")
                || l.startsWith("a=ma") || l.startsWith("a=m")
                || l.equals("c: ten sp") || l.equals("b: ten sp") || l.equals("ma sp")
                || l.equals("a: ma sp") || l.equals("a: ma sp (*)") || l.equals("a: ma sp(*)")
                || l.equals("variant code") || l.equals("b: variant code")
                || l.equals("b: ma variant") || l.equals("ma variant") || l.equals("mã variant")
                || l.equals("product code") || l.equals("a: product code");
    }

    private String buildUniqueBatchCode(String receiptNo, String variantCode) {
        String base = "BATCH-" + receiptNo + "-" + variantCode;
        if (!batchRepository.existsByBatchCode(base)) return base;
        int suffix = 2;
        while (batchRepository.existsByBatchCode(base + "-" + suffix)) suffix++;
        return base + "-" + suffix;
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("File Excel không được rỗng");
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx"))
            throw new IllegalArgumentException("Chỉ hỗ trợ file .xlsx");
    }

    private boolean isRowEmpty(Row row, boolean isNewFormat) {
        // Kiểm tra cột A và cột qty + cost (khác nhau tùy format)
        int colQty  = isNewFormat ? COL_QUANTITY : OLD_COL_QUANTITY;
        int colCost = isNewFormat ? COL_COST      : OLD_COL_COST;
        for (int c : new int[]{COL_PRODUCT_CODE, colQty, colCost}) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String val = getCellString(row, c);
                if (val != null && !val.isBlank()) return false;
            }
        }
        return true;
    }

    // Backward-compat overload (gọi từ nơi không biết format)
    private boolean isRowEmpty(Row row) {
        return isRowEmpty(row, true);
    }

    private boolean isLegendRow(Row row) {
        // Kiểm tra tất cả cột đầu (A, B, C) để bắt mọi dạng legend
        for (int col = 0; col <= 2; col++) {
            String val = getCellString(row, col);
            if (val == null) continue;
            String l = val.trim().toLowerCase();
            // Các dạng legend phổ biến:
            if (l.startsWith("mau xanh") || l.startsWith("màu xanh")
                    || l.startsWith("mau vang") || l.startsWith("màu vàng")
                    || l.startsWith("mau tim")  || l.startsWith("màu tím")
                    || l.startsWith("legend")   || l.startsWith("ghi chu mau")
                    // Dạng "xanh = SP/VARIANT DA CO" (template mới)
                    || l.startsWith("xanh =")   || l.startsWith("xanh=")
                    || l.startsWith("vang =")   || l.startsWith("vàng =")
                    || l.startsWith("tim =")    || l.startsWith("tím =")
                    // Dạng "= SP da co" / "= COMBO" (nếu cột A trống, cột B chứa legend)
                    || l.startsWith("= sp")     || l.startsWith("= combo")
                    || l.startsWith("= mau")    || l.startsWith("= màu")
                    // Dòng note cuối file
                    || l.startsWith("luu y:")   || l.startsWith("lưu ý:")
                    || l.startsWith("chu thich") || l.startsWith("chú thích")) {
                return true;
            }
        }
        return false;
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

    private Integer getCellIntOptional(Row row, int col) { return getCellInt(row, col); }

    /**
     * Sprint 1 S1-2: Đọc cột N (expiryDateOverride) từ Excel.
     * Hỗ trợ: Date cell (Excel date serial), String "yyyy-MM-dd" hoặc "dd/MM/yyyy".
     * Trả null nếu ô trống hoặc không parse được.
     */
    private LocalDate getCellLocalDate(Row row, int col) {
        if (row == null) return null;
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        try {
            return switch (cell.getCellType()) {
                case NUMERIC -> {
                    // Excel date serial → LocalDate
                    if (org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(cell)) {
                        yield cell.getLocalDateTimeCellValue().toLocalDate();
                    }
                    yield null;
                }
                case STRING -> {
                    String s = cell.getStringCellValue().trim();
                    if (s.isBlank()) yield null;
                    // Thử yyyy-MM-dd
                    try { yield LocalDate.parse(s, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE); }
                    catch (Exception ignored) {}
                    // Thử dd/MM/yyyy
                    try { yield LocalDate.parse(s, java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")); }
                    catch (Exception ignored) {}
                    // Thử dd-MM-yyyy
                    try { yield LocalDate.parse(s, java.time.format.DateTimeFormatter.ofPattern("dd-MM-yyyy")); }
                    catch (Exception ignored) {}
                    yield null;
                }
                default -> null;
            };
        } catch (Exception e) { return null; }
    }
}
