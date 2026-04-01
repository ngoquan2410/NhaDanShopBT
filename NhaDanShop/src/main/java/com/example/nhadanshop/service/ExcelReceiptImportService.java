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
    private final CategoryRepository categoryRepository;
    private final ProductService productService;
    private final ProductComboRepository comboItemRepo;  // repo ProductComboItem (KiotViet model)

    // Column indices (9 cột → 8 sau khi bỏ VAT)
    private static final int COL_CODE     = 0; // A: Mã SP
    private static final int COL_NAME     = 1; // B: Tên SP
    private static final int COL_QUANTITY = 2; // C: Số lượng
    private static final int COL_COST     = 3; // D: Giá nhập
    private static final int COL_DISCOUNT = 4; // E: Chiết khấu %
    private static final int COL_NOTE     = 5; // F: Ghi chú (VAT đã chuyển lên cấp đơn hàng)
    private static final int COL_CATEGORY = 6; // G: Danh mục (SP mới)
    private static final int COL_UNIT     = 7; // H: Đơn vị (SP mới)

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
                BigDecimal discountPct = getCellDecimal(row, COL_DISCOUNT);
                if (discountPct == null) discountPct = BigDecimal.ZERO;
                // VAT không còn per-dòng — đã chuyển sang field vatPercent toàn đơn
                String lineNote = getCellString(row, COL_NOTE);

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
                    errors.add("❌ Dòng " + lineNum + ": Chiết khấu % (cột E) phải trong khoảng 0–100, hiện là: " + discountPct);
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
                    validatedRows.add(new ValidatedRow(
                            product, null, null, null, null,
                            qty, cost, discountPct, isCombo, lineNum, lineNote));
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

                    validatedRows.add(new ValidatedRow(
                            null, name.trim(), categoryName.trim(), unit.trim(), generatedCode,
                            qty, cost, discountPct, false, lineNum, lineNote));
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
                np.setSellPrice(vr.cost());
                np.setStockQty(0);
                np.setActive(true);
                np.setPiecesPerImportUnit(1);
                np.setCreatedAt(LocalDateTime.now());
                np.setUpdatedAt(LocalDateTime.now());
                product = productRepository.save(np);
                newProducts++;
                warnings.add("Dòng " + vr.lineNum() + ": Tạo SP mới '" + resolvedCode + "' - " + vr.newProductName());
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
            String importUnit = product.getImportUnit();
            int pieces = product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1;
            int addedRetailQty = UnitConverter.toRetailQty(importUnit, pieces, vr.qty());

            BigDecimal costPerRetailUnit = UnitConverter.isAtomicUnit(importUnit) ? vr.cost()
                    : vr.cost().divide(BigDecimal.valueOf(pieces), 2, RoundingMode.HALF_UP);
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    vr.discountPct().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal discountedCostPerUnit = costPerRetailUnit.multiply(discountFactor)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal discountedLineTotal = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));
            totalAmount = totalAmount.add(vr.cost().multiply(BigDecimal.valueOf(vr.qty())));

            if (itemMap.containsKey(product.getId())) {
                InventoryReceiptItem existing = itemMap.get(product.getId());
                existing.setQuantity(existing.getQuantity() + vr.qty());
                discountedLineTotals.merge(product.getId(), discountedLineTotal, BigDecimal::add);
                warnings.add("Dòng " + vr.lineNum() + ": SP '" + product.getCode() + "' trùng → gộp số lượng");
            } else {
                InventoryReceiptItem item = new InventoryReceiptItem();
                item.setReceipt(savedReceipt);
                item.setProduct(product);
                item.setQuantity(vr.qty());
                item.setUnitCost(vr.cost());
                item.setDiscountPercent(vr.discountPct());
                item.setDiscountedCost(discountedCostPerUnit);
                item.setVatPercent(vatPercent);   // VAT toàn đơn lưu tham khảo
                item.setVatAllocated(BigDecimal.ZERO);
                item.setShippingAllocated(BigDecimal.ZERO);
                item.setFinalCost(discountedCostPerUnit);
                item.setFinalCostWithVat(discountedCostPerUnit);
                itemMap.put(product.getId(), item);
                discountedLineTotals.put(product.getId(), discountedLineTotal);
            }

            // Tạo Batch tạm
            LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                    ? LocalDate.now().plusDays(product.getExpiryDays()) : LocalDate.now().plusYears(10);
            String batchCode = buildUniqueBatchCode(savedReceipt.getReceiptNo(), product.getCode());
            ProductBatch batch = new ProductBatch();
            batch.setProduct(product); batch.setReceipt(savedReceipt);
            batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
            batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
            batch.setCostPrice(discountedCostPerUnit);
            batchRepository.save(batch);

            product.setStockQty(product.getStockQty() + addedRetailQty);
            product.setUpdatedAt(LocalDateTime.now());
            productRepository.save(product);
            successItems++;
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

            Product product = productRepository.findById(productId).orElseThrow();
            int pieces = product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1;
            int retailQty = UnitConverter.toRetailQty(product.getImportUnit(), pieces, item.getQuantity());

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

            batchRepository.findByReceiptAndProduct(savedReceipt, product).forEach(b -> {
                b.setCostPrice(finalCostWithVat);
                batchRepository.save(b);
            });
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
        String importUnit = product.getImportUnit();
        int pieces = product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1;
        int addedRetailQty = UnitConverter.toRetailQty(importUnit, pieces, qty);

        BigDecimal costPerRetailUnit = UnitConverter.isAtomicUnit(importUnit) ? unitCost
                : unitCost.divide(BigDecimal.valueOf(pieces), 2, RoundingMode.HALF_UP);
        BigDecimal discountFactor = BigDecimal.ONE.subtract(
                discountPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
        BigDecimal discountedCostPerUnit = costPerRetailUnit.multiply(discountFactor)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal discountedLineTotal = discountedCostPerUnit.multiply(BigDecimal.valueOf(addedRetailQty));

        if (itemMap.containsKey(product.getId())) {
            InventoryReceiptItem existing = itemMap.get(product.getId());
            existing.setQuantity(existing.getQuantity() + qty);
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
            item.setVatPercent(BigDecimal.ZERO);      // sẽ cập nhật sau khi biết vatPercent toàn đơn
            item.setVatAllocated(BigDecimal.ZERO);
            item.setShippingAllocated(BigDecimal.ZERO);
            item.setFinalCost(discountedCostPerUnit);
            item.setFinalCostWithVat(discountedCostPerUnit);
            itemMap.put(product.getId(), item);
            discountedLineTotals.put(product.getId(), discountedLineTotal);
        }

        // Batch tạm
        LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                ? LocalDate.now().plusDays(product.getExpiryDays()) : LocalDate.now().plusYears(10);
        String batchCode = buildUniqueBatchCode(receipt.getReceiptNo(), product.getCode());
        ProductBatch batch = new ProductBatch();
        batch.setProduct(product); batch.setReceipt(receipt);
        batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
        batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
        batch.setCostPrice(discountedCostPerUnit);
        batchRepository.save(batch);

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
     */
    private record ValidatedRow(
            Product product,           // SP tìm được (null nếu cần auto-create)
            String newProductName,
            String newCategoryName,
            String newUnit,
            String newCode,
            int qty,
            BigDecimal cost,
            BigDecimal discountPct,
            boolean isCombo,           // true nếu product.productType=COMBO → expand
            int lineNum,
            String lineNote
    ) {}
}
