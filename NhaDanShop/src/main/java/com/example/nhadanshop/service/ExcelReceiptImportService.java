package com.example.nhadanshop.service;

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
 * Service nhập phiếu nhập kho từ file Excel.
 *
 * Cấu trúc file Excel (row 1 = header, dữ liệu từ row 2):
 * ┌────────────┬────────────┬───────────────┬───────────────────┬───────────────┐
 * │ A: code   │ B: name   │ C: quantity   │ D: unitCost       │ E: note(opt)  │
 * │ (mã SP)   │ (tên SP)  │ (SL đơn vị   │ (giá/1 đơn vị     │ (ghi chú dòng)│
 * │           │ (lookup)  │  NHẬP: kg/xâu│  NHẬP: kg/xâu/hộp│               │
 * └────────────┴────────────┴───────────────┴───────────────────┴───────────────┘
 *
 * ❌ KHÔNG điền:
 *  - quantity theo đơn vị bán lẻ (bịch) — dùng đơn vị nhập (kg/xâu/hộp/chai/bịch)
 *  - unitCost theo bịch — dùng giá theo đơn vị nhập
 *
 * Ví dụ đúng từ hình:
 *  BT006 | BT Rong bien | 1 | 65000 | (1 kg, 65000/kg → hệ thống tự tính +10 bịch)
 *  BT019 | BT Cuon tep  | 2 | 38000 | (2 hộp = ATOMIC → +2 hộp)
 *  CC010 | Com Chay c.. | 5 | 125000| (5 xâu, 125000/xâu, pieces=5 → +25 bịch)
 *
 * Tìm sản phẩm theo: code (cột A) hoặc name (cột B), ưu tiên code.
 *
 * Một file Excel = Một phiếu nhập kho.
 * Metadata phiếu (supplierName, note) nhập qua param API.
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
    private final CategoryRepository categoryRepository;   // ← thêm để auto-create product
    private final ProductService productService;           // ← thêm để generate code

    // Column indices
    private static final int COL_CODE     = 0; // Mã SP (lookup key)
    private static final int COL_NAME     = 1; // Tên SP (fallback lookup)
    private static final int COL_QUANTITY = 2; // Số lượng đơn vị NHẬP
    private static final int COL_COST     = 3; // Giá / 1 đơn vị NHẬP
    private static final int COL_NOTE     = 4; // Ghi chú (optional)
    // Cột mở rộng cho auto-create product (optional)
    private static final int COL_CATEGORY = 5; // Tên danh mục (optional — dùng khi tạo SP mới)
    private static final int COL_UNIT     = 6; // Đơn vị bán lẻ (optional — dùng khi tạo SP mới)

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
     * Import phiếu nhập kho từ file Excel.
     *
     * @param file         file .xlsx
     * @param supplierName tên nhà cung cấp
     * @param note         ghi chú phiếu nhập
     * @return kết quả import kèm receiptNo nếu thành công
     */
    @Transactional
    public ExcelReceiptResult importReceiptFromExcel(
            MultipartFile file, String supplierName, String note) throws IOException {

        validateFile(file);

        List<String> errors   = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // ── Tạo phiếu nhập ────────────────────────────────────────────────────
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGenerator.nextReceiptNo());
        receipt.setSupplierName(supplierName);
        receipt.setNote(note);
        receipt.setReceiptDate(LocalDateTime.now());

        String currentUser = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepository.findByUsername(currentUser).ifPresent(receipt::setCreatedBy);

        InventoryReceipt savedReceipt = receiptRepository.save(receipt);

        // ── Đọc Excel ─────────────────────────────────────────────────────────
        int totalRows    = 0;
        int successItems = 0;
        int skippedItems = 0;
        int errorItems   = 0;
        int newProducts  = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        // Dùng Map để gom dòng trùng product trong 1 phiếu (tránh unique constraint violation)
        Map<Long, InventoryReceiptItem> itemMap = new LinkedHashMap<>();

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);

            // AUTO-DETECT: tìm row đầu tiên có mã SP hợp lệ
            int startRow = findDataStartRow(sheet);
            log.info("Receipt Excel import: data từ row index {} (Excel row {})", startRow, startRow + 1);

            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row) || isLegendRow(row)) continue;
                totalRows++;
                int lineNum = rowIdx + 1;
                try {
                    String code = getCellString(row, COL_CODE);
                    String name = getCellString(row, COL_NAME);
                    Integer qty = getCellInt(row, COL_QUANTITY);
                    BigDecimal cost = getCellDecimal(row, COL_COST);

                    // Validate bắt buộc
                    if ((code == null || code.isBlank()) && (name == null || name.isBlank())) {
                        errors.add("Dòng " + lineNum + ": Phải có mã SP (cột A) hoặc tên SP (cột B)");
                        errorItems++; continue;
                    }
                    if (qty == null || qty <= 0) {
                        errors.add("Dòng " + lineNum + ": Số lượng (cột C) phải > 0, code=" + code);
                        errorItems++; continue;
                    }
                    if (cost == null || cost.compareTo(BigDecimal.ZERO) <= 0) {
                        errors.add("Dòng " + lineNum + ": Giá nhập (cột D) phải > 0, code=" + code);
                        errorItems++; continue;
                    }

                    // ── Tìm sản phẩm theo 3 tầng ưu tiên ────────────────────
                    FindResult findResult = findProduct(code, name, lineNum, errors, warnings);
                    if (findResult.isAmbiguous()) { errorItems++; continue; }
                    Optional<Product> productOpt = findResult.product();
                    if (productOpt.isEmpty()) {
                        // ── AUTO-CREATE: SP chưa tồn tại → tạo mới ──────────
                        if (name == null || name.isBlank()) {
                            errors.add("Dòng " + lineNum + ": Không tìm thấy SP code='" + code
                                    + "' và tên SP (cột B) trống — không thể tạo mới");
                            errorItems++; continue;
                        }
                        // Lấy/tạo category từ cột F (nếu có), mặc định "Chưa phân loại"
                        String categoryName = getCellString(row, COL_CATEGORY);
                        if (categoryName == null || categoryName.isBlank()) categoryName = "Chưa phân loại";
                        final String catName = categoryName.trim();
                        Category category = categoryRepository.findByNameIgnoreCase(catName)
                                .orElseGet(() -> {
                                    Category c = new Category();
                                    c.setName(catName);
                                    c.setActive(true);
                                    c.setCreatedAt(LocalDateTime.now());
                                    c.setUpdatedAt(LocalDateTime.now());
                                    return categoryRepository.save(c);
                                });

                        // Đơn vị từ cột G, mặc định "cái"
                        String unit = getCellString(row, COL_UNIT);
                        if (unit == null || unit.isBlank()) unit = "cái";

                        // Tạo SP mới
                        Product newProduct = new Product();
                        newProduct.setName(name.trim());
                        newProduct.setCategory(category);
                        newProduct.setUnit(unit.trim());
                        newProduct.setSellUnit(unit.trim());
                        newProduct.setCostPrice(cost);
                        newProduct.setSellPrice(cost); // sellPrice = costPrice, admin điều chỉnh sau
                        newProduct.setStockQty(0);     // stock sẽ được cộng sau
                        newProduct.setActive(true);
                        newProduct.setPiecesPerImportUnit(1);
                        newProduct.setCreatedAt(LocalDateTime.now());
                        newProduct.setUpdatedAt(LocalDateTime.now());
                        // Auto-generate code theo category
                        String generatedCode = (code != null && !code.isBlank())
                                ? code.trim().toUpperCase()
                                : productService.generateProductCode(category);
                        newProduct.setCode(generatedCode);

                        newProduct = productRepository.save(newProduct);
                        productOpt = Optional.of(newProduct);
                        newProducts++;
                        warnings.add("Dòng " + lineNum + ": Tạo SP mới '" + generatedCode
                                + "' - " + name.trim() + " (danh mục: " + catName + ")");
                        log.info("Dòng {}: Auto-created product code='{}' name='{}'",
                                lineNum, generatedCode, name);
                    }

                    Product product = productOpt.get();
                    if (!product.getActive()) {
                        warnings.add("Dòng " + lineNum + ": SP '" + product.getCode() + "' đã ngừng KD, bỏ qua");
                        skippedItems++; continue;
                    }

                    String importUnit = product.getImportUnit();
                    int pieces = product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1;
                    int addedRetailQty = UnitConverter.toRetailQty(importUnit, pieces, qty);

                    BigDecimal costPerRetailUnit = UnitConverter.isAtomicUnit(importUnit) ? cost
                            : cost.divide(BigDecimal.valueOf(pieces), 2, RoundingMode.HALF_UP);

                    // ── Cập nhật product: giá vốn mới nhất + tồn kho ────────
                    product.setCostPrice(costPerRetailUnit);
                    product.setStockQty(product.getStockQty() + addedRetailQty);
                    product.setUpdatedAt(LocalDateTime.now());
                    productRepository.save(product);

                    // ── Tạo Batch ─────────────────────────────────────────────
                    LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                            ? LocalDate.now().plusDays(product.getExpiryDays())
                            : LocalDate.now().plusYears(10);

                    String batchCode = buildUniqueBatchCode(savedReceipt.getReceiptNo(), product.getCode());
                    ProductBatch batch = new ProductBatch();
                    batch.setProduct(product);
                    batch.setReceipt(savedReceipt);
                    batch.setBatchCode(batchCode);
                    batch.setExpiryDate(expiryDate);
                    batch.setImportQty(addedRetailQty);
                    batch.setRemainingQty(addedRetailQty);
                    batch.setCostPrice(costPerRetailUnit);
                    batchRepository.save(batch);

                    // ── Tạo/Merge Receipt Item ───────────────────────────────
                    // Nếu cùng product đã có trong phiếu → cộng dồn (tránh unique constraint)
                    BigDecimal lineTotal = cost.multiply(BigDecimal.valueOf(qty));
                    totalAmount = totalAmount.add(lineTotal);

                    if (itemMap.containsKey(product.getId())) {
                        InventoryReceiptItem existing = itemMap.get(product.getId());
                        existing.setQuantity(existing.getQuantity() + qty);
                        warnings.add("Dòng " + lineNum + ": SP '" + product.getCode()
                                + "' trùng trong file → gộp số lượng");
                    } else {
                        InventoryReceiptItem item = new InventoryReceiptItem();
                        item.setReceipt(savedReceipt);
                        item.setProduct(product);
                        item.setQuantity(qty);   // số lượng theo đơn vị NHẬP
                        item.setUnitCost(cost);  // giá theo đơn vị NHẬP
                        itemMap.put(product.getId(), item);
                    }

                    successItems++;
                    log.info("Dòng {}: OK '{}' qty={} {} (+{} retail)", lineNum,
                            product.getCode(), qty, importUnit, addedRetailQty);

                } catch (Exception e) {
                    errors.add("Dòng " + lineNum + ": Lỗi - " + e.getMessage());
                    errorItems++;
                    log.warn("Lỗi import receipt dòng {}: {}", lineNum, e.getMessage());
                }
            }
        }

        // ── Finalize receipt ──────────────────────────────────────────────────
        if (successItems > 0) {
            savedReceipt.setTotalAmount(totalAmount);
            savedReceipt.getItems().addAll(itemMap.values());
            receiptRepository.save(savedReceipt);
        } else {
            // Không có item nào thành công → xóa phiếu nhập rỗng
            receiptRepository.delete(savedReceipt);
            log.warn("Không có item nào thành công, đã xóa phiếu nhập {}", savedReceipt.getReceiptNo());
        }

        return new ExcelReceiptResult(
                successItems > 0 ? savedReceipt.getReceiptNo() : null,
                supplierName, totalRows, successItems, skippedItems, errorItems,
                newProducts, totalAmount, errors, warnings);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

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
}
