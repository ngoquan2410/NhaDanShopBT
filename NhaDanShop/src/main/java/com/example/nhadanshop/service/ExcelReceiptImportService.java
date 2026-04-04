package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.entity.Product.ProductType;
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
 * Service nhập phiếu nhập kho từ file Excel.
 *
 * Cấu trúc file Excel (row 1-2 = title, row 3 = header, dữ liệu từ row 4):
 * ┌──────┬──────┬─────────┬────────────┬──────────┬────────┬────────┬──────────────┬────────┐
 * │ A    │ B    │ C       │ D          │ E        │ F      │ G      │ H            │ I      │
 * │ Mã SP│ Tên  │ SL nhập │ Giá nhập   │ Giá bán  │ CK %   │ Ghi chú│ Danh mục mới │ Đvị mới│
 * └──────┴──────┴─────────┴────────────┴──────────┴────────┴────────┴──────────────┴────────┘
 *
 * Cột E (Giá bán): Nếu điền → cập nhật sell_price của sản phẩm.
 *                  Nếu để trống → giữ nguyên giá bán hiện tại.
 * Cột H, I: Chỉ dùng khi tạo sản phẩm mới (cột A trống hoặc không tìm thấy).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class ExcelReceiptImportService {

    private final ProductRepository productRepository;
    private final InventoryReceiptRepository receiptRepository;
    private final ProductBatchRepository batchRepository;
    private final UserRepository userRepository;
    private final InvoiceNumberGenerator numberGenerator;
    private final CategoryRepository categoryRepository;
    private final ProductService productService;
    private final ProductComboRepository comboItemRepo;
    private final ProductImportUnitRepository importUnitRepo;
    private final ProductVariantService variantService;   // Sprint 0
    private final ProductVariantRepository variantRepo;   // Sprint 0

    // Column indices — 12 cột A..L
    private static final int COL_CODE      = 0;  // A: Mã SP
    private static final int COL_NAME      = 1;  // B: Tên SP
    private static final int COL_QUANTITY  = 2;  // C: Số lượng
    private static final int COL_COST      = 3;  // D: Giá nhập
    private static final int COL_SELL      = 4;  // E: Giá bán  (→ sell_price)
    private static final int COL_DISCOUNT  = 5;  // F: Chiết khấu %
    private static final int COL_NOTE      = 6;  // G: Ghi chú
    private static final int COL_CATEGORY  = 7;  // H: Danh mục (SP mới)
    private static final int COL_UNIT      = 8;  // I: Đơn vị (SP mới)
    private static final int COL_IMPORT_UNIT  = 9;  // J: ĐV nhập kho  (→ import_unit)
    private static final int COL_SELL_UNIT    = 10; // K: ĐV bán lẻ    (→ sell_unit)
    private static final int COL_PIECES       = 11; // L: Số lẻ/ĐV nhập (→ pieces_per_import_unit)

    /**
     * Kết quả import phiếu nhập từ Excel.
     */
    public record ExcelReceiptResult(
            String receiptNo,
            String supplierName,
            int totalRows,
            int successItems,
            int skippedItems,
            int errorItems,
            int newProducts,        // ← SP mới được tạo tự động
            BigDecimal totalAmount,
            List<String> errors,
            List<String> warnings
    ) {}

    /**
     * Exception ném khi validate file Excel thất bại.
     * Chứa danh sách lỗi theo từng dòng để hiển thị cho admin.
     */
    public static class ExcelImportValidationException extends RuntimeException {
        private final List<String> validationErrors;
        public ExcelImportValidationException(List<String> errors) {
            super("File Excel có " + errors.size() + " lỗi — không thể import");
            this.validationErrors = errors;
        }
        public List<String> getValidationErrors() { return validationErrors; }
    }

    /**
     * Import phiếu nhập kho từ file Excel — 2 pass:
     *  Pass 1: đọc & validate toàn bộ file, KHÔNG ghi DB.
     *          Nếu có BẤT KỲ lỗi nào → throw ExcelImportValidationException → rollback.
     *  Pass 2: chỉ chạy khi Pass 1 hoàn toàn sạch → ghi DB.
     */
    @Transactional(rollbackFor = Exception.class)
    public ExcelReceiptResult importReceiptFromExcel(
            MultipartFile file, String supplierName, String note,
            BigDecimal shippingFee, BigDecimal vatPercent) throws IOException {

        validateFile(file);
        if (shippingFee == null || shippingFee.compareTo(BigDecimal.ZERO) < 0) shippingFee = BigDecimal.ZERO;
        if (vatPercent == null || vatPercent.compareTo(BigDecimal.ZERO) < 0)   vatPercent  = BigDecimal.ZERO;
        if (vatPercent.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new ExcelImportValidationException(List.of("VAT % phải trong khoảng 0–100, hiện là: " + vatPercent));
        }

        List<String> errors   = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // ════════════════════════════════════════════════════════════════════
        // PASS 1 — Validate toàn bộ file, KHÔNG ghi DB
        // ════════════════════════════════════════════════════════════════════
        List<ValidatedRow> validatedRows = new ArrayList<>();

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            int startRow = findDataStartRow(sheet);
            log.info("Receipt Excel validate: data từ row index {} (Excel row {})", startRow, startRow + 1);

            if (sheet.getLastRowNum() < startRow) {
                throw new ExcelImportValidationException(
                        List.of("File Excel không có dòng dữ liệu nào (trống từ dòng " + (startRow + 1) + " trở đi)"));
            }

            int dataRowCount = 0;
            // Track unit+pieces đã thấy trong file này — phát hiện conflict ngay Pass 1
            // Key = mã SP (code) hoặc tên SP (name), Value = "unit|pieces|lineNum"
            Map<String, String> pass1UnitTracker = new LinkedHashMap<>();
            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row) || isLegendRow(row)) continue;
                dataRowCount++;
                int lineNum = rowIdx + 1; // số dòng Excel (1-based, dễ hiểu cho admin)

                // ── Đọc cell ────────────────────────────────────────────────
                String code = getCellString(row, COL_CODE);
                String name = getCellString(row, COL_NAME);
                Integer qty = getCellInt(row, COL_QUANTITY);
                BigDecimal cost = getCellDecimal(row, COL_COST);
                BigDecimal sellPrice = getCellDecimal(row, COL_SELL); // null = không cập nhật
                BigDecimal discountPct = getCellDecimal(row, COL_DISCOUNT);
                if (discountPct == null) discountPct = BigDecimal.ZERO;
                String lineNote = getCellString(row, COL_NOTE);
                // 3 cột mới — quy đổi đơn vị
                String excelImportUnit = getCellString(row, COL_IMPORT_UNIT);
                String excelSellUnit   = getCellString(row, COL_SELL_UNIT);
                Integer excelPieces    = getCellIntOptional(row, COL_PIECES);

                // ── Validate giá trị bắt buộc ───────────────────────────────
                if ((code == null || code.isBlank()) && (name == null || name.isBlank())) {
                    errors.add("❌ Dòng " + lineNum + ": Cần có mã SP (cột A) hoặc tên SP (cột B)");
                    continue;
                }
                if (qty == null || qty <= 0) {
                    errors.add("❌ Dòng " + lineNum + ": Số lượng (cột C) phải > 0"
                            + (code != null ? " [" + code + "]" : ""));
                    continue;
                }
                if (cost == null || cost.compareTo(BigDecimal.ZERO) <= 0) {
                    errors.add("❌ Dòng " + lineNum + ": Giá nhập (cột D) phải > 0"
                            + (code != null ? " [" + code + "]" : ""));
                    continue;
                }
                if (discountPct.compareTo(BigDecimal.ZERO) < 0 || discountPct.compareTo(BigDecimal.valueOf(100)) > 0) {
                    errors.add("❌ Dòng " + lineNum + ": Chiết khấu % (cột F) phải trong khoảng 0–100, hiện là: " + discountPct);
                    continue;
                }

                // ── Tìm sản phẩm ────────────────────────────────────────────
                FindResult findResult = findProduct(code, name, lineNum, errors, warnings);
                if (findResult.isAmbiguous()) continue; // lỗi đã được thêm bởi findProduct

                Optional<Product> productOpt = findResult.product();

                if (productOpt.isPresent()) {
                    Product product = productOpt.get();
                    if (!product.getActive()) {
                        errors.add("❌ Dòng " + lineNum + ": Sản phẩm '" + product.getCode()
                                + " - " + product.getName() + "' đã ngừng kinh doanh. "
                                + "Vui lòng kích hoạt lại trước khi nhập kho.");
                        continue;
                    }
                    boolean isCombo = product.isCombo();
                    if (isCombo) {
                        warnings.add("ℹ️ Dòng " + lineNum + ": '" + product.getCode()
                                + "' là COMBO → sẽ expand thành " + product.getComboItems().size() + " sản phẩm thành phần");
                    }

                    // ── Xử lý importUnit / pieces cho SP đã tồn tại ──────────
                    // Chỉ cập nhật khi SP chưa có lô hàng nào (stockQty == 0)
                    // Nếu đã có lô → cập nhật importUnit/pieces sẽ làm sai
                    // toRetailQty() tính ngược lịch sử nhập trong báo cáo tồn kho
                    String resolvedImportUnit = null;
                    String resolvedSellUnit   = null;
                    Integer resolvedPieces    = null;
                    boolean hasUnits = (excelImportUnit != null && !excelImportUnit.isBlank())
                            || (excelSellUnit != null && !excelSellUnit.isBlank())
                            || excelPieces != null;
                    if (hasUnits) {
                        boolean hasBatches = batchRepository.existsByProductId(product.getId());
                        if (hasBatches) {
                            warnings.add("⚠️ Dòng " + lineNum + ": SP '" + product.getCode()
                                + "' đã có lô hàng tồn kho → KHÔNG cập nhật importUnit/sellUnit/pieces "
                                + "để tránh sai lệch báo cáo tồn kho lịch sử. "
                                + "Nếu muốn thay đổi, hãy chỉnh sửa trực tiếp trong trang Sản phẩm.");
                        } else {
                            // SP chưa có lô → an toàn cập nhật
                            resolvedImportUnit = (excelImportUnit != null && !excelImportUnit.isBlank()) ? excelImportUnit.trim() : null;
                            resolvedSellUnit   = (excelSellUnit   != null && !excelSellUnit.isBlank())   ? excelSellUnit.trim()   : null;
                            resolvedPieces     = (excelPieces != null && excelPieces > 0) ? excelPieces : null;
                            warnings.add("ℹ️ Dòng " + lineNum + ": SP '" + product.getCode()
                                + "' chưa có lô → sẽ cập nhật đơn vị: importUnit="
                                + resolvedImportUnit + " sellUnit=" + resolvedSellUnit + " pieces=" + resolvedPieces);
                        }
                    }

                    validatedRows.add(new ValidatedRow(
                            product, null, null, null, null,
                            qty, cost, sellPrice, discountPct, isCombo, lineNum, lineNote,
                            resolvedImportUnit, resolvedSellUnit, resolvedPieces));

                    // ── Pass 1: Phát hiện conflict đơn vị quy đổi ────────────
                    // Nếu cùng mã SP xuất hiện 2 lần với cách quy đổi khác nhau
                    // (VD: 1kg→10hủ và 1kg→20gói) → đây là 2 loại sản phẩm
                    // khác nhau, phải dùng 2 mã SP riêng biệt.
                    if (!isCombo) {
                        // Lấy effective pieces để so sánh (ưu tiên excelPieces, fallback product default)
                        int effectivePieces = (excelPieces != null && excelPieces > 0)
                                ? excelPieces
                                : (product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1);
                        String effectiveUnit = (excelImportUnit != null && !excelImportUnit.isBlank())
                                ? excelImportUnit.trim().toLowerCase()
                                : (product.getImportUnit() != null ? product.getImportUnit().toLowerCase() : "");
                        String trackerKey   = product.getCode();
                        String trackerValue = effectiveUnit + "|" + effectivePieces;

                        if (pass1UnitTracker.containsKey(trackerKey)) {
                            String prevValue = pass1UnitTracker.get(trackerKey);
                            if (!trackerValue.equalsIgnoreCase(prevValue)) {
                                String[] prev = prevValue.split("\\|");
                                errors.add("❌ Dòng " + lineNum
                                    + ": SP '" + product.getCode() + " - " + product.getName()
                                    + "' xuất hiện 2 lần với cách quy đổi KHÁC NHAU:"
                                    + " lần trước [" + prev[0] + " → " + (prev.length > 1 ? prev[1] : "1") + " lẻ/ĐV],"
                                    + " lần này [" + effectiveUnit + " → " + effectivePieces + " lẻ/ĐV]."
                                    + " → Không thể gộp: 2 loại đóng gói cho ra ĐV bán khác nhau."
                                    + " Hãy dùng 2 mã SP riêng (VD: " + product.getCode() + "-A và " + product.getCode() + "-B).");
                            }
                            // Cùng unit+pieces: cho phép gộp, không cần thêm vào tracker
                        } else {
                            pass1UnitTracker.put(trackerKey, trackerValue);
                        }
                    }
                } else {
                    // SP chưa tồn tại → cần auto-create
                    if (name == null || name.isBlank()) {
                        errors.add("❌ Dòng " + lineNum + ": Không tìm thấy sản phẩm với mã '" + code
                                + "' và tên SP (cột B) để trống. "
                                + "→ Điền tên SP vào cột B, danh mục vào cột G, đơn vị vào cột H để tạo mới.");
                        continue;
                    }
                    String categoryName = getCellString(row, COL_CATEGORY);
                    if (categoryName == null || categoryName.isBlank()) {
                        // ── Logic 4: Không có danh mục → tìm danh mục có tên chứa trong tên SP ──
                        final String spName = name.trim().toLowerCase();
                        categoryName = categoryRepository.findAll().stream()
                                .filter(cat -> cat.getActive() != null && cat.getActive())
                                .filter(cat -> spName.contains(cat.getName().trim().toLowerCase()))
                                .map(cat -> cat.getName())
                                .findFirst()
                                .orElse(null);

                        if (categoryName == null) {
                            errors.add("❌ Dòng " + lineNum + ": Sản phẩm '" + name.trim()
                                    + "' chưa tồn tại và cột G (Danh mục) để trống. "
                                    + "Hệ thống cũng không tìm được danh mục phù hợp qua tên sản phẩm. "
                                    + "→ Điền tên danh mục vào cột G, hoặc đặt tên SP có chứa tên danh mục.");
                            continue;
                        }
                        warnings.add("Dòng " + lineNum + ": Danh mục tự động phát hiện từ tên SP '"
                                + name.trim() + "' → danh mục '" + categoryName + "'");
                    }
                    String unit = getCellString(row, COL_UNIT);
                    if (unit == null || unit.isBlank()) unit = "cái";

                    String generatedCode = (code != null && !code.isBlank())
                            ? code.trim().toUpperCase()
                            : null; // sẽ generate sau trong Pass 2

                    // Đơn vị quy đổi cho SP mới — đọc từ cột J, K, L
                    String newImportUnit = (excelImportUnit != null && !excelImportUnit.isBlank()) ? excelImportUnit.trim() : null;
                    String newSellUnit   = (excelSellUnit   != null && !excelSellUnit.isBlank())   ? excelSellUnit.trim()   : null;
                    Integer newPieces    = (excelPieces != null && excelPieces > 0)               ? excelPieces            : null;

                    validatedRows.add(new ValidatedRow(
                            null, name.trim(), categoryName.trim(), unit.trim(), generatedCode,
                            qty, cost, sellPrice, discountPct, false, lineNum, lineNote,
                            newImportUnit, newSellUnit, newPieces));
                }
            }

            if (dataRowCount == 0) {
                throw new ExcelImportValidationException(
                        List.of("File Excel không có dòng dữ liệu nào. Hãy điền từ dòng " + (startRow + 1) + " trở đi."));
            }
        }

        // ── Nếu có BẤT KỲ lỗi nào → ném exception, KHÔNG ghi DB ─────────
        if (!errors.isEmpty()) {
            log.warn("Validate Excel thất bại: {} lỗi", errors.size());
            throw new ExcelImportValidationException(errors);
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 2 — File hợp lệ 100% → ghi DB
        // ════════════════════════════════════════════════════════════════════
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGenerator.nextReceiptNo());
        receipt.setSupplierName(supplierName);
        receipt.setNote(note);
        receipt.setReceiptDate(LocalDateTime.now());
        receipt.setShippingFee(shippingFee);

        String currentUser = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepository.findByUsername(currentUser).ifPresent(receipt::setCreatedBy);

        InventoryReceipt savedReceipt = receiptRepository.save(receipt);

        int successItems = 0;
        int newProducts  = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        Map<Long, InventoryReceiptItem> itemMap = new LinkedHashMap<>();
        Map<Long, BigDecimal> discountedLineTotals = new LinkedHashMap<>();
        // ── Track unit+pieces của lần đầu gặp SP để phát hiện conflict ──────
        // Key = productId, Value = "resolvedImportUnit|pieces"
        Map<Long, String> unitSnapshotPerProduct = new LinkedHashMap<>();
        List<String> pass2Errors = new ArrayList<>();

        for (ValidatedRow vr : validatedRows) {
            Product product;

            if (vr.product() != null) {
                product = vr.product();
            } else {
                // Auto-create SP mới
                final String catName = vr.newCategoryName();
                Category category = categoryRepository.findByNameIgnoreCase(catName)
                        .orElseGet(() -> {
                            Category c = new Category();
                            c.setName(catName);
                            c.setActive(true);
                            c.setCreatedAt(LocalDateTime.now());
                            c.setUpdatedAt(LocalDateTime.now());
                            return categoryRepository.save(c);
                        });
                String resolvedCode = vr.newCode() != null
                        ? vr.newCode()
                        : productService.generateProductCode(category);
                Product np = new Product();
                np.setCode(resolvedCode);
                np.setName(vr.newProductName());
                np.setCategory(category);
                np.setUnit(vr.newUnit());
                np.setSellUnit(vr.newUnit());
                np.setCostPrice(vr.cost());
                // Giá bán: lấy từ excel nếu có, ngược lại để bằng giá nhập
                np.setSellPrice(vr.sellPrice() != null && vr.sellPrice().compareTo(BigDecimal.ZERO) > 0
                        ? vr.sellPrice() : vr.cost());
                np.setStockQty(0);
                np.setActive(true);
                // ── Đơn vị quy đổi từ cột J, K, L (SP mới) ──────────────────
                if (vr.importUnit() != null) np.setImportUnit(vr.importUnit());
                if (vr.sellUnit() != null)   np.setSellUnit(vr.sellUnit());
                np.setPiecesPerImportUnit(vr.piecesPerImportUnit() != null ? vr.piecesPerImportUnit() : 1);
                np.setCreatedAt(LocalDateTime.now());
                np.setUpdatedAt(LocalDateTime.now());
                // saveAndFlush: đảm bảo Hibernate assign đúng ID mới trước khi tạo variant
                product = productRepository.saveAndFlush(np);
                newProducts++;

                // [Sprint 0] Tự tạo default variant cho SP mới (sau saveAndFlush đã có ID chính xác)
                variantService.createDefaultVariantFromProduct(product);

                // [BƯỚC 2] Tạo bản ghi product_import_units cho SP mới
                if (vr.importUnit() != null && !vr.importUnit().isBlank()) {
                    ProductImportUnit piu = new ProductImportUnit();
                    piu.setProduct(product);
                    piu.setImportUnit(vr.importUnit().trim());
                    piu.setSellUnit(vr.sellUnit() != null ? vr.sellUnit().trim()
                            : (np.getSellUnit() != null ? np.getSellUnit() : np.getUnit()));
                    piu.setPiecesPerUnit(np.getPiecesPerImportUnit() != null ? np.getPiecesPerImportUnit() : 1);
                    piu.setIsDefault(true);
                    piu.setNote("1 " + vr.importUnit().trim() + " = " + piu.getPiecesPerUnit()
                            + " " + piu.getSellUnit());
                    importUnitRepo.save(piu);
                } else if (np.getImportUnit() != null) {
                    // Tạo bản ghi mặc định từ product.importUnit
                    ProductImportUnit piu = new ProductImportUnit();
                    piu.setProduct(product);
                    piu.setImportUnit(np.getImportUnit());
                    piu.setSellUnit(np.getSellUnit() != null ? np.getSellUnit() : np.getUnit());
                    piu.setPiecesPerUnit(np.getPiecesPerImportUnit() != null ? np.getPiecesPerImportUnit() : 1);
                    piu.setIsDefault(true);
                    importUnitRepo.save(piu);
                }

                warnings.add("Dòng " + vr.lineNum() + ": Tạo SP mới '" + resolvedCode + "' - " + vr.newProductName()
                    + (vr.importUnit() != null ? " [ĐVnhập=" + vr.importUnit() + ", pieces=" + np.getPiecesPerImportUnit() + "]" : ""));
            }

            // ── Cập nhật giá bán nếu excel có giá bán mới (SP đã tồn tại) ─────
            if (vr.product() != null && vr.sellPrice() != null && vr.sellPrice().compareTo(BigDecimal.ZERO) > 0) {
                product.setSellPrice(vr.sellPrice());
                product.setUpdatedAt(LocalDateTime.now());
                productRepository.save(product);
                warnings.add("Dòng " + vr.lineNum() + ": Cập nhật giá bán SP '"
                        + product.getCode() + "' → " + vr.sellPrice().toPlainString() + " ₫");
            }

            // ── Cập nhật importUnit / sellUnit / piecesPerImportUnit (SP đã tồn tại, chưa có lô) ──
            // ValidatedRow chỉ chứa giá trị non-null khi đã check an toàn ở Pass 1
            if (vr.product() != null && (vr.importUnit() != null || vr.sellUnit() != null || vr.piecesPerImportUnit() != null)) {
                if (vr.importUnit() != null)        product.setImportUnit(vr.importUnit());
                if (vr.sellUnit() != null)          product.setSellUnit(vr.sellUnit());
                if (vr.piecesPerImportUnit() != null) product.setPiecesPerImportUnit(vr.piecesPerImportUnit());
                product.setUpdatedAt(LocalDateTime.now());
                productRepository.save(product);
            }

            // ── Nếu là COMBO → expand thành các thành phần ──────────────────
            if (vr.isCombo()) {
                List<ProductComboItem> comboComponents = comboItemRepo.findByComboProduct(product);
                if (comboComponents.isEmpty()) {
                    warnings.add("⚠️ Dòng " + vr.lineNum() + ": Combo '" + product.getCode() + "' không có thành phần → bỏ qua");
                    continue;
                }
                int totalComponentQty = comboComponents.stream().mapToInt(ProductComboItem::getQuantity).sum();
                BigDecimal totalComboCost = vr.cost().multiply(BigDecimal.valueOf(vr.qty()));

                for (ProductComboItem ci : comboComponents) {
                    Product comp = ci.getProduct();
                    BigDecimal ratio = totalComponentQty > 0
                            ? BigDecimal.valueOf(ci.getQuantity())
                              .divide(BigDecimal.valueOf(totalComponentQty), 10, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    BigDecimal compCost = totalComboCost.multiply(ratio)
                            .divide(BigDecimal.valueOf(vr.qty()), 2, RoundingMode.HALF_UP);
                    int compQty = ci.getQuantity() * vr.qty();

                    processItem(comp, compQty, compCost, vr.discountPct(),
                            savedReceipt, itemMap, discountedLineTotals, warnings);
                    totalAmount = totalAmount.add(compCost.multiply(BigDecimal.valueOf(vr.qty())));
                }
                successItems++;
                warnings.add("ℹ️ Dòng " + vr.lineNum() + ": Combo '" + product.getCode()
                        + "' expanded → " + comboComponents.size() + " SP thành phần");
                continue;
            }

            // ── SP đơn lẻ bình thường ────────────────────────────────────────
            // [BƯỚC 1+2] Resolve pieces theo thứ tự ưu tiên:
            //   1. Cột J+L trong Excel (vr.importUnit + vr.piecesPerImportUnit)
            //   2. Lookup product_import_units theo ĐV nhập từ Excel (Bước 2)
            //   3. Default của SP trong product_import_units (is_default=TRUE)
            //   4. Fallback legacy: product.importUnit + product.piecesPerImportUnit
            String resolvedImportUnit;
            int pieces;

            if (vr.importUnit() != null && !vr.importUnit().isBlank()) {
                // Excel điền cột J → lookup Bước 2
                String excelUnit = vr.importUnit().trim();
                var piu = importUnitRepo.findByProductIdAndImportUnitIgnoreCase(product.getId(), excelUnit);
                if (piu.isPresent()) {
                    // Ưu tiên pieces từ cột L nếu có, ngược lại dùng gợi ý từ DB
                    pieces = (vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0)
                            ? vr.piecesPerImportUnit()
                            : piu.get().getPiecesPerUnit();
                    if (vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0
                            && !vr.piecesPerImportUnit().equals(piu.get().getPiecesPerUnit())) {
                        warnings.add("Dòng " + vr.lineNum() + ": SP '" + product.getCode()
                            + "' ĐV '" + excelUnit + "' gợi ý " + piu.get().getPiecesPerUnit()
                            + " lẻ/ĐV nhưng Excel ghi đè " + pieces + " → dùng " + pieces + " (snapshot)");
                    }
                } else {
                    // ĐV chưa đăng ký → dùng pieces từ cột L hoặc fallback legacy
                    pieces = (vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0)
                            ? vr.piecesPerImportUnit()
                            : UnitConverter.effectivePieces(excelUnit, product.getPiecesPerImportUnit());
                    warnings.add("Dòng " + vr.lineNum() + ": SP '" + product.getCode()
                        + "' ĐV '" + excelUnit + "' chưa đăng ký trong product_import_units"
                        + " → dùng pieces=" + pieces + ". Vào trang SP để đăng ký chính thức.");
                }
                resolvedImportUnit = excelUnit;
            } else {
                // Excel không điền ĐV → dùng default của SP
                var defaultPiu = importUnitRepo.findByProductIdAndIsDefaultTrue(product.getId());
                if (defaultPiu.isPresent()) {
                    pieces = (vr.piecesPerImportUnit() != null && vr.piecesPerImportUnit() > 0)
                            ? vr.piecesPerImportUnit()
                            : defaultPiu.get().getPiecesPerUnit();
                    resolvedImportUnit = defaultPiu.get().getImportUnit();
                } else {
                    // Fallback legacy hoàn toàn
                    pieces = UnitConverter.effectivePieces(product.getImportUnit(), product.getPiecesPerImportUnit());
                    resolvedImportUnit = product.getImportUnit() != null ? product.getImportUnit() : "bich";
                }
            }

            // [BƯỚC 1] Dùng API mới của UnitConverter — pieces là source of truth
            int addedRetailQty = UnitConverter.toRetailQty(pieces, vr.qty());
            BigDecimal costPerUnit = UnitConverter.costPerRetailUnit(vr.cost(), pieces);

            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    vr.discountPct().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal discountedCostPerUnit = costPerUnit.multiply(discountFactor)
                    .setScale(2, RoundingMode.HALF_UP);

            // ── discountedLineTotal dùng để phân bổ ship/VAT ────────────────
            // Tính từ unitCost × qty (giá nhập gốc × số lượng nhập) để tránh mất
            // phần lẻ khi chia pieces rồi nhân lại. Đây là số tiền thực trả NCC.
            // ship/VAT = totalFee × (discountedLineTotal / sum(discountedLineTotal))
            // → mỗi SP chịu phần ship/VAT tương ứng với tỷ trọng tiền hàng của nó.
            BigDecimal discountedLineTotal = vr.cost()
                    .multiply(discountFactor)
                    .multiply(BigDecimal.valueOf(vr.qty()))
                    .setScale(4, RoundingMode.HALF_UP);
            totalAmount = totalAmount.add(vr.cost().multiply(BigDecimal.valueOf(vr.qty())));

            if (itemMap.containsKey(product.getId())) {
                // ── SP đã có trong phiếu này → kiểm tra conflict ─────────────
                String firstSnapshot = unitSnapshotPerProduct.get(product.getId());
                String thisSnapshot  = resolvedImportUnit + "|" + pieces;

                if (!thisSnapshot.equalsIgnoreCase(firstSnapshot)) {
                    // Khác unit hoặc khác pieces → KHÔNG THỂ GỘP
                    // Đây là 2 loại đóng gói khác nhau (VD: hủ 100g vs gói 50g)
                    // → phải dùng 2 mã SP riêng biệt
                    String[] firstParts = firstSnapshot.split("\\|");
                    String firstUnit   = firstParts[0];
                    int    firstPieces = firstParts.length > 1 ? Integer.parseInt(firstParts[1]) : 1;
                    pass2Errors.add("❌ Dòng " + vr.lineNum()
                        + ": SP '" + product.getCode() + " - " + product.getName()
                        + "' xuất hiện 2 lần với cách quy đổi KHÁC NHAU:\n"
                        + "    • Lần trước: " + firstUnit + " → " + firstPieces + " " + (product.getSellUnit() != null ? product.getSellUnit() : "lẻ") + "/ĐV\n"
                        + "    • Lần này:   " + resolvedImportUnit + " → " + pieces + " " + (product.getSellUnit() != null ? product.getSellUnit() : "lẻ") + "/ĐV\n"
                        + "    → Không thể gộp: 2 loại đóng gói cho ra đơn vị bán khác nhau.\n"
                        + "    → Giải pháp: Tạo 2 mã SP riêng (VD: " + product.getCode() + "-A và " + product.getCode() + "-B).");
                } else {
                    // Cùng unit + cùng pieces → GỘP an toàn
                    InventoryReceiptItem existing = itemMap.get(product.getId());
                    existing.setQuantity(existing.getQuantity() + vr.qty());
                    existing.setRetailQtyAdded(existing.getRetailQtyAdded() + addedRetailQty);
                    discountedLineTotals.merge(product.getId(), discountedLineTotal, BigDecimal::add);
                    warnings.add("ℹ️ Dòng " + vr.lineNum() + ": SP '" + product.getCode()
                        + "' trùng — cùng ĐV [" + resolvedImportUnit + "×" + pieces + "] → gộp số lượng");
                }
            } else {
                InventoryReceiptItem item = new InventoryReceiptItem();
                item.setReceipt(savedReceipt);
                item.setProduct(product);
                item.setQuantity(vr.qty());
                item.setUnitCost(vr.cost());
                item.setDiscountPercent(vr.discountPct());
                item.setDiscountedCost(discountedCostPerUnit);
                item.setVatPercent(vatPercent);
                item.setVatAllocated(BigDecimal.ZERO);
                item.setShippingAllocated(BigDecimal.ZERO);
                item.setFinalCost(discountedCostPerUnit);
                item.setFinalCostWithVat(discountedCostPerUnit);
                // [BƯỚC 1] Snapshot bất biến — source of truth cho tồn kho + báo cáo
                item.setImportUnitUsed(resolvedImportUnit);
                item.setPiecesUsed(pieces);
                item.setRetailQtyAdded(addedRetailQty);
                itemMap.put(product.getId(), item);
                discountedLineTotals.put(product.getId(), discountedLineTotal);
                // Ghi lại unit+pieces để phát hiện conflict nếu SP xuất hiện lần 2
                unitSnapshotPerProduct.put(product.getId(), resolvedImportUnit + "|" + pieces);
            }

            // [Sprint 0] Resolve default variant — auto-create nếu chưa có
            ProductVariant variant = variantRepo.findByProductIdAndIsDefaultTrue(product.getId())
                    .orElseGet(() -> variantService.createDefaultVariantFromProduct(product));

            // Gắn variant vào receipt item
            InventoryReceiptItem currentItem = itemMap.get(product.getId());
            if (currentItem != null && currentItem.getVariant() == null) {
                currentItem.setVariant(variant);
            }

            // Tạo Batch tạm — import_qty = retailQty đã quy đổi đúng
            LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                    ? LocalDate.now().plusDays(product.getExpiryDays()) : LocalDate.now().plusYears(10);
            String batchCode = buildUniqueBatchCode(savedReceipt.getReceiptNo(), product.getCode());
            ProductBatch batch = new ProductBatch();
            batch.setProduct(product);
            batch.setVariant(variant); // [Sprint 0]
            batch.setReceipt(savedReceipt);
            batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
            batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
            batch.setCostPrice(discountedCostPerUnit);
            batchRepository.save(batch);

            // [Sprint 0] Cập nhật variant.stockQty
            variant.setStockQty(variant.getStockQty() + addedRetailQty);
            variant.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(variant);

            product.setStockQty(product.getStockQty() + addedRetailQty);
            product.setUpdatedAt(LocalDateTime.now());
            productRepository.save(product);
            successItems++;
        }

        // ── Nếu có lỗi conflict đơn vị → rollback toàn bộ phiếu ────────────
        // Phải throw SAU vòng lặp (không throw bên trong) để có đủ thông tin
        // về tất cả các dòng bị conflict trước khi báo lỗi.
        if (!pass2Errors.isEmpty()) {
            log.warn("Pass 2 phát hiện {} conflict đơn vị quy đổi — rollback", pass2Errors.size());
            throw new ExcelImportValidationException(pass2Errors);
        }

        // ── Phân bổ shippingFee + VAT toàn đơn → finalCostWithVat ───────────
        final BigDecimal finalShippingFee = shippingFee;
        // Tổng VAT toàn đơn = tổng discountedValue × vatPercent%
        BigDecimal totalDiscountedValue = discountedLineTotals.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalVatAmount = totalDiscountedValue
                .multiply(vatPercent.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP))
                .setScale(2, RoundingMode.HALF_UP);

        for (Map.Entry<Long, InventoryReceiptItem> entry : itemMap.entrySet()) {
            Long productId = entry.getKey();
            InventoryReceiptItem item = entry.getValue();
            BigDecimal discountedLineTotal = discountedLineTotals.getOrDefault(productId, BigDecimal.ZERO);

            // [BƯỚC 1] Dùng retailQtyAdded từ snapshot — không tính lại từ product.*
            int retailQty = item.getRetailQtyAdded() != null && item.getRetailQtyAdded() > 0
                    ? item.getRetailQtyAdded()
                    : item.getQuantity(); // fallback nếu snapshot chưa set

            Product product = productRepository.findById(productId).orElseThrow();

            // Phân bổ ship
            BigDecimal shippingForLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                shippingForLine = finalShippingFee
                        .multiply(discountedLineTotal)
                        .divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal shippingPerUnit = retailQty > 0
                    ? shippingForLine.divide(BigDecimal.valueOf(retailQty), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            // Phân bổ VAT toàn đơn theo tỷ lệ
            BigDecimal vatForLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                vatForLine = totalVatAmount
                        .multiply(discountedLineTotal)
                        .divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal vatPerUnit = retailQty > 0
                    ? vatForLine.divide(BigDecimal.valueOf(retailQty), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            BigDecimal finalCostBeforeVat = item.getDiscountedCost().add(shippingPerUnit).setScale(2, RoundingMode.HALF_UP);
            BigDecimal finalCostWithVat   = finalCostBeforeVat.add(vatPerUnit).setScale(2, RoundingMode.HALF_UP);

            item.setShippingAllocated(shippingPerUnit);
            item.setVatAllocated(vatPerUnit);
            item.setFinalCost(finalCostBeforeVat);
            item.setFinalCostWithVat(finalCostWithVat);

            product.setCostPrice(finalCostWithVat);
            product.setUpdatedAt(LocalDateTime.now());
            productRepository.save(product);

            // [Sprint 0] Cập nhật variant.costPrice sau khi có finalCostWithVat
            if (item.getVariant() != null) {
                item.getVariant().setCostPrice(finalCostWithVat);
                item.getVariant().setUpdatedAt(LocalDateTime.now());
                variantRepo.save(item.getVariant());
                // Cập nhật batch theo variant_id
                Long vid = item.getVariant().getId();
                batchRepository.findByReceiptIdAndVariantId(savedReceipt.getId(), vid).forEach(b -> {
                    b.setCostPrice(finalCostWithVat);
                    batchRepository.save(b);
                });
            } else {
                batchRepository.findByReceiptAndProduct(savedReceipt, product).forEach(b -> {
                    b.setCostPrice(finalCostWithVat);
                    batchRepository.save(b);
                });
            }
        }

        savedReceipt.setTotalAmount(totalAmount);
        savedReceipt.setTotalVat(totalVatAmount);
        savedReceipt.getItems().addAll(itemMap.values());
        receiptRepository.save(savedReceipt);

        log.info("Import thành công: phiếu {} — {} SP ({} mới)", savedReceipt.getReceiptNo(), successItems, newProducts);
        return new ExcelReceiptResult(
                savedReceipt.getReceiptNo(), supplierName,
                validatedRows.size(), successItems, 0, 0,
                newProducts, totalAmount, errors, warnings);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Xử lý 1 SP đơn lẻ: tính discountedCost, tạo/gộp ReceiptItem, tạo Batch tạm.
     * Dùng chung cho SP bình thường và combo expand.
     */
    private void processItem(Product product, int qty, BigDecimal unitCost, BigDecimal discountPct,
                             InventoryReceipt receipt,
                             Map<Long, InventoryReceiptItem> itemMap,
                             Map<Long, BigDecimal> discountedLineTotals,
                             List<String> warnings) {
        // Combo components: dùng default pieces từ product (combo expand không có ĐV riêng)
        int pieces = UnitConverter.effectivePieces(product.getImportUnit(), product.getPiecesPerImportUnit());
        String importUnitUsed = product.getImportUnit() != null ? product.getImportUnit() : "bich";

        int addedRetailQty = UnitConverter.toRetailQty(pieces, qty);
        BigDecimal costPerRetailUnit = UnitConverter.costPerRetailUnit(unitCost, pieces);

        BigDecimal discountFactor = BigDecimal.ONE.subtract(
                discountPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
        BigDecimal discountedCostPerUnit = costPerRetailUnit.multiply(discountFactor)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal discountedLineTotal = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));

        if (itemMap.containsKey(product.getId())) {
            InventoryReceiptItem existing = itemMap.get(product.getId());
            existing.setQuantity(existing.getQuantity() + qty);
            if (existing.getRetailQtyAdded() != null)
                existing.setRetailQtyAdded(existing.getRetailQtyAdded() + addedRetailQty);
            discountedLineTotals.merge(product.getId(), discountedLineTotal, BigDecimal::add);
            warnings.add("SP '" + product.getCode() + "' xuất hiện nhiều lần → gộp số lượng");
        } else {
            InventoryReceiptItem item = new InventoryReceiptItem();
            item.setReceipt(receipt);
            item.setProduct(product);
            item.setQuantity(qty);
            item.setUnitCost(unitCost);
            item.setDiscountPercent(discountPct);
            item.setDiscountedCost(discountedCostPerUnit);
            item.setVatPercent(BigDecimal.ZERO);
            item.setVatAllocated(BigDecimal.ZERO);
            item.setShippingAllocated(BigDecimal.ZERO);
            item.setFinalCost(discountedCostPerUnit);
            item.setFinalCostWithVat(discountedCostPerUnit);
            // Snapshot cho combo component
            item.setImportUnitUsed(importUnitUsed);
            item.setPiecesUsed(pieces);
            item.setRetailQtyAdded(addedRetailQty);
            itemMap.put(product.getId(), item);
            discountedLineTotals.put(product.getId(), discountedLineTotal);
        }

        LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                ? LocalDate.now().plusDays(product.getExpiryDays()) : LocalDate.now().plusYears(10);
        String batchCode = buildUniqueBatchCode(receipt.getReceiptNo(), product.getCode());

        // [Sprint 0] Resolve default variant — auto-create nếu chưa có
        ProductVariant variant = variantRepo.findByProductIdAndIsDefaultTrue(product.getId())
                .orElseGet(() -> variantService.createDefaultVariantFromProduct(product));

        ProductBatch batch = new ProductBatch();
        batch.setProduct(product);
        batch.setVariant(variant); // [Sprint 0]
        batch.setReceipt(receipt);
        batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
        batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
        batch.setCostPrice(discountedCostPerUnit);
        batchRepository.save(batch);

        // [Sprint 0] Cập nhật variant.stockQty + costPrice
        variant.setStockQty(variant.getStockQty() + addedRetailQty);
        variant.setCostPrice(discountedCostPerUnit);
        variant.setUpdatedAt(LocalDateTime.now());
        variantRepo.save(variant);

        // Gắn variant vào receipt item nếu chưa có
        InventoryReceiptItem existing2 = itemMap.get(product.getId());
        if (existing2 != null && existing2.getVariant() == null) {
            existing2.setVariant(variant);
        }

        product.setStockQty(product.getStockQty() + addedRetailQty);
        product.setUpdatedAt(LocalDateTime.now());
        productRepository.save(product);
    }

    /** Tìm row data đầu tiên — template cố định 3 dòng header nên mặc định index 3.
     *  Fallback detect bằng cột C (số lượng) phải là số > 0. */
    private int findDataStartRow(Sheet sheet) {
        // Template cố định: Row 0=Title, Row 1=Subtitle, Row 2=Header → data từ Row 3
        Row row3 = sheet.getRow(3);
        if (row3 != null) {
            String colC = getCellString(row3, COL_QUANTITY);
            if (colC != null && !colC.isBlank()) {
                try { if (Double.parseDouble(colC.replace(",", "")) > 0) return 3; } catch (NumberFormatException ignored) {}
            }
            // Row 3 có tên SP (cột B) không phải header → cũng dùng
            String colB = getCellString(row3, COL_NAME);
            if (colB != null && !colB.isBlank() && !isHeaderText(colB)) return 3;
        }
        // Fallback: tìm dòng đầu tiên có cột C là số > 0
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String colC = getCellString(row, COL_QUANTITY);
            if (colC != null && !colC.isBlank()) {
                try { if (Double.parseDouble(colC.replace(",", "")) > 0) return i; } catch (NumberFormatException ignored) {}
            }
        }
        return 3; // default: skip 3 dòng header
    }

    private boolean isHeaderText(String val) {
        if (val == null) return false;
        String l = val.trim().toLowerCase();
        return l.equals("ten sp") || l.equals("tên sp") || l.equals("name") || l.equals("ten san pham")
                || l.startsWith("template") || l.startsWith("nha dan") || l.startsWith("nhà đan")
                || l.startsWith("huong dan") || l.startsWith("do tim")
                || l.equals("b: ten sp") || l.equals("ma sp") || l.equals("a: ma sp");
    }

    private boolean isValidCode(String val) {
        if (val == null || val.isBlank() || val.length() > 50) return false;
        if (val.contains("*") || val.contains("¶") || val.contains("\n")
                || val.contains("(") || val.contains("/")) return false;
        String lower = val.trim().toLowerCase();
        // Lọc các header phổ biến
        return !lower.equals("code") && !lower.equals("ma") && !lower.equals("stt")
                && !lower.equals("ma sp") && !lower.equals("mã sp") && !lower.equals("ma san pham")
                && !lower.equals("ten sp") && !lower.equals("tên sp") && !lower.equals("product")
                && !lower.startsWith("phiếu") && !lower.startsWith("api:")
                && !lower.startsWith("nhà dân") && !lower.startsWith("nha dan")
                && !lower.startsWith("header") && !lower.startsWith("sheet");
    }

    private String buildUniqueBatchCode(String receiptNo, String productCode) {
        String base = "BATCH-" + receiptNo + "-" + productCode;
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

    private boolean isRowEmpty(Row row) {
        for (int c = COL_CODE; c <= COL_COST; c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String val = getCellString(row, c);
                if (val != null && !val.isBlank()) return false;
            }
        }
        return true;
    }

    /**
     * Kiểm tra dòng chú thích / legend trong template (ví dụ: "Mau xanh la = SP da co san pham").
     * Các dòng này có cột A hoặc B bắt đầu bằng từ khóa legend → bỏ qua.
     */
    private boolean isLegendRow(Row row) {
        String colA = getCellString(row, COL_CODE);
        String colB = getCellString(row, COL_NAME);
        for (String val : new String[]{colA, colB}) {
            if (val == null) continue;
            String l = val.trim().toLowerCase();
            if (l.startsWith("mau xanh") || l.startsWith("màu xanh")
                    || l.startsWith("mau vang") || l.startsWith("màu vàng")
                    || l.startsWith("legend") || l.startsWith("chu thich")
                    || l.startsWith("chú thích") || l.startsWith("ghi chu mau")) return true;
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

    /** Alias cho cột optional (pieces, v.v.) — trả về null nếu trống/lỗi */
    private Integer getCellIntOptional(Row row, int col) {
        return getCellInt(row, col);
    }

    /** Kết quả tìm SP: ambiguous=true khi nhiều SP khớp tên, cần admin nhập mã */
    private record FindResult(Optional<Product> product, boolean isAmbiguous) {
        static FindResult found(Product p) { return new FindResult(Optional.of(p), false); }
        static FindResult notFound()       { return new FindResult(Optional.empty(), false); }
        static FindResult ambiguous()      { return new FindResult(Optional.empty(), true); }
    }

    /**
     * Tìm sản phẩm theo 3 tầng ưu tiên:
     *  1. Mã SP (code)        — chính xác tuyệt đối
     *  2. Tên chính xác       — exact match, ignore case
     *  3. Tên chứa chuỗi     — containing:
     *       1 kết quả  → dùng + warning
     *      >1 kết quả  → ambiguous → caller skip dòng, add error yêu cầu nhập mã
     *       0 kết quả  → notFound → caller auto-create SP mới
     */
    private FindResult findProduct(String code, String name,
                                   int lineNum, List<String> errors, List<String> warnings) {
        // Tầng 1: MÃ SP — chính xác tuyệt đối
        if (code != null && !code.isBlank()) {
            Optional<Product> byCode = productRepository.findByCode(code.trim().toUpperCase());
            if (byCode.isPresent()) {
                log.debug("Dòng {}: match mã '{}'", lineNum, code.trim());
                return FindResult.found(byCode.get());
            }
            warnings.add("Dòng " + lineNum + ": Không tìm thấy mã '" + code.trim()
                    + "' → thử tìm theo tên SP (cột B)");
        }

        if (name == null || name.isBlank()) return FindResult.notFound();

        // Tầng 2: TÊN CHÍNH XÁC — exact, ignore case (dùng list để tránh NonUniqueResultException)
        List<Product> exactMatches = productRepository.findByNameContainingIgnoreCase(name.trim())
                .stream()
                .filter(p -> p.getName().equalsIgnoreCase(name.trim()))
                .toList();
        if (!exactMatches.isEmpty()) {
            Product p = exactMatches.get(0);
            if (exactMatches.size() > 1) {
                warnings.add("Dòng " + lineNum + ": Tên '" + name.trim() + "' khớp "
                        + exactMatches.size() + " SP exact → chọn [" + p.getCode() + "] " + p.getName());
            } else {
                warnings.add("Dòng " + lineNum + ": Không có mã → khớp tên chính xác '"
                        + name.trim() + "' → [" + p.getCode() + "] " + p.getName());
            }
            log.info("Dòng {}: exact name '{}' → [{}]", lineNum, name.trim(), p.getCode());
            return FindResult.found(p);
        }

        // Tầng 3: TÊN CHỨA CHUỖI — fallback thận trọng
        List<Product> candidates = productRepository.findByNameContainingIgnoreCase(name.trim());

        if (candidates.isEmpty()) return FindResult.notFound();

        if (candidates.size() == 1) {
            Product p = candidates.get(0);
            warnings.add("Dòng " + lineNum + ": Tìm gần đúng '" + name.trim()
                    + "' → [" + p.getCode() + "] " + p.getName() + " (1 kết quả, tự chọn)");
            log.info("Dòng {}: containing '{}' → [{}]", lineNum, name.trim(), p.getCode());
            return FindResult.found(p);
        }

        // Nhiều kết quả → AMBIGUOUS
        String list = candidates.stream().limit(5)
                .map(p -> "[" + p.getCode() + "] " + p.getName())
                .collect(Collectors.joining(" | "));
        errors.add("Dòng " + lineNum + ": Tên '" + name.trim() + "' khớp "
                + candidates.size() + " SP: " + list
                + (candidates.size() > 5 ? " ..." : "")
                + " → Vui lòng nhập MÃ SP (cột A) để chọn đúng");
        log.warn("Dòng {}: ambiguous '{}' → {} results", lineNum, name.trim(), candidates.size());
        return FindResult.ambiguous();
    }

    /**
     * Dữ liệu 1 dòng Excel đã được validate — dùng trong Pass 1 → Pass 2.
     * product = null nghĩa là SP chưa tồn tại, cần tạo mới trong Pass 2.
     *
     * importUnit / sellUnit / pieces: chỉ áp dụng cho SP mới HOẶC SP cũ chưa có lô hàng nào.
     * Nếu SP cũ đã có lô → bỏ qua để tránh làm sai tính toán tồn kho lịch sử.
     */
    private record ValidatedRow(
            Product product,           // SP tìm được (null nếu cần auto-create)
            String newProductName,
            String newCategoryName,
            String newUnit,
            String newCode,
            int qty,
            BigDecimal cost,
            BigDecimal sellPrice,      // Giá bán mới (null = không cập nhật)
            BigDecimal discountPct,
            boolean isCombo,
            int lineNum,
            String lineNote,
            // 3 trường mới — quy đổi đơn vị
            String importUnit,         // null = không cập nhật (SP cũ đã có lô)
            String sellUnit,           // null = không cập nhật
            Integer piecesPerImportUnit // null = không cập nhật
    ) {}
}
