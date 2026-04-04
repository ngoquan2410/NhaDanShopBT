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
     * Columns A-L (12 cột):
     *   A-code | B-name | C-quantity | D-unitCost | E-sellPrice |
     *   F-discountPct | G-note | H-category(mới) | I-unit(mới) |
     *   J-importUnit | K-sellUnit | L-piecesPerImportUnit
     */
    public byte[] buildReceiptTemplate() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {

            CellStyle headerStyle  = buildHeaderStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle required     = buildHeaderStyle(wb, new byte[]{(byte)180,(byte)50,(byte)30});
            CellStyle optional     = buildHeaderStyle(wb, new byte[]{(byte)70,(byte)130,(byte)180});
            CellStyle sellStyle    = buildHeaderStyle(wb, new byte[]{(byte)0,(byte)120,(byte)160}); // cyan: giá bán
            CellStyle unitStyle    = buildHeaderStyle(wb, new byte[]{(byte)120,(byte)80,(byte)0});  // brown: đơn vị
            CellStyle dataStyle    = buildDataStyle(wb);
            CellStyle numberStyle  = buildNumberStyle(wb);
            CellStyle noteStyle    = buildNoteStyle(wb);
            CellStyle titleStyle   = buildTitleStyle(wb);
            CellStyle sectionStyle = buildSectionStyle(wb, new byte[]{(byte)0,(byte)100,(byte)0});
            CellStyle newSpStyle   = buildHighlightStyle(wb);

            XSSFSheet data = wb.createSheet("Du lieu Phieu Nhap");
            data.setDefaultColumnWidth(15);
            data.setColumnWidth(1, 32 * 256);  // B: Tên SP
            data.setColumnWidth(6, 28 * 256);  // G: Ghi chú
            data.setColumnWidth(7, 22 * 256);  // H: Danh mục
            data.setColumnWidth(9, 14 * 256);  // J: ĐV nhập
            data.setColumnWidth(10, 14 * 256); // K: ĐV bán
            data.setColumnWidth(11, 14 * 256); // L: Số lẻ/ĐV

            // Title row 0
            Row titleRow = data.createRow(0);
            titleRow.setHeightInPoints(28);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("TEMPLATE IMPORT PHIEU NHAP KHO - NHA DAN SHOP (12 COT A-L)");
            titleCell.setCellStyle(titleStyle);

            // Sub-title row 1
            Row subRow = data.createRow(1);
            subRow.setHeightInPoints(50);
            Cell subCell = subRow.createCell(0);
            subCell.setCellValue(
                "Do tim: Ma SP (cot A) → Ten SP (cot B). SP CHUA CO: de trong A, dien B+H+I → HE THONG TU TAO SP MOI.\n" +
                "E=Gia ban, F=CK%, G=Ghi chu, H=DanhMuc, I=DonVi. " +
                "J=DV_Nhap (kg/xau/bich), K=DV_Ban (bich/goi), L=SoLe (1kg=10bich → L=10). " +
                "J/K/L chi ap dung SP MOI hoac SP chua co lo hang. VAT% va PhiShip nhap tren web.");
            subCell.setCellStyle(noteStyle);

            // Header row 2 — 12 cột A..L
            String[] hTexts = {
                "A: Ma SP", "B: Ten SP (*)", "C: So luong (*)", "D: Gia nhap (*)",
                "E: Gia ban", "F: Chiet khau %", "G: Ghi chu dong",
                "H: Danh muc (SP moi)", "I: Don vi (SP moi)",
                "J: DV Nhap kho", "K: DV Ban le", "L: So le/DV"
            };
            CellStyle[] hStyles = {
                headerStyle, required, required, required,
                sellStyle, optional, headerStyle,
                optional, optional,
                unitStyle, unitStyle, unitStyle
            };

            Row hRow = data.createRow(2);
            hRow.setHeightInPoints(20);
            for (int i = 0; i < hTexts.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(hTexts[i]);
                c.setCellStyle(hStyles[i]);
            }

            // ── Dummy data 12 cột A-L ────────────────────────────────────────
            // code,name,qty,unitCost,sellPrice,discountPct,note,category(H),unit(I),importUnit(J),sellUnit(K),pieces(L)
            Object[][] rows = {
                // SP đã có — J,K,L điền nếu SP chưa có lô (hệ thống kiểm tra tự động)
                {"BT001","Banh Trang Rong Bien", 1, 65000,  90000, 0,   "SP co san - 1kg=10bich", "",           "",    "kg",  "bich", 10},
                {"BT002","Banh Trang Cuon Tep",  5, 38000,  55000, 5,   "CK 5% - nhap hop",       "",           "",    "",    "",     ""},
                {"M001", "Muoi Bien Khanh Hoa", 20,  5000,   8000, 10,  "CK 10%",                 "",           "",    "",    "",     ""},
                // SP tìm theo tên
                {"",    "Com Chay Nam Huong",    3, 45000,  65000, 0,   "Tim theo ten SP",        "",           "",    "",    "",     ""},
                // SP mới — bắt buộc điền H,I; nên điền J,K,L nếu muốn cấu hình đơn vị ngay
                {"",    "Banh Phong Tom Viet",   8, 12000,  18000, 0,   "SP MOI - nhap goi",      "Banh Phong", "goi", "goi", "goi",  1},
                {"",    "Keo Dua Ben Tre XYZ",   2, 35000,  50000, 8.5, "SP MOI - 1xau=7bich",   "Keo Dua",    "bich","xau", "bich", 7},
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
            Cell l1 = legendRow.createCell(0);
            l1.setCellValue("Mau xanh = SP da co / Tim theo ten"); l1.setCellStyle(dataStyle);
            Cell l2 = legendRow.createCell(7);
            l2.setCellValue("Mau vang = SP MOI tu dong tao"); l2.setCellStyle(newSpStyle);
            Cell l3 = legendRow.createCell(9);
            l3.setCellValue("J/K/L: SP moi hoac SP chua co lo hang"); l3.setCellStyle(dataStyle);

            // Merged regions — 12 cột (A..L = 0..11)
            data.addMergedRegion(new CellRangeAddress(0, 0, 0, 11));
            data.addMergedRegion(new CellRangeAddress(1, 1, 0, 11));
            data.setAutoFilter(new CellRangeAddress(2, 2, 0, 11));
            data.createFreezePane(0, 3);

            // ── Sheet 2: Hướng dẫn ───────────────────────────────────────────
            XSSFSheet guide = wb.createSheet("Huong dan");
            guide.setColumnWidth(0, 28 * 256);
            guide.setColumnWidth(1, 65 * 256);
            guide.setColumnWidth(2, 28 * 256);

            addGuideHeader(guide, wb, sectionStyle, noteStyle, dataStyle,
                "HUONG DAN IMPORT PHIEU NHAP KHO (12 COT A-L)",
                new String[][]{
                    {"Cot","Mo ta","Vi du"},
                    {"A: Ma SP","Ma san pham (uu tien). De trong → tim theo ten (cot B)","BT001"},
                    {"B: Ten SP (*)","Ten san pham. SP CHUA CO → he thong tu tao moi","Banh Trang Rong Bien"},
                    {"C: So luong (*)","So luong nhap theo DV NHAP (kg/xau/hop/bich/chai)","10"},
                    {"D: Gia nhap (*)","Gia tren 1 DV NHAP. He thong tu chia sang gia le","65000"},
                    {"E: Gia ban","(TUY CHON) Gia ban moi → cap nhat sell_price SP.\nDe trong = giu nguyen gia ban cu.","90000"},
                    {"F: Chiet khau %","% chiet khau NCC (0-100). De trong = 0%.","5"},
                    {"G: Ghi chu","Ghi chu tung dong (tuy chon)","Lo nhap thang 3"},
                    {"H: Danh muc","Chi dien khi SP MOI chua co trong he thong.","Banh Trang"},
                    {"I: Don vi","Chi dien khi SP MOI. Don vi chung: bich/goi/hop/chai","bich"},
                    {"J: DV Nhap kho","(TUY CHON) Don vi NHAP tu NCC.\n" +
                     "ATOMIC (khong chia): bich, hop, chai, goi, hu, lon, tui\n" +
                     "  → qty ban = qty nhap (khong nhan pieces)\n" +
                     "GOP (chia ra le): kg, xau, 5xau, thung...\n" +
                     "  → qty ban = qty nhap x L (so le)\n" +
                     "Chi ap dung cho SP MOI hoac SP chua co lo hang.","kg"},
                    {"K: DV Ban le","(TUY CHON) Don vi ban cho khach: bich/goi/hop/chai.\n" +
                     "Chi ap dung cho SP MOI hoac SP chua co lo hang.","bich"},
                    {"L: So le/DV nhap","(TUY CHON) So DV ban tu 1 DV nhap.\n" +
                     "VD: 1kg = 10bich → L=10 | 1xau = 7bich → L=7.\n" +
                     "Neu J la ATOMIC (bich/hop/chai...) → L bi bo qua, luon = 1.\n" +
                     "Chi ap dung cho SP MOI hoac SP chua co lo hang.","10"},
                    {"J/K/L - CANH BAO","NEU SP DA CO LO HANG (da nhap kho truoc): J, K, L bi BO QUA.\n" +
                     "Ly do: thay doi importUnit/pieces sau khi co lo se lam SAI cong thuc:\n" +
                     "  sumReceivedQty dung gia tri MOI de tinh lai lich su → ton kho sai.\n" +
                     "  Muon thay doi: vao Quan ly San pham → Sua truc tiep.","-"},
                    {"CONG THUC TON KHO","ATOMIC: stockQty += qty_nhap (khong x pieces)\n" +
                     "GOP: stockQty += qty_nhap x L","-"},
                    {"CONG THUC GIA VON","ATOMIC: costPerUnit = unitCost\n" +
                     "GOP: costPerUnit = unitCost / L\n" +
                     "finalCost = costPerUnit x (1-CK%) + ship/unit + VAT/unit","-"},
                    {"LOI NHUAN","profit = unitPrice_ban - unitCostSnapshot\n" +
                     "unitCostSnapshot = FEFO avg cost luc ban (tu batch)\n" +
                     "Thay doi importUnit/pieces KHONG anh huong loi nhuan lich su.","-"},
                    {"VAT% (WEB)","Nhap % VAT tren form web khi upload file.\n" +
                     "vatAmount = tong_sau_CK x vat%. Chia theo ty le gia tri.","10"},
                    {"PHI SHIP (WEB)","Nhap phi van chuyen tren form web.\n" +
                     "Chia theo ty le gia tri sau CK.","-"},
                    {"COMBO","Nhap ma combo (VD: COMBO001) vao cot A.\n" +
                     "He thong tu expand thanh cac SP thanh phan.","-"},
                    {"LUU Y CHUNG","1 file = 1 phieu nhap. Nhap NCC + ship + VAT tren web.\n" +
                     "1 loi bat ky → rollback toan bo, khong luu gi.\n" +
                     "Cot A (Ma SP): BAT BUOC nhap tay, he thong KHONG tu sinh ma.","-"},
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
