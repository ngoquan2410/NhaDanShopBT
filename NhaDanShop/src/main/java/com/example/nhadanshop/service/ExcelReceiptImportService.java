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

    // Column indices
    private static final int COL_CODE     = 0; // Mã SP (lookup key)
    private static final int COL_NAME     = 1; // Tên SP (fallback lookup)
    private static final int COL_QUANTITY = 2; // Số lượng đơn vị NHẬP
    private static final int COL_COST     = 3; // Giá / 1 đơn vị NHẬP
    private static final int COL_NOTE     = 4; // Ghi chú (optional)

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
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<InventoryReceiptItem> items = new ArrayList<>();

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);

            // AUTO-DETECT: tìm row đầu tiên có mã SP hợp lệ
            int startRow = findDataStartRow(sheet);
            log.info("Receipt Excel import: data từ row index {} (Excel row {})", startRow, startRow + 1);

            for (int rowIdx = startRow; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null || isRowEmpty(row)) continue;
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

                    // ── Tìm sản phẩm ──────────────────────────────────────────
                    Optional<Product> productOpt = Optional.empty();
                    if (code != null && !code.isBlank()) {
                        productOpt = productRepository.findByCode(code.trim());
                    }
                    if (productOpt.isEmpty() && name != null && !name.isBlank()) {
                        productOpt = productRepository.findByNameContainingIgnoreCase(name.trim())
                                .stream().findFirst();
                        if (productOpt.isPresent()) {
                            warnings.add("Dòng " + lineNum + ": Tìm theo tên '" + name + "' → '"
                                    + productOpt.get().getCode() + "'");
                        }
                    }
                    if (productOpt.isEmpty()) {
                        errors.add("Dòng " + lineNum + ": Không tìm thấy SP code='" + code + "' name='" + name + "'");
                        errorItems++; continue;
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

                    // ── Tạo Receipt Item ──────────────────────────────────────
                    InventoryReceiptItem item = new InventoryReceiptItem();
                    item.setReceipt(savedReceipt);
                    item.setProduct(product);
                    item.setQuantity(qty);            // số lượng theo đơn vị NHẬP (kg/xâu/hộp)
                    item.setUnitCost(cost);           // giá theo đơn vị NHẬP

                    // totalAmount theo đơn vị nhập (= cost * qty nhập)
                    totalAmount = totalAmount.add(cost.multiply(BigDecimal.valueOf(qty)));
                    items.add(item);

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
            savedReceipt.getItems().addAll(items);
            receiptRepository.save(savedReceipt);
        } else {
            // Không có item nào thành công → xóa phiếu nhập rỗng
            receiptRepository.delete(savedReceipt);
            log.warn("Không có item nào thành công, đã xóa phiếu nhập {}", savedReceipt.getReceiptNo());
        }

        return new ExcelReceiptResult(
                successItems > 0 ? savedReceipt.getReceiptNo() : null,
                supplierName, totalRows, successItems, skippedItems, errorItems,
                totalAmount, errors, warnings);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Tìm row đầu tiên có cột A là mã SP hợp lệ (không phải header text) */
    private int findDataStartRow(Sheet sheet) {
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            if (isValidCode(getCellString(row, COL_CODE))) return i;
        }
        return 1;
    }

    private boolean isValidCode(String val) {
        if (val == null || val.isBlank() || val.length() > 50) return false;
        if (val.contains("*") || val.contains("¶") || val.contains("\n")
                || val.contains("(") || val.contains("/")) return false;
        String lower = val.trim().toLowerCase();
        return !lower.equals("code") && !lower.equals("ma") && !lower.equals("stt")
                && !lower.startsWith("phiếu") && !lower.startsWith("api:")
                && !lower.startsWith("nhà dân") && !lower.startsWith("nha dan");
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
}
