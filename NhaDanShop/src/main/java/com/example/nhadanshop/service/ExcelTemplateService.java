package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Service tạo file Excel template cho 2 chức năng import:
 *  1. Import sản phẩm hàng loạt  → /api/products/template
 *  2. Import phiếu nhập kho       → /api/receipts/template
 *
 * Template bao gồm:
 *  - Sheet 1 "Dữ liệu": header màu + dummy data thực tế
 *  - Sheet 2 "Hướng dẫn": giải thích từng cột chi tiết
 */
@Service
@RequiredArgsConstructor
public class ExcelTemplateService {

    private final ProductRepository productRepository;
    private final ProductComboRepository productComboRepository;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. TEMPLATE IMPORT SẢN PHẨM
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Tạo file Excel template import sản phẩm.
     * Columns: A-code | B-name | C-category | D-unit | E-costPrice | F-sellPrice
     *          G-stockQty | H-expiryDays | I-active | J-importUnit | K-sellUnit
     *          L-piecesPerImportUnit | M-conversionNote
     */
    public byte[] buildProductTemplate() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {

            // ── Styles ───────────────────────────────────────────────────────
            CellStyle headerStyle  = buildHeaderStyle(wb, new byte[]{(byte)34,(byte)139,(byte)34});   // green
            CellStyle required     = buildHeaderStyle(wb, new byte[]{(byte)220,(byte)80,(byte)50});    // red-ish required
            CellStyle dataStyle    = buildDataStyle(wb);
            CellStyle numberStyle  = buildNumberStyle(wb);
            CellStyle noteStyle    = buildNoteStyle(wb);
            CellStyle titleStyle   = buildTitleStyle(wb);
            CellStyle sectionStyle = buildSectionStyle(wb, new byte[]{(byte)34,(byte)139,(byte)34});

            // ── Sheet 1: Data ─────────────────────────────────────────────────
            XSSFSheet data = wb.createSheet("Du lieu San pham");
            data.setDefaultColumnWidth(18);
            data.setColumnWidth(1, 35 * 256);   // B: Tên SP
            data.setColumnWidth(2, 20 * 256);   // C: Danh mục
            data.setColumnWidth(12, 30 * 256);  // M: Ghi chú

            // Title row
            Row titleRow = data.createRow(0);
            titleRow.setHeightInPoints(28);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("TEMPLATE IMPORT SAN PHAM - NHA DAN SHOP");
            titleCell.setCellStyle(titleStyle);
            data.addMergedRegion(new CellRangeAddress(0, 0, 0, 12));

            // Sub-title
            Row subRow = data.createRow(1);
            Cell subCell = subRow.createCell(0);
            subCell.setCellValue("(*) = bat buoc | De trong cot A = tu dong tao ma SP | importUnit: bich/hop/chai = ATOMIC, kg/xau = GOP (tu chia gia)");
            subCell.setCellStyle(noteStyle);
            data.addMergedRegion(new CellRangeAddress(1, 1, 0, 12));

            // Header row (row index 2)
            String[] headers = {
                "A: Ma SP", "B: Ten SP (*)", "C: Danh muc (*)", "D: Don vi (*)",
                "E: Gia von (*)", "F: Gia ban (*)", "G: Ton kho ban dau",
                "H: Han su dung (ngay)", "I: Hoat dong (TRUE/FALSE)",
                "J: Don vi nhap", "K: Don vi ban le",
                "L: So le/DV nhap", "M: Ghi chu quy doi"
            };
            Row hRow = data.createRow(2);
            hRow.setHeightInPoints(20);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                // Cột bắt buộc (B,C,D,E,F) dùng màu khác
                c.setCellStyle((i >= 1 && i <= 5) ? required : headerStyle);
            }

