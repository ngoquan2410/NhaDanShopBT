package com.example.nhadanshop.service;

import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;

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
                    {"A: Ma SP","De trong → he thong tu tao theo danh muc.\nNhap tay → phai duy nhat, in hoa VD: BT001","BT001 hoac de trong"},
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
     * Columns: A-code | B-name | C-quantity | D-unitCost | E-note | F-category(mới) | G-unit(mới)
     */
    public byte[] buildReceiptTemplate() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {

            CellStyle headerStyle  = buildHeaderStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle required     = buildHeaderStyle(wb, new byte[]{(byte)180,(byte)50,(byte)30});
            CellStyle optional     = buildHeaderStyle(wb, new byte[]{(byte)70,(byte)130,(byte)180});
            CellStyle dataStyle    = buildDataStyle(wb);
            CellStyle numberStyle  = buildNumberStyle(wb);
            CellStyle noteStyle    = buildNoteStyle(wb);
            CellStyle titleStyle   = buildTitleStyle(wb);
            CellStyle sectionStyle = buildSectionStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle newSpStyle   = buildHighlightStyle(wb);

            XSSFSheet data = wb.createSheet("Du lieu Phieu Nhap");
            data.setDefaultColumnWidth(18);
            data.setColumnWidth(1, 32 * 256);  // B: Tên SP
            data.setColumnWidth(4, 28 * 256);  // E: Ghi chú
            data.setColumnWidth(5, 20 * 256);  // F: Danh mục

            // Title
            Row titleRow = data.createRow(0);
            titleRow.setHeightInPoints(28);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("TEMPLATE IMPORT PHIEU NHAP KHO - NHA DAN SHOP");
            titleCell.setCellStyle(titleStyle);
            // Sub-title row 1 (hướng dẫn ngắn)
            Row subRow = data.createRow(1);
            subRow.setHeightInPoints(30);
            Cell subCell = subRow.createCell(0);
            subCell.setCellValue(
                "Do tim: Ma SP (cot A) → Ten SP (cot B). SP CHUA CO: de trong cot A, nhap Ten+DanhMuc+DonVi → he thong TU DONG TAO SP MOI.\n" +
                "Cot E=Chiet khau%, F=VAT%, G=Ghi chu, H=Danh muc (tao moi), I=Don vi (tao moi). Phi ship nhap tren web.");
            subCell.setCellStyle(noteStyle);
            // NOTE: merged regions phải khớp với số cột header bên dưới (9 cột → index 0..8)
            // Chỉ thêm 1 lần ở cuối để tránh overlap

            // Header — 8 cột (thêm E: Chiết khấu %)
            String[] hTexts = {
                "A: Ma SP", "B: Ten SP (*)", "C: So luong (*)", "D: Gia nhap (*)",
                "E: Chiet khau %", "F: VAT %", "G: Ghi chu dong",
                "H: Danh muc (neu tao moi)", "I: Don vi (neu tao moi)"
            };
            CellStyle[] hStyles = {
                headerStyle, required, required, required,
                optional, optional, headerStyle, optional, optional
            };

            Row hRow = data.createRow(2);
            hRow.setHeightInPoints(20);
            for (int i = 0; i < hTexts.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(hTexts[i]);
                c.setCellStyle(hStyles[i]);
            }

            data.setColumnWidth(1, 32 * 256);   // B: Tên SP
            data.setColumnWidth(5, 28 * 256);   // F: Ghi chú
            data.setColumnWidth(6, 22 * 256);   // G: Danh mục

            // ── Dummy data: mix SP có sẵn + SP mới + ví dụ chiết khấu ────────
            Object[][] rows = {
                // code, name, qty, unitCost, discountPct, vatPct, note, category(new), unit(new)
                {"BT001","Banh Trang Rong Bien",  10, 65000, 0,   0,   "SP co san",         "",           ""},
                {"BT002","Banh Trang Cuon Tep",    5, 38000, 5,   10,  "CK 5% VAT 10%",     "",           ""},
                {"M001", "Muoi Bien Khanh Hoa",   20,  5000, 10,  0,   "CK 10%",            "",           ""},
                {"",     "Com Chay Nam Huong",     3, 45000, 0,   8,   "Tim theo ten VAT8%","",           ""},
                {"",     "Banh Phong Tom Viet",    8, 12000, 0,   0,   "SP MOI",            "Banh Phong", "goi"},
                {"",     "Keo Dua Ben Tre",        5, 35000, 8.5, 10,  "SP MOI ck+vat",    "Keo Dua",    "hop"},
            };

            int rowNum = 3;
            for (Object[] r : rows) {
                Row row = data.createRow(rowNum++);
                boolean isNew = r[7] != null && !r[7].toString().isBlank();
                for (int col = 0; col < r.length; col++) {
                    Cell c = row.createCell(col);
                    if (r[col] instanceof Number) {
                        c.setCellValue(((Number) r[col]).doubleValue());
                        c.setCellStyle(isNew ? newSpStyle : numberStyle);
                    } else {
                        c.setCellValue(r[col] != null ? r[col].toString() : "");
                        c.setCellStyle(isNew ? newSpStyle : dataStyle);
                    }
                }
            }

            Row legendRow = data.createRow(rowNum + 1);
            Cell l1 = legendRow.createCell(0); l1.setCellValue("Mau xanh = SP da co / Tim theo ten"); l1.setCellStyle(dataStyle);
            Cell l2 = legendRow.createCell(4); l2.setCellValue("Mau vang = SP MOI tu dong tao");       l2.setCellStyle(newSpStyle);

            // Merged regions — chỉ gọi 1 lần, sau khi đã tạo xong rows
            data.addMergedRegion(new CellRangeAddress(0, 0, 0, 8)); // title: 9 cột (A..I)
            data.addMergedRegion(new CellRangeAddress(1, 1, 0, 8)); // sub-title
            data.setAutoFilter(new CellRangeAddress(2, 2, 0, 8));
            data.createFreezePane(0, 3);

            // ── Sheet 2: Hướng dẫn ───────────────────────────────────────────
            XSSFSheet guide = wb.createSheet("Huong dan");
            guide.setColumnWidth(0, 28 * 256);
            guide.setColumnWidth(1, 55 * 256);
            guide.setColumnWidth(2, 35 * 256);

            addGuideHeader(guide, wb, sectionStyle, noteStyle, dataStyle,
                "HUONG DAN IMPORT PHIEU NHAP KHO",
                new String[][]{
                    {"Cot","Mo ta","Vi du"},
                    {"A: Ma SP","Ma san pham (uu tien). De trong → tim ten SP (cot B)","BT001"},
                    {"B: Ten SP (*)","Ten san pham. SP CHUA CO → he thong tu tao moi","Banh Trang Rong Bien"},
                    {"C: So luong (*)","So luong nhap theo DV NHAP (kg/xau/hop/bich)","10"},
                    {"D: Gia nhap (*)","Gia tren 1 DV NHAP. He thong tu chia sang gia le","65000"},
                    {"E: Chiet khau %","% chiet khau NCC (0-100). De trong = 0%.\nGia sau CK = Gia nhap × (1 - CK/100)","5"},
                    {"F: VAT %","% thue GTGT (0-100). De trong = 0%.\nVAT duoc cong vao gia von cuoi de tinh loi nhuan dung.","10"},
                    {"G: Ghi chu","Ghi chu rieng tung dong (tuy chon)","Lo nhap thang 3"},
                    {"H: Danh muc","Chi can nhap khi SP MOI chua co trong he thong","Banh Trang"},
                    {"I: Don vi","Chi can nhap khi SP MOI. Don vi ban le: bich/goi/hop","bich"},
                    {"PHI SHIP","Nhap phi van chuyen tren giao dien web.\nHe thong chia theo ty le gia tri sau CK.","-"},
                    {"CONG THUC GIA VON","GiaVon = (GiaNhap/DV × (1-CK%)) + PhiShip/DV + VAT/DV\nDay la gia von chinh xac de tinh loi nhuan.","-"},
                    {"LUU Y","- 1 file = 1 phieu nhap | Nhap ten NCC + phi ship + ghi chu tren web\n- Khong nhap gia 0 hoac SL 0 → bao loi\n- 1 loi bat ky → rollback toan bo file","-"},
                }
            );

            wb.setActiveSheet(0);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
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

            // Title row 0
            Row titleRow = data.createRow(0);
            titleRow.setHeightInPoints(28);
            Cell tc = titleRow.createCell(0);
            tc.setCellValue("TEMPLATE IMPORT COMBO SAN PHAM - NHA DAN SHOP");
            tc.setCellStyle(titleStyle);

            // Sub-title row 1
            Row subRow = data.createRow(1);
            subRow.setHeightInPoints(36);
            Cell sc = subRow.createCell(0);
            sc.setCellValue(
                "Moi dong = 1 combo. Toi da 5 thanh phan/dong (cot F-O).\n" +
                "SP thanh phan phai la ma SP DON LE (SINGLE) da co trong he thong.\n" +
                "De trong cot A → tu dong sinh ma COMBO###. Cat ID: xem sheet Huong dan.");
            sc.setCellStyle(noteStyle);

            // Header row 2
            // Cột A-E: thông tin combo
            // Cột F-O: từng cặp (Mã SP, SL) × 5 thành phần
            String[] headers = {
                "A: Ma combo", "B: Ten combo (*)", "C: Gia ban (*)", "D: Don vi", "E: Cat.ID",
                "F: Ma SP 1 (*)", "G: SL 1 (*)",
                "H: Ma SP 2", "I: SL 2",
                "J: Ma SP 3", "K: SL 3",
                "L: Ma SP 4", "M: SL 4",
                "N: Ma SP 5", "O: SL 5"
            };
            CellStyle[] hStyles = {
                headerStyle, required, required, optional, optional,
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
            Object[][] rows = {
                {"", "Combo Banh Trang Dac Biet", 150000, "combo", "", "BT001", 5, "M001", 2, "", "", "", "", "", ""},
                {"", "Combo Muoi Goi To", 80000, "combo", "", "M001", 5, "M002", 1, "M003", 2, "", "", "", ""},
                {"COMBO_TEST", "Combo Thu Nghiem", 200000, "bo", "", "BT001", 3, "BT002", 2, "CC001", 1, "", "", "", ""},
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

            data.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 14));
            data.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(1, 1, 0, 14));
            data.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(2, 2, 0, 14));
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
                    {"F+G: SP 1", "Ma SP + So luong thanh phan 1. BAT BUOC it nhat 1 cap.", "BT001 | 5"},
                    {"H+I: SP 2", "Ma SP + So luong thanh phan 2 (tuy chon)", "M001 | 2"},
                    {"J+K...O: SP 3-5", "Tuong tu, toi da 5 thanh phan", ""},
                    {"LUU Y 1", "SP thanh phan PHAI LA SP DON LE (SINGLE) da co trong he thong", ""},
                    {"LUU Y 2", "Khong the them combo vao trong combo (khong long combo)", ""},
                    {"LUU Y 3", "1 dong loi → rollback toan bo file, khong tao combo nao", ""},
                    {"TON KHO AO", "stockQty combo = min(stockQty_SP / required_qty) moi thanh phan\nVD: BT001 ton 20, can 5 → co the ban 4 combo", ""},
                    {"GIA VON", "costPrice combo = Σ (costPrice_thanh_phan × qty)\nTu dong cap nhat moi khi nhap kho SP thanh phan", ""},
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
