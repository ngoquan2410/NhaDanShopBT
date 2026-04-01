package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.repository.ProductRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.*;

/**
 * Import combo từ file Excel theo cấu trúc:
 *
 * Sheet "Du lieu Combo":
 *   Dòng 1: Title
 *   Dòng 2: Hướng dẫn
 *   Dòng 3: Header
 *   Từ dòng 4: data
 *
 * Cấu trúc mỗi dòng:
 *   A: Mã combo (để trống = tự tạo)
 *   B: Tên combo (*)
 *   C: Giá bán (*)
 *   D: Đơn vị (để trống = "combo")
 *   E: Danh mục ID
 *   F: Mã SP thành phần 1 (*)  → tìm theo code
 *   G: SL SP thành phần 1 (*)
 *   H: Mã SP thành phần 2
 *   I: SL SP thành phần 2
 *   J: Mã SP thành phần 3
 *   K: SL SP thành phần 3
 *   ... (tối đa 5 thành phần / dòng)
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class ExcelComboImportService {

    private final ProductRepository productRepo;
    private final ProductComboService comboService;

    // Mỗi combo dùng 2 cột cho 1 thành phần: Mã SP + SL, từ cột F (index 5) trở đi
    private static final int FIRST_COMPONENT_COL = 5; // F
    private static final int MAX_COMPONENTS      = 5;

    @Transactional
    public Map<String, Object> importCombos(MultipartFile file) throws IOException {
        List<String> errors   = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<String> created  = new ArrayList<>();

        try (XSSFWorkbook wb = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = wb.getSheet("Du lieu Combo");
            if (sheet == null) sheet = wb.getSheetAt(0);

            int startRow = detectStartRow(sheet);
            log.info("Combo import: startRow={}, totalRows={}", startRow, sheet.getLastRowNum());

            // ── Pass 1: Validate tất cả dòng ─────────────────────────────────
            List<RowData> validRows = new ArrayList<>();
            for (int r = startRow; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null || isBlankRow(row)) continue;

                String comboName = getCellString(row, 1);
                if (comboName == null || comboName.isBlank()) continue; // dòng trắng tên

                String linePrefix = "Dòng " + (r + 1) + " [" + comboName + "]";

                String comboCode = getCellString(row, 0);
                BigDecimal sellPrice = getCellDecimal(row, 2);
                if (sellPrice == null || sellPrice.compareTo(BigDecimal.ZERO) <= 0) {
                    errors.add(linePrefix + ": Giá bán (cột C) phải > 0");
                    continue;
                }

                // Đọc thành phần
                List<ProductComboRequest.ComboItemRequest> compItems = new ArrayList<>();
                for (int ci = 0; ci < MAX_COMPONENTS; ci++) {
                    int codeCol = FIRST_COMPONENT_COL + ci * 2;
                    int qtyCol  = codeCol + 1;
                    String spCode = getCellString(row, codeCol);
                    if (spCode == null || spCode.isBlank()) break; // hết thành phần
                    Integer qty = getCellInt(row, qtyCol);
                    if (qty == null || qty < 1) {
                        errors.add(linePrefix + ": Số lượng thành phần '" + spCode + "' không hợp lệ (cột " + (char)('F' + ci*2 + 1) + ")");
                        break;
                    }
                    Optional<Product> comp = productRepo.findByCode(spCode.trim().toUpperCase());
                    if (comp.isEmpty()) {
                        errors.add(linePrefix + ": Sản phẩm mã '" + spCode + "' không tìm thấy trong hệ thống");
                        break;
                    }
                    if (comp.get().isCombo()) {
                        errors.add(linePrefix + ": '" + spCode + "' là combo, không thể thêm combo vào combo");
                        break;
                    }
                    compItems.add(new ProductComboRequest.ComboItemRequest(comp.get().getId(), qty));
                }
                if (compItems.isEmpty()) {
                    errors.add(linePrefix + ": Combo phải có ít nhất 1 thành phần hợp lệ (cột F+)");
                    continue;
                }

                String unit = getCellString(row, 3);
                Long catId = getCellLong(row, 4);

                validRows.add(new RowData(comboCode, comboName, sellPrice, unit, catId, compItems, linePrefix));
            }

            // Nếu có lỗi bất kỳ → báo hết, không import
            if (!errors.isEmpty()) {
                return Map.of(
                    "success", false,
                    "message", "File có " + errors.size() + " lỗi — chưa tạo combo nào. Sửa file rồi import lại.",
                    "errors", errors
                );
            }

            // ── Pass 2: Tạo combo ─────────────────────────────────────────────
            for (RowData rd : validRows) {
                try {
                    ProductComboRequest req = new ProductComboRequest(
                            rd.code(), rd.name(), rd.unit(), rd.sellPrice(),
                            true, null, rd.categoryId(), rd.items()
                    );
                    ProductComboResponse resp = comboService.create(req);
                    created.add(resp.code() + " - " + resp.name());
                    log.info("Combo import: created {} - {}", resp.code(), resp.name());
                } catch (Exception e) {
                    errors.add(rd.prefix() + ": " + e.getMessage());
                }
            }
        }

        return Map.of(
            "success", errors.isEmpty(),
            "message", "Import hoàn tất: " + created.size() + " combo được tạo" +
                       (errors.isEmpty() ? "" : ", " + errors.size() + " lỗi"),
            "created",  created,
            "warnings", warnings,
            "errors",   errors
        );
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private record RowData(String code, String name, BigDecimal sellPrice,
                           String unit, Long categoryId,
                           List<ProductComboRequest.ComboItemRequest> items,
                           String prefix) {}

    private int detectStartRow(Sheet sheet) {
        for (int r = 0; r <= Math.min(5, sheet.getLastRowNum()); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            String val = getCellString(row, 1);
            if (val != null && val.toLowerCase().contains("ten combo")) return r + 1;
        }
        return 3; // default: dòng 4 (index 3)
    }

    private boolean isBlankRow(Row row) {
        for (int i = 0; i <= 10; i++) {
            String v = getCellString(row, i);
            if (v != null && !v.isBlank()) return false;
        }
        return true;
    }

    private String getCellString(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return null;
        return switch (c.getCellType()) {
            case STRING  -> c.getStringCellValue().trim();
            case NUMERIC -> String.valueOf((long) c.getNumericCellValue());
            case BOOLEAN -> String.valueOf(c.getBooleanCellValue());
            default      -> null;
        };
    }

    private BigDecimal getCellDecimal(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return null;
        try {
            return switch (c.getCellType()) {
                case NUMERIC -> BigDecimal.valueOf(c.getNumericCellValue());
                case STRING  -> new BigDecimal(c.getStringCellValue().trim().replace(",", ""));
                default      -> null;
            };
        } catch (Exception e) { return null; }
    }

    private Integer getCellInt(Row row, int col) {
        BigDecimal bd = getCellDecimal(row, col);
        return bd != null ? bd.intValue() : null;
    }

    private Long getCellLong(Row row, int col) {
        BigDecimal bd = getCellDecimal(row, col);
        return bd != null ? bd.longValue() : null;
    }
}