            // ── Dummy data: 10 sản phẩm thực tế của Nhà Đan Shop ─────────────
            Object[][] rows = {
                // code, name, category, unit, costPrice, sellPrice, stockQty, expiryDays, active, importUnit, sellUnit, pieces, note
                {"BT001","Banh Trang Rong Bien","Banh Trang","bich", 6500, 9000, 100, 180, "TRUE","kg","bich", 10,"1kg=10 bich"},
                {"BT002","Banh Trang Cuon Tep","Banh Trang","hop",  38000,55000,  50, 180, "TRUE","hop","hop",  1, ""},
                {"BT003","Banh Trang Nuong Phomát","Banh Trang","goi",12000,18000, 80, 120, "TRUE","goi","goi",  1, ""},
                {"BT004","Banh Trang Tron Sa Te","Banh Trang","bich", 8000,12000,  60, 90,  "TRUE","kg","bich", 8, "1kg=8 bich"},
                {"M001","Muoi Bien Khanh Hoa","Muoi","goi",   5000, 8000, 200, 365, "TRUE","goi","goi",  1, ""},
                {"M002","Muoi Hong Himalaya","Muoi","hop",   35000,55000,  30, 730, "TRUE","hop","hop",  1, ""},
                {"M003","Muoi Toi Ot","Muoi","hu",    18000,28000,  40, 180, "TRUE","hu","hu",   1, ""},
                {"CC001","Com Chay Nam Huong","Com Chay","hop",45000,65000, 20, 90, "TRUE","hop","hop",  1, ""},
                {"CC002","Com Chay Hat Sen","Com Chay","goi", 55000,80000, 15, 120, "TRUE","goi","goi",  1, ""},
                {"TCS001","Trai Cay Say Xoan","Trai Cay Say","goi",25000,38000, 50, 365, "TRUE","kg","goi", 5, "1kg=5 goi"},
            };

            int rowNum = 3;
            for (Object[] r : rows) {
                Row row = data.createRow(rowNum++);
                for (int col = 0; col < r.length; col++) {
                    Cell c = row.createCell(col);
                    if (r[col] instanceof Number) {
                        c.setCellValue(((Number) r[col]).doubleValue());
                        c.setCellStyle(numberStyle);
                    } else {
                        c.setCellValue(r[col] != null ? r[col].toString() : "");
                        c.setCellStyle(dataStyle);
                    }
                }
            }

            // Auto filter
            data.setAutoFilter(new CellRangeAddress(2, 2, 0, 12));
            // Freeze panes: đóng băng 3 dòng đầu (title + subtitle + header)
            data.createFreezePane(0, 3);

            // ── Sheet 2: Hướng dẫn ───────────────────────────────────────────
            XSSFSheet guide = wb.createSheet("Huong dan");
            guide.setColumnWidth(0, 25 * 256);
            guide.setColumnWidth(1, 50 * 256);
            guide.setColumnWidth(2, 40 * 256);

            addGuideHeader(guide, wb, sectionStyle, noteStyle, dataStyle,
                "HUONG DAN IMPORT SAN PHAM",
                new String[][]{
                    {"Cot","Mo ta","Vi du"},
                    {"A: Ma SP","BAT BUOC nhap ma san pham. Phai duy nhat, in hoa.\nHe thong KHONG tu dong tao ma.","BT001"},
                    {"B: Ten SP (*)","Ten day du cua san pham, bat buoc","Banh Trang Rong Bien"},
                    {"C: Danh muc (*)","Ten danh muc. Chua co → tu dong tao moi","Banh Trang"},
                    {"D: Don vi (*)","Don vi ban le: bich, hop, goi, chai, hu...","bich"},
                    {"E: Gia von (*)","Gia nhap (dong). Neu GOP: nhap gia/DV nhap","65000"},
                    {"F: Gia ban (*)","Gia ban le (dong). Neu GOP: nhap gia/DV nhap","90000"},
                    {"G: Ton kho","So luong ton kho ban dau (DV nhap). Mac dinh 0","100"},
                    {"H: Han su dung","So ngay han su dung tinh tu ngay nhap kho","180"},
                    {"I: Hoat dong","TRUE=dang ban, FALSE=an khoi cua hang","TRUE"},
                    {"J: Don vi nhap","ATOMIC: bich/hop/chai/goi/hu (1 DV = 1 le)\nGOP: kg/xau (1 DV = nhieu le)","kg hoac bich"},
                    {"K: Don vi ban le","Don vi khi ban cho khach: bich, goi...","bich"},
                    {"L: So le/DV nhap","ATOMIC=1. GOP: so bich/DV nhap (VD: 1kg=10 bich → 10)","10"},
                    {"M: Ghi chu","Mo ta quy doi don vi (tuy chon)","1kg=10 bich"},
                    {"LUU Y","- File phai la .xlsx\n- Dong 1-2 la title (bo qua tu dong)\n- Dong 3 la header\n- Du lieu tu dong 4\n- Ma trung → bo qua (skip), khong bao loi","-"},
                }
            );

