package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Đơn vị nhập kho đã đăng ký cho 1 sản phẩm.
 *
 * Mục đích: lưu các quy tắc quy đổi "gợi ý mặc định" để:
 *   - Tự động điền vào form khi admin tạo phiếu nhập
 *   - Validate đơn vị hợp lệ khi import Excel
 *   - Hiển thị dropdown ĐV trong UI
 *
 * QUAN TRỌNG: Đây là "gợi ý mặc định", KHÔNG phải immutable rule.
 *   Giá trị thực tế (pieces thực sự dùng) được lưu vào snapshot
 *   inventory_receipt_items.pieces_used — không bao giờ thay đổi sau khi tạo.
 *   → Cập nhật pieces_per_unit chỉ ảnh hưởng phiếu nhập MỚI, không ảnh hưởng lịch sử.
 */
@Entity
@Table(
    name = "product_import_units",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_piu_product_unit",
        columnNames = {"product_id", "import_unit"}
    )
)
@Getter
@Setter
public class ProductImportUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Sản phẩm sở hữu quy tắc này */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /**
     * Đơn vị nhập kho: "kg", "xâu", "bịch", "hộp", "chai", "thùng"...
     * ATOMIC (pieces=1): bịch/hộp/chai/gói/hũ/lon/túi → 1 ĐV nhập = 1 ĐV bán
     * GỘP   (pieces>1): kg/xâu/thùng → 1 ĐV nhập = N ĐV bán
     */
    @Column(name = "import_unit", nullable = false, length = 20)
    private String importUnit;

    /**
     * Đơn vị bán lẻ tương ứng: "bịch", "gói", "hộp", "chai"...
     * Dùng để hiển thị trong form: "1 kg → 10 bịch"
     */
    @Column(name = "sell_unit", nullable = false, length = 20)
    private String sellUnit = "bich";

    /**
     * Gợi ý số đơn vị bán lẻ / 1 đơn vị nhập.
     *
     * VD: 1 kg = 10 bịch → pieces_per_unit = 10
     *     1 xâu = 7 bịch → pieces_per_unit = 7
     *     1 bịch = 1 bịch → pieces_per_unit = 1 (ATOMIC)
     *     1 thùng = 24 hộp → pieces_per_unit = 24
     *
     * CÓ THỂ THAY ĐỔI khi NCC đổi đóng gói (VD: từ 10 → 9 bịch/kg).
     * Thay đổi chỉ ảnh hưởng phiếu nhập tạo sau.
     * Phiếu nhập cũ dùng snapshot (pieces_used) — không bị ảnh hưởng.
     */
    @Column(name = "pieces_per_unit", nullable = false)
    private Integer piecesPerUnit = 1;

    /**
     * TRUE = đơn vị nhập chính — điền sẵn vào form khi tạo phiếu nhập.
     * Mỗi SP chỉ có đúng 1 default (enforced bởi unique partial index trong DB).
     */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    /** Ghi chú quy đổi: "1 kg = 10 bịch", "1 thùng = 24 hộp" */
    @Column(name = "note", length = 100)
    private String note;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ── Computed helpers ──────────────────────────────────────────────────────

    /**
     * Kiểm tra đơn vị này có phải ATOMIC không (pieces = 1).
     * ATOMIC: 1 ĐV nhập = 1 ĐV bán (bịch/hộp/chai/gói...)
     */
    public boolean isAtomic() {
        return piecesPerUnit == null || piecesPerUnit <= 1;
    }

    /** Label hiển thị: "kg → 10 bịch" hoặc "bịch (ATOMIC)" */
    public String getDisplayLabel() {
        if (isAtomic()) return importUnit + " (ATOMIC, 1:" + sellUnit + ")";
        return importUnit + " → " + piecesPerUnit + " " + sellUnit;
    }
}
