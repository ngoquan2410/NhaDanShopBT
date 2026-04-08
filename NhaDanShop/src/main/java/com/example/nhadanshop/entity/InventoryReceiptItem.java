package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@Setter
@Entity
@Table(
        name = "inventory_receipt_items",
        indexes = @Index(name = "idx_iri_receipt_variant", columnList = "receipt_id, variant_id")
)
public class InventoryReceiptItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private InventoryReceipt receipt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /**
     * Biến thể đóng gói thực tế của dòng này (Sprint 0).
     * Nullable để backward compat — backfill từ V23.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "variant_id")
    private ProductVariant variant;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /** Giá nhập gốc (chưa chiết khấu) */
    @Column(name = "unit_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitCost;

    /** Chiết khấu % nhà cung cấp cho dòng sản phẩm này (0-100) */
    @Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPercent = BigDecimal.ZERO;

    /** Giá nhập sau khi áp dụng chiết khấu (unitCost * (1 - discountPercent/100)) */
    @Column(name = "discounted_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal discountedCost = BigDecimal.ZERO;

    /** Phần phí vận chuyển được phân bổ cho dòng này */
    @Column(name = "shipping_allocated", nullable = false, precision = 18, scale = 2)
    private BigDecimal shippingAllocated = BigDecimal.ZERO;

    /** VAT % áp dụng cho dòng này (0–100), admin nhập tay */
    @Column(name = "vat_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal vatPercent = BigDecimal.ZERO;

    /** Phần VAT được phân bổ vào giá vốn/đơn vị bán lẻ */
    @Column(name = "vat_allocated", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAllocated = BigDecimal.ZERO;

    /** Giá vốn cuối = discountedCost + shippingAllocated + vatAllocated */
    @Column(name = "final_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal finalCost = BigDecimal.ZERO;

    /** Alias sau khi cộng VAT (= finalCost, dùng để phân biệt với finalCost trước VAT) */
    @Column(name = "final_cost_with_vat", nullable = false, precision = 18, scale = 2)
    private BigDecimal finalCostWithVat = BigDecimal.ZERO;

    // ── Snapshot đơn vị nhập — Bước 1 ──────────────────────────────────────
    // Bất biến sau khi tạo phiếu nhập. Source of truth cho tồn kho + giá vốn.

    /**
     * Đơn vị nhập thực tế của dòng này: "kg", "xâu", "bịch", "hộp"...
     * Snapshot tại thời điểm tạo phiếu — KHÔNG thay đổi sau khi tạo.
     * Lý do: product.importUnit có thể thay đổi → snapshot đảm bảo lịch sử luôn đúng.
     */
    @Column(name = "import_unit_used", length = 20)
    private String importUnitUsed;

    /**
     * Số ĐV bán lẻ / 1 ĐV nhập — snapshot thực tế của lần nhập này.
     * VD: lần này kg=10 bịch → pieces_used=10; lần sau kg=9 bịch → pieces_used=9
     * Snapshot bất biến → tồn kho và giá vốn lịch sử luôn đúng dù NCC đổi đóng gói.
     */
    @Column(name = "pieces_used", nullable = false)
    private Integer piecesUsed = 1;

    /**
     * Số ĐV bán lẻ thực tế đã cộng vào stockQty = quantity × pieces_used.
     * ATOMIC: retail_qty_added = quantity (không nhân).
     * GOP:    retail_qty_added = quantity × pieces_used.
     * Lưu để tiện audit, không cần tính lại từ quantity × pieces.
     */
    @Column(name = "retail_qty_added", nullable = false)
    private Integer retailQtyAdded = 0;

    /**
     * Ngày HSD thực tế ghi đè (Sprint 1 — S1-2).
     * null → tự tính từ variant.expiryDays.
     * Nếu có → productBatch.expiry_date = giá trị này (FEFO chính xác).
     */
    @Column(name = "expiry_date_override")
    private LocalDate expiryDateOverride;
}
