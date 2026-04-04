package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Biến thể đóng gói của sản phẩm (Product Variant).
 *
 * Ví dụ: SP gốc "Muối Biển ABC" có 2 variant:
 *   - ABC-HU100: Muối Hủ 100g | 1kg→10hủ | bán 12.000₫/hủ | tồn 10 hủ
 *   - ABC-GOI50: Muối Gói 50g | 1kg→20gói | bán 7.000₫/gói | tồn 20 gói
 *
 * Mỗi variant là "đơn vị giao dịch" độc lập:
 *   - Mã riêng (variant_code) — dùng barcode, tìm kiếm
 *   - Giá riêng (sell_price, cost_price)
 *   - Tồn kho riêng (stock_qty)
 *   - Lô hàng riêng (product_batches.variant_id) → FEFO đúng
 *
 * Với SP chỉ có 1 cách đóng gói → tạo 1 default variant (variant_code = product.code).
 * UI và API backward compat: nếu không truyền variantId → dùng default variant.
 */
@Entity
@Table(
    name = "product_variants",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_variant_code",
        columnNames = {"variant_code"}
    )
)
@Getter
@Setter
public class ProductVariant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** SP gốc sở hữu variant này */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /**
     * Mã bán hàng của variant: "ABC-HU100", "ABC-GOI50".
     * Với SP chỉ có 1 variant → variant_code = product.code (backward compat).
     */
    @Column(name = "variant_code", nullable = false, length = 60)
    private String variantCode;

    /** Tên hiển thị: "Muối Hủ 100g", "Muối Gói 50g" */
    @Column(name = "variant_name", nullable = false, length = 200)
    private String variantName;

    /**
     * Đơn vị bán lẻ: "hủ", "gói", "bịch", "chai", "kg"...
     * Đây là đơn vị tồn kho và giao dịch của variant này.
     */
    @Column(name = "sell_unit", nullable = false, length = 20)
    private String sellUnit = "cai";

    /**
     * Đơn vị nhập kho: "kg", "xâu", "thùng"...
     * Khi nhập hàng theo đơn vị này → quy đổi ra sell_unit theo pieces_per_unit.
     */
    @Column(name = "import_unit", length = 20)
    private String importUnit;

    /**
     * Số đơn vị bán lẻ / 1 đơn vị nhập.
     * VD: 1 kg = 10 hủ → pieces_per_unit = 10
     *     1 bịch = 1 bịch → pieces_per_unit = 1 (ATOMIC)
     *
     * Đây là GỢI Ý MẶC ĐỊNH. Giá trị thực tế mỗi lần nhập được lưu
     * vào inventory_receipt_items.pieces_used (snapshot bất biến).
     */
    @Column(name = "pieces_per_unit", nullable = false)
    private Integer piecesPerUnit = 1;

    /** Giá bán lẻ (đơn vị: sell_unit) */
    @Column(name = "sell_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal sellPrice = BigDecimal.ZERO;

    /**
     * Giá vốn hiện tại (đơn vị: sell_unit).
     * Cập nhật mỗi lần nhập kho theo FIFO weighted average.
     * Snapshot tại thời điểm bán được lưu vào sales_invoice_items.unit_cost_snapshot.
     */
    @Column(name = "cost_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal costPrice = BigDecimal.ZERO;

    /** Tồn kho (đơn vị: sell_unit). Tăng khi nhập, giảm khi bán. */
    @Column(name = "stock_qty", nullable = false)
    private Integer stockQty = 0;

    /**
     * Ngưỡng tồn kho tối thiểu — cảnh báo khi stock_qty < min_stock_qty.
     * Default = 5. Có thể config per variant.
     */
    @Column(name = "min_stock_qty", nullable = false)
    private Integer minStockQty = 5;

    /** Số ngày sử dụng kể từ ngày nhập → tính ngày hết hạn của batch */
    @Column(name = "expiry_days")
    private Integer expiryDays;

    @Column(name = "is_active", nullable = false)
    private Boolean active = true;

    /**
     * TRUE = variant mặc định của SP này.
     * Khi không chỉ định variantId → tự động dùng default variant.
     * Mỗi SP chỉ có 1 default (enforced bởi uq_pv_default partial index).
     */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    /** Ghi chú quy đổi: "1 kg = 10 hủ 100g" */
    @Column(name = "conversion_note", length = 100)
    private String conversionNote;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ── Computed helpers ──────────────────────────────────────────────────────

    /** ATOMIC: 1 ĐV nhập = 1 ĐV bán (không chia nhỏ) */
    public boolean isAtomic() {
        return piecesPerUnit == null || piecesPerUnit <= 1;
    }

    /** Sắp hết hàng? */
    public boolean isLowStock() {
        return stockQty != null && minStockQty != null && stockQty <= minStockQty;
    }

    /** Label hiển thị: "ABC-HU100 (hủ)" */
    public String getDisplayLabel() {
        return variantCode + " (" + sellUnit + ")";
    }
}