            wb.setActiveSheet(0);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    // ════════════════════════════════════════════════════��═════════════════════
    // 2. TEMPLATE IMPORT PHIẾU NHẬP KHO
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Tạo file Excel template import phiếu nhập kho.
     * Columns A-M (13 cột — NEW FORMAT có cột B: variant_code):
     *   A-productCode | B-variantCode(optional) | C-name | D-quantity |
     *   E-unitCost | F-sellPrice | G-discountPct | H-note |
     *   I-category(mới) | J-unit(mới) | K-importUnit | L-sellUnit | M-piecesPerImportUnit
     */
    @Transactional(readOnly = true)
    public byte[] buildReceiptTemplate() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {

            CellStyle headerStyle  = buildHeaderStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle required     = buildHeaderStyle(wb, new byte[]{(byte)180,(byte)50,(byte)30});
            CellStyle optional     = buildHeaderStyle(wb, new byte[]{(byte)70,(byte)130,(byte)180});
            CellStyle variantStyle = buildHeaderStyle(wb, new byte[]{(byte)100,(byte)60,(byte)160});
            CellStyle sellStyle    = buildHeaderStyle(wb, new byte[]{(byte)0,(byte)120,(byte)160});
            CellStyle unitStyle    = buildHeaderStyle(wb, new byte[]{(byte)120,(byte)80,(byte)0});
            CellStyle comboHdr     = buildHeaderStyle(wb, new byte[]{(byte)100,(byte)50,(byte)180});
            CellStyle dataStyle    = buildDataStyle(wb);
            CellStyle numberStyle  = buildNumberStyle(wb);
            CellStyle noteStyle    = buildNoteStyle(wb);
            CellStyle titleStyle   = buildTitleStyle(wb);
            CellStyle sectionStyle = buildSectionStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle comboSection = buildSectionStyle(wb, new byte[]{(byte)100,(byte)50,(byte)180});
            CellStyle newSpStyle   = buildHighlightStyle(wb);

            // ══════════════════════════════════════════════════════════════
            // SHEET 1: SP Don (13 cột A-M)
            // ══════════════════════════════════════════════════════════════
            XSSFSheet spSheet = wb.createSheet("SP Don");
            spSheet.setDefaultColumnWidth(15);
            spSheet.setColumnWidth(1, 16 * 256);
            spSheet.setColumnWidth(2, 30 * 256);
            spSheet.setColumnWidth(7, 28 * 256);
            spSheet.setColumnWidth(8, 22 * 256);
            spSheet.setColumnWidth(10, 14 * 256);
            spSheet.setColumnWidth(11, 14 * 256);
            spSheet.setColumnWidth(12, 14 * 256);

            Row spTitle = spSheet.createRow(0); spTitle.setHeightInPoints(28);
            Cell spTc = spTitle.createCell(0);
            spTc.setCellValue("SHEET 1: NHAP HANG SP DON - NHA DAN SHOP (13 COT A-M)");
            spTc.setCellStyle(titleStyle);

            Row spSub = spSheet.createRow(1); spSub.setHeightInPoints(50);
            Cell spSc = spSub.createCell(0);
            spSc.setCellValue(
                "A=Ma SP (bat buoc), B=Ma Variant (de trong = default variant).\n" +
                "SP CHUA CO: dien C(Ten)+I(DanhMuc) → tu dong tao SP moi.\n" +
                "K=DV Nhap (kg/xau), L=DV Ban (bich/goi), M=SoLe (1kg=10bich → M=10). VAT%+PhiShip nhap tren web.");
            spSc.setCellStyle(noteStyle);

            String[] spHeaders = {
                "A: Ma SP (*)", "B: Ma Variant", "C: Ten SP",
                "D: So luong (*)", "E: Gia nhap (*)", "F: Gia ban",
                "G: Chiet khau %", "H: Ghi chu dong",
                "I: Danh muc (SP moi)", "J: Don vi (SP moi)",
                "K: DV Nhap kho", "L: DV Ban le", "M: So le/DV"
            };
            CellStyle[] spHStyles = {
                required, variantStyle, headerStyle,
                required, required, sellStyle,
                optional, headerStyle,
                optional, optional,
                unitStyle, unitStyle, unitStyle
            };
            Row spHRow = spSheet.createRow(2); spHRow.setHeightInPoints(20);
            for (int i = 0; i < spHeaders.length; i++) {
                Cell c = spHRow.createCell(i);
                c.setCellValue(spHeaders[i]); c.setCellStyle(spHStyles[i]);
            }

            // ── Data thực từ DB: load SP đơn active ────────────────────────
            java.util.List<Product> singleProducts =
                productRepository.findByProductTypeAndActiveTrue(Product.ProductType.SINGLE);

            int spRowNum = 3;

            if (singleProducts.isEmpty()) {
                // Không có SP nào → ghi hướng dẫn
                Row emptyRow = spSheet.createRow(spRowNum++);
                Cell ec = emptyRow.createCell(0);
                ec.setCellValue("(Chua co san pham nao. Dien ma SP moi vao cot A + Ten SP cot C + Danh muc cot I de tao SP moi.)");
                ec.setCellStyle(noteStyle);
            } else {
                for (Product p : singleProducts) {
                    // Lấy default variant nếu có
                    var variants = p.getVariants();
                    var defaultVar = variants == null ? null :
                        variants.stream().filter(v -> Boolean.TRUE.equals(v.getIsDefault())).findFirst()
                            .orElse(variants.isEmpty() ? null : variants.get(0));

                    Row row = spSheet.createRow(spRowNum++);
                    // A: Mã SP
                    Cell ca = row.createCell(0); ca.setCellValue(p.getCode()); ca.setCellStyle(dataStyle);
                    // B: Mã Variant (default variant code)
                    Cell cb2 = row.createCell(1);
                    cb2.setCellValue(defaultVar != null ? defaultVar.getVariantCode() : "");
                    cb2.setCellStyle(dataStyle);
                    // C: Tên SP
                    Cell cc = row.createCell(2); cc.setCellValue(p.getName()); cc.setCellStyle(dataStyle);
                    // D: Số lượng — để trống cho user điền
                    row.createCell(3).setCellStyle(numberStyle);
                    // E: Giá nhập — để trống
                    row.createCell(4).setCellStyle(numberStyle);
                    // F: Giá bán hiện tại (nếu có)
                    Cell cf = row.createCell(5);
                    if (defaultVar != null && defaultVar.getSellPrice() != null) {
                        cf.setCellValue(defaultVar.getSellPrice().doubleValue());
                        cf.setCellStyle(numberStyle);
                    } else { cf.setCellStyle(numberStyle); }
                    // G: CK% — 0
                    Cell cg = row.createCell(6); cg.setCellValue(0); cg.setCellStyle(numberStyle);
                    // H: Ghi chú — tên danh mục
                    Cell ch = row.createCell(7);
                    ch.setCellValue(p.getCategory() != null ? p.getCategory().getName() : "");
                    ch.setCellStyle(dataStyle);
                    // I, J — trống (SP đã có, không cần tạo mới)
                    row.createCell(8).setCellStyle(dataStyle);
                    row.createCell(9).setCellStyle(dataStyle);
                    // K: Import unit
                    Cell ck = row.createCell(10);
                    ck.setCellValue(defaultVar != null && defaultVar.getImportUnit() != null
                        ? defaultVar.getImportUnit() : "");
                    ck.setCellStyle(dataStyle);
                    // L: Sell unit
                    Cell cl = row.createCell(11);
                    cl.setCellValue(defaultVar != null && defaultVar.getSellUnit() != null
                        ? defaultVar.getSellUnit() : "");
                    cl.setCellStyle(dataStyle);
                    // M: Pieces per unit
                    Cell cm = row.createCell(12);
                    if (defaultVar != null && defaultVar.getPiecesPerUnit() != null) {
                        cm.setCellValue(defaultVar.getPiecesPerUnit());
                        cm.setCellStyle(numberStyle);
                    } else { cm.setCellStyle(numberStyle); }
                }
            }
            Row spLegend = spSheet.createRow(spRowNum + 1);
            Cell sl1 = spLegend.createCell(0); sl1.setCellValue("Xanh = SP/Variant da co"); sl1.setCellStyle(dataStyle);
            Cell sl2 = spLegend.createCell(6); sl2.setCellValue("Vang = SP MOI tu dong tao"); sl2.setCellStyle(newSpStyle);

            spSheet.addMergedRegion(new CellRangeAddress(0,0,0,12));
            spSheet.addMergedRegion(new CellRangeAddress(1,1,0,12));
            spSheet.setAutoFilter(new CellRangeAddress(2,2,0,12));
            spSheet.createFreezePane(0,3);

            // ══════════════════════════════════════════════════════════════
            // SHEET 2: Huong dan  (Sheet Combo tạm thời bị bỏ)
            // ══════════════════════════════════════════════════════════════
            XSSFSheet guide = wb.createSheet("Huong dan");
            guide.setColumnWidth(0, 28 * 256);
            guide.setColumnWidth(1, 65 * 256);
            guide.setColumnWidth(2, 28 * 256);

            addGuideHeader(guide, wb, sectionStyle, noteStyle, dataStyle,
                "HUONG DAN IMPORT PHIEU NHAP KHO",
                new String[][]{
                    {"Chu de","Mo ta","Vi du"},
                    {"SHEET 1: SP Don","13 cot A-M. Moi dong = 1 SP don hoac 1 variant.\n" +
                     "He thong doc theo thu tu: A(Ma SP) → B(Ma Variant) → C(Ten SP).\n" +
                     "Xem ghi chu trong sheet 'SP Don' de biet chi tiet tung cot.",""},
                    {"[TAM THOI] Nhap Combo","Nhap kho combo qua Excel chua duoc ho tro.\n" +
                     "Dung form nhap kho thu cong (tao phieu nhap → chon Combo) de nhap combo.\n" +
                     "Ly do: can giai quyet van de cap nhat gia ban thanh phan khi nhap combo.", ""},
                    {"A: Ma SP (*)","BAT BUOC. Ma SP don le (BT001, M001...).\n" +
                     "Neu ma chua co trong he thong → can dien them C+I de tao SP moi.","BT001"},
                    {"B: Ma Variant","TUY CHON. De trong → default variant.\n" +
                     "Dien ma → tim chinh xac variant do.\n" +
                     "Dien ma CHUA CO → tao variant moi.","BT002"},
                    {"C: So luong (*)","So luong theo DV NHAP (kg/xau/bich/hop).","10"},
                    {"D: Gia nhap (*)","Gia tren 1 DV NHAP.","65000"},
                    {"E: Gia ban","Gia ban moi → cap nhat sell_price. De trong = giu gia cu.","90000"},
                    {"F: Gia ban","Gia ban hien thi. Cap nhat vao variant.","90000"},
                    {"G: Chiet khau %","% chiet khau NCC (0-100).","5"},
                    {"K/L/M","K=DV Nhap, L=DV Ban, M=So le.\n" +
                     "ATOMIC (bich/hop/chai): M bo qua, ton kho += qty.\n" +
                     "GOP (kg/xau/thung): ton kho += qty x M.","K=kg L=bich M=10"},
                    {"Chi phi sau import","finalCost = (unitCost / pieces) x (1-CK%) + ship/unit + VAT/unit.\n" +
                     "Ship + VAT nhap tren web, phan bo theo ti le gia tri dong.",""},
                    {"PREVIEW truoc khi import","He thong hien thi tat ca dong du lieu, danh dau loi do/xanh.\n" +
                     "Co loi → khoa nut 'Tao phieu nhap'. Sua file roi upload lai.",""},
                    {"Rollback","1 loi bat ky → rollback toan bo, khong ghi gi vao DB.",""},
                }
            );

            wb.setActiveSheet(0);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    /** Build title style với màu tùy chỉnh */
    private CellStyle buildTitleStyleColored(XSSFWorkbook wb, byte[] rgb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor color = new XSSFColor(rgb, null);
        style.setFillForegroundColor(color);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFFont font = wb.createFont();
        font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short)14);
        style.setFont(font);
        return style;
    }

    /** Highlight style cho mã combo trong sheet Combo */
    private CellStyle buildHighlightCombo(XSSFWorkbook wb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor bg = new XSSFColor(new byte[]{(byte)237,(byte)231,(byte)246}, null);
        style.setFillForegroundColor(bg);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN); style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);  style.setBorderRight(BorderStyle.THIN);
        XSSFFont font = wb.createFont();
        font.setBold(true);
        font.setColor(new XSSFColor(new byte[]{(byte)100,(byte)50,(byte)180}, null));
        style.setFont(font);
        return style;
    }



    // ══════════════════════════════════════════════════════════════════════════
    // 3. TEMPLATE IMPORT COMBO
    // ══════════════════════════════════════════════════════════════════════════

    public byte[] buildComboTemplate() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            CellStyle headerStyle  = buildHeaderStyle(wb, new byte[]{(byte)100,(byte)50,(byte)180});
            CellStyle required     = buildHeaderStyle(wb, new byte[]{(byte)180,(byte)50,(byte)30});
            CellStyle optional     = buildHeaderStyle(wb, new byte[]{(byte)70,(byte)130,(byte)180});
            CellStyle compStyle    = buildHeaderStyle(wb, new byte[]{(byte)150,(byte)80,(byte)200});
            CellStyle dataStyle    = buildDataStyle(wb);
            CellStyle numberStyle  = buildNumberStyle(wb);
            CellStyle noteStyle    = buildNoteStyle(wb);
            CellStyle titleStyle   = buildTitleStyle(wb);
            CellStyle sectionStyle = buildSectionStyle(wb, new byte[]{(byte)100,(byte)50,(byte)180});

            XSSFSheet data = wb.createSheet("Du lieu Combo");
            data.setDefaultColumnWidth(16);
            data.setColumnWidth(1, 35 * 256);  // B: Tên combo
            data.setColumnWidth(5, 40 * 256);  // F: Mô tả

            // Title row 0
            Row titleRow = data.createRow(0);
            titleRow.setHeightInPoints(28);
            Cell tc = titleRow.createCell(0);
            tc.setCellValue("TEMPLATE IMPORT COMBO SAN PHAM - NHA DAN SHOP");
            tc.setCellStyle(titleStyle);

            // Sub-title row 1
            Row subRow = data.createRow(1);
            subRow.setHeightInPoints(40);
            Cell sc = subRow.createCell(0);
            sc.setCellValue(
                "Moi dong = 1 combo. Toi da 5 thanh phan/dong (cot G-P).\n" +
                "SP thanh phan phai la ma SP DON LE (SINGLE) da co trong he thong.\n" +
                "De trong cot A → tu dong sinh ma COMBO###. Cat ID: xem sheet Huong dan.");
            sc.setCellStyle(noteStyle);

            // Header row 2
            // Cột A-F: thông tin combo (thêm F: Mô tả)
            // Cột G-P: từng cặp (Mã SP, SL) × 5 thành phần
            String[] headers = {
                "A: Ma combo", "B: Ten combo (*)", "C: Gia ban (*)", "D: Don vi", "E: Cat.ID",
                "F: Mo ta combo",
                "G: Ma SP 1 (*)", "H: SL 1 (*)",
                "I: Ma SP 2", "J: SL 2",
                "K: Ma SP 3", "L: SL 3",
                "M: Ma SP 4", "N: SL 4",
                "O: Ma SP 5", "P: SL 5"
            };
            CellStyle[] hStyles = {
                headerStyle, required, required, optional, optional, optional,
                compStyle, compStyle,
                compStyle, compStyle,
                compStyle, compStyle,
                compStyle, compStyle,
                compStyle, compStyle
            };
            Row hRow = data.createRow(2);
            hRow.setHeightInPoints(20);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(hStyles[i]);
            }

            // Dummy data
            // A:code | B:name | C:price | D:unit | E:catId | F:description | G:sp1 | H:sl1 | I:sp2 | J:sl2 ...
            Object[][] rows = {
                {"", "Combo Banh Trang Dac Biet", 150000, "combo", "", "Combo gom 5 bich banh trang + 2 goi muoi", "BT001", 5, "M001", 2, "", "", "", "", "", ""},
                {"", "Combo Muoi Goi To",          80000,  "combo", "", "Muoi bien + muoi hong + muoi toi ot",       "M001", 5, "M002", 1, "M003", 2, "", "", "", ""},
                {"COMBO_TEST", "Combo Thu Nghiem",  200000, "bo",   "", "",                                          "BT001", 3, "BT002", 2, "CC001", 1, "", "", "", ""},
            };
            int rowNum = 3;
            for (Object[] r : rows) {
                Row row = data.createRow(rowNum++);
                for (int col = 0; col < r.length; col++) {
                    Cell c = row.createCell(col);
                    if (r[col] instanceof Number) {
                        c.setCellValue(((Number)r[col]).doubleValue());
                        c.setCellStyle(numberStyle);
                    } else {
                        c.setCellValue(r[col] != null ? r[col].toString() : "");
                        c.setCellStyle(dataStyle);
                    }
                }
            }

            data.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 15));
            data.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(1, 1, 0, 15));
            data.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(2, 2, 0, 15));
            data.createFreezePane(0, 3);

            // Guide sheet
            XSSFSheet guide = wb.createSheet("Huong dan");
            guide.setColumnWidth(0, 22 * 256);
            guide.setColumnWidth(1, 55 * 256);
            guide.setColumnWidth(2, 30 * 256);
            addGuideHeader(guide, wb, sectionStyle, noteStyle, dataStyle,
                "HUONG DAN IMPORT COMBO",
                new String[][]{
                    {"Cot", "Mo ta", "Vi du"},
                    {"A: Ma combo", "De trong → tu dong tao COMBO001, COMBO002...\nNhap tay → phai duy nhat, in hoa", "COMBO001 hoac de trong"},
                    {"B: Ten combo (*)", "Ten combo, bat buoc", "Combo Banh Trang Dac Biet"},
                    {"C: Gia ban (*)", "Gia ban combo (dong). Thuong thap hon tong SP le", "150000"},
                    {"D: Don vi", "Don vi cua combo. De trong = 'combo'", "bo, set, combo"},
                    {"E: Cat.ID", "ID danh muc (so nguyen). De trong = lay tu SP thanh phan dau tien", "3"},
                    {"F: Mo ta", "Mo ta combo (tuy chon). Hien thi o trang admin.", "Combo gom 5 bich banh trang + 2 goi muoi"},
                    {"G+H: SP 1", "Ma SP + So luong thanh phan 1. BAT BUOC it nhat 1 cap.", "BT001 | 5"},
                    {"I+J: SP 2", "Ma SP + So luong thanh phan 2 (tuy chon)", "M001 | 2"},
                    {"K+L...P: SP 3-5", "Tuong tu, toi da 5 thanh phan", ""},
                    {"LUU Y 1", "SP thanh phan PHAI LA SP DON LE (SINGLE) da co trong he thong", ""},
                    {"LUU Y 2", "Khong the them combo vao trong combo (khong long combo)", ""},
                    {"LUU Y 3", "1 dong loi → rollback toan bo file, khong tao combo nao", ""},
                    {"TON KHO AO", "stockQty combo = min(stockQty_SP / required_qty) moi thanh phan\nVD: BT001 ton 20, can 5 → co the ban 4 combo", ""},
                    {"GIA VON", "costPrice combo = Σ (costPrice_thanh_phan × qty)\nTu dong cap nhat moi khi nhap kho SP thanh phan", ""},
                    {"BAN COMBO", "Khi ban: chon combo, he thong tu expand thanh cac line item SP don,\nghi nhan tru kho tung thanh phan, doanh thu tinh theo gia combo", ""},
                }
            );

            wb.setActiveSheet(0);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helpers: Style builders
    // ══════════════════════════════════════════════════════════════════════════

    private CellStyle buildHeaderStyle(XSSFWorkbook wb, byte[] rgb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor color = new XSSFColor(rgb, null);
        style.setFillForegroundColor(color);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setWrapText(true);
        XSSFFont font = wb.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 10);
        style.setFont(font);
        return style;
    }

    private CellStyle buildDataStyle(XSSFWorkbook wb) {
        CellStyle style = wb.createCellStyle();
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setWrapText(false);
        return style;
    }

    private CellStyle buildNumberStyle(XSSFWorkbook wb) {
        XSSFCellStyle style = (XSSFCellStyle) buildDataStyle(wb);
        style.setAlignment(HorizontalAlignment.RIGHT);
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
        return style;
    }

    private CellStyle buildNoteStyle(XSSFWorkbook wb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor bg = new XSSFColor(new byte[]{(byte)255,(byte)255,(byte)200}, null);
        style.setFillForegroundColor(bg);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setWrapText(true);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFFont font = wb.createFont();
        font.setItalic(true);
        font.setFontHeightInPoints((short) 9);
        font.setColor(new XSSFColor(new byte[]{(byte)100,(byte)70,(byte)0}, null));
        style.setFont(font);
        return style;
    }

    private CellStyle buildTitleStyle(XSSFWorkbook wb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor bg = new XSSFColor(new byte[]{(byte)34,(byte)139,(byte)34}, null);
        style.setFillForegroundColor(bg);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFFont font = wb.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 14);
        style.setFont(font);
        return style;
    }

    private CellStyle buildSectionStyle(XSSFWorkbook wb, byte[] rgb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor color = new XSSFColor(rgb, null);
        style.setFillForegroundColor(color);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.LEFT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFFont font = wb.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 12);
        style.setFont(font);
        return style;
    }

    private CellStyle buildHighlightStyle(XSSFWorkbook wb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor bg = new XSSFColor(new byte[]{(byte)255,(byte)243,(byte)176}, null);
        style.setFillForegroundColor(bg);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFFont font = wb.createFont();
        font.setColor(new XSSFColor(new byte[]{(byte)120,(byte)80,(byte)0}, null));
        style.setFont(font);
        return style;
    }

    private void addGuideHeader(XSSFSheet sheet, XSSFWorkbook wb,
                                CellStyle sectionStyle, CellStyle noteStyle, CellStyle dataStyle,
                                String title, String[][] rows) {
        int r = 0;
        // Title
        Row titleRow = sheet.createRow(r++);
        titleRow.setHeightInPoints(28);
        Cell t = titleRow.createCell(0);
        t.setCellValue(title);
        t.setCellStyle(sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));

        // Header row của bảng hướng dẫn
        Row headerRow = sheet.createRow(r++);
        for (int i = 0; i < rows[0].length; i++) {
            Cell c = headerRow.createCell(i);
            c.setCellValue(rows[0][i]);
            c.setCellStyle(sectionStyle);
        }

        // Data rows
        CellStyle alt = buildAltRowStyle(wb);
        for (int i = 1; i < rows.length; i++) {
            Row row = sheet.createRow(r++);
            row.setHeightInPoints(rows[i][1].contains("\n") ? 40 : 18);
            CellStyle rowStyle = i % 2 == 0 ? alt : dataStyle;
            for (int j = 0; j < rows[i].length; j++) {
                Cell c = row.createCell(j);
                c.setCellValue(rows[i][j]);
                c.setCellStyle(j == 0 ? noteStyle : rowStyle);
            }
        }
    }

    private CellStyle buildAltRowStyle(XSSFWorkbook wb) {
        XSSFCellStyle style = wb.createCellStyle();
        XSSFColor bg = new XSSFColor(new byte[]{(byte)240,(byte)248,(byte)240}, null);
        style.setFillForegroundColor(bg);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setWrapText(true);
        return style;
    }
}
