package com.example.nhadanshop.service;

import java.util.Set;

/**
 * Quy tắc quy đổi đơn vị nhập → đơn vị bán lẻ (bịch).
 *
 * ======= QUY ƯỚC KINH DOANH =======
 * ATOMIC (đơn vị cuối, không chia):
 *   "bịch" (bich)  → 1 bịch nhập = 1 bịch bán
 *   "hộp"  (hop)   → 1 hộp nhập  = 1 hộp bán  (hộp = đơn vị đóng gói cuối)
 *   "chai"         → 1 chai nhập = 1 chai bán
 *
 * GỘP (cần chia ra bịch):
 *   "kg"           → 1 kg  = 10 bịch (piecesPerImportUnit = 10)
 *   "xâu" (xau)   → 1 xâu = 5-7 bịch (piecesPerImportUnit = 5..7)
 *   "5 xâu"       → nhập theo cụm xâu, piecesPerImportUnit xác định số bịch
 *
 * Lưu ý: "hộp" ở đây là hộp đóng gói BÁN, không phải thùng hàng.
 * Mỗi hộp = 1 đơn vị bán, không chia nhỏ hơn.
 * ===================================
 */
public final class UnitConverter {

    private UnitConverter() {}

    /**
     * Danh sách đơn vị ATOMIC — không thể chia nhỏ hơn.
     * 1 đơn vị nhập = 1 đơn vị bán lẻ.
     */
    private static final Set<String> ATOMIC_UNITS = Set.of(
            "bich", "bịch",   // bịch lẻ
            "hop",  "hộp",    // hộp đóng gói
            "chai"            // chai
    );

    /**
     * Kiểm tra importUnit có phải đơn vị cuối cùng (atomic) không.
     */
    public static boolean isAtomicUnit(String importUnit) {
        if (importUnit == null || importUnit.isBlank()) return false;
        return ATOMIC_UNITS.contains(importUnit.trim().toLowerCase());
    }

    /**
     * Tính số đơn vị bán lẻ từ số lượng nhập.
     *
     * @param importUnit          đơn vị nhập (kg, xâu, bịch, hộp, chai...)
     * @param piecesPerImportUnit số bịch quy đổi từ 1 đơn vị nhập (chỉ dùng khi không atomic)
     * @param importQty           số lượng nhập (theo importUnit)
     * @return số đơn vị bán lẻ thực tế
     *
     * Ví dụ:
     *   toRetailQty("bich", 1,  10) = 10   (10 bịch nhập = 10 bịch bán)
     *   toRetailQty("hop",  2,  5)  = 5    (5 hộp nhập = 5 hộp bán, BỎ QUA pieces=2)
     *   toRetailQty("chai", 1,  10) = 10   (10 chai nhập = 10 chai bán)
     *   toRetailQty("kg",   10, 1)  = 10   (1 kg nhập = 10 bịch bán)
     *   toRetailQty("xau",  7,  2)  = 14   (2 xâu nhập = 14 bịch bán)
     */
    public static int toRetailQty(String importUnit, Integer piecesPerImportUnit, int importQty) {
        if (isAtomicUnit(importUnit)) {
            // Đơn vị cuối: 1 bịch/hộp/chai nhập = 1 đơn vị bán, không nhân
            return importQty;
        }
        // Đơn vị gộp (kg, xâu...): nhân theo quy đổi
        int pieces = (piecesPerImportUnit != null && piecesPerImportUnit > 1)
                ? piecesPerImportUnit : 1;
        return importQty * pieces;
    }

    /**
     * Lấy effective pieces (dùng trong tính toán report).
     * Nếu importUnit là atomic → trả về 1.
     */
    public static int effectivePieces(String importUnit, Integer piecesPerImportUnit) {
        if (isAtomicUnit(importUnit)) return 1;
        return (piecesPerImportUnit != null && piecesPerImportUnit > 1)
                ? piecesPerImportUnit : 1;
    }
}
