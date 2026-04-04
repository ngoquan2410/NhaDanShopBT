package com.example.nhadanshop.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Set;

/**
 * Quy tắc quy đổi đơn vị nhập → đơn vị bán lẻ.
 *
 * ======= THIẾT KẾ MỚI (sau Bước 1 + Bước 2) =======
 *
 * Trước đây: ATOMIC được hardcode = {"bịch","hộp","chai"}
 *   → Không linh hoạt, không mở rộng được
 *
 * Bây giờ: ATOMIC = pieces_per_unit <= 1
 *   → Bất kỳ đơn vị nào có pieces=1 đều là ATOMIC
 *   → Không phụ thuộc tên đơn vị
 *   → VD: "gói"(1), "hũ"(1), "lon"(1) đều ATOMIC dù không trong set cũ
 *   → VD: "thùng"(24), "kg"(10), "xâu"(7) đều GOP
 *
 * Source of truth:
 *   - pieces đến từ inventory_receipt_items.pieces_used (snapshot bất biến)
 *   - KHÔNG dùng product.pieces_per_import_unit trực tiếp nữa
 *
 * ===================================================
 */
public final class UnitConverter {

    private UnitConverter() {}

    // Giữ lại set cũ để tương thích ngược với code legacy chưa migration
    @Deprecated
    private static final Set<String> LEGACY_ATOMIC_UNITS = Set.of(
            "bich", "bịch", "hop", "hộp", "chai",
            "goi", "gói", "hu", "hũ", "lon", "lọn", "tui", "túi"
    );

    /**
     * [MỚI - Bước 1] Tính retail qty dùng pieces snapshot.
     * pieces <= 1 = ATOMIC, pieces > 1 = GOP.
     *
     * @param pieces    snapshot pieces_used từ receipt_item (hoặc gợi ý từ product_import_units)
     * @param importQty số lượng nhập theo ĐV nhập
     * @return số ĐV bán lẻ thực tế
     */
    public static int toRetailQty(int pieces, int importQty) {
        return (pieces <= 1) ? importQty : importQty * pieces;
    }

    /**
     * [MỚI - Bước 1] Tính giá vốn / 1 ĐV bán lẻ từ giá nhập.
     * ATOMIC: costPerRetail = unitCost (không chia)
     * GOP:    costPerRetail = unitCost / pieces
     *
     * @param unitCost  giá nhập / 1 ĐV nhập
     * @param pieces    snapshot pieces_used
     * @return giá vốn / 1 ĐV bán lẻ
     */
    public static BigDecimal costPerRetailUnit(BigDecimal unitCost, int pieces) {
        if (pieces <= 1) return unitCost;
        return unitCost.divide(BigDecimal.valueOf(pieces), 4, RoundingMode.HALF_UP);
    }

    /**
     * [LEGACY - Tương thích ngược] Dùng importUnit string + pieces.
     * Fallback về set cũ nếu pieces null/0.
     *
     * @deprecated Dùng {@link #toRetailQty(int, int)} với pieces từ snapshot thay thế.
     */
    @Deprecated
    public static int toRetailQty(String importUnit, Integer piecesPerImportUnit, int importQty) {
        int pieces = effectivePieces(importUnit, piecesPerImportUnit);
        return toRetailQty(pieces, importQty);
    }

    /**
     * [LEGACY - Tương thích ngược] Kiểm tra ATOMIC theo tên ĐV (fallback).
     * Ưu tiên pieces=1. Nếu pieces null → check tên trong legacy set.
     *
     * @deprecated Dùng pieces <= 1 trực tiếp thay thế.
     */
    @Deprecated
    public static boolean isAtomicUnit(String importUnit) {
        if (importUnit == null || importUnit.isBlank()) return false;
        return LEGACY_ATOMIC_UNITS.contains(importUnit.trim().toLowerCase());
    }

    /**
     * [LEGACY - Tương thích ngược] Tính effective pieces từ importUnit + piecesPerImportUnit.
     * Nếu importUnit là ATOMIC (legacy set) → trả về 1 bất kể pieces.
     *
     * @deprecated Dùng pieces từ snapshot (ProductImportUnit.piecesPerUnit) thay thế.
     */
    @Deprecated
    public static int effectivePieces(String importUnit, Integer piecesPerImportUnit) {
        if (importUnit != null && LEGACY_ATOMIC_UNITS.contains(importUnit.trim().toLowerCase())) {
            return 1;
        }
        return (piecesPerImportUnit != null && piecesPerImportUnit > 1) ? piecesPerImportUnit : 1;
    }
}
