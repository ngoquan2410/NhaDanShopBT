package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@Entity
@Table(
        name = "sales_invoice_items",
        indexes = @Index(name = "idx_sii_invoice_variant", columnList = "invoice_id, variant_id")
)
public class SalesInvoiceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private SalesInvoice invoice;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /**
     * Biến thể đóng gói bán cho dòng này (Sprint 0).
     * Nullable để backward compat — backfill từ V23.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "variant_id")
    private ProductVariant variant;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /** Giá bán gốc (trước chiết khấu dòng) */
    @Column(name = "original_unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal originalUnitPrice = BigDecimal.ZERO;

    /** Chiết khấu % trên dòng này (0–100) */
    @Column(name = "line_discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal lineDiscountPercent = BigDecimal.ZERO;

    /** Giá bán thực tế (sau chiết khấu dòng = originalUnitPrice × (1 - lineDiscount/100)) */
    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "unit_cost_snapshot", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitCostSnapshot = BigDecimal.ZERO;

    /**
     * ID của combo cha nếu item này được khai triển từ combo (KiotViet model).
     * NULL = bán lẻ thông thường.
     * NOT NULL = item này là thành phần được expand ra từ combo có ID này.
     */
    @Column(name = "combo_source_id")
    private Long comboSourceId;

    /**
     * Giá bán của combo tại thời điểm giao dịch (snapshot).
     * Chỉ có giá trị khi comboSourceId != null.
     */
    @Column(name = "combo_unit_price", precision = 18, scale = 2)
    private BigDecimal comboUnitPrice;
}


