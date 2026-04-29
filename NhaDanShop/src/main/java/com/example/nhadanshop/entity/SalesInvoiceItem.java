package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

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

    /** Zero-revenue reward/free line (Slice 6C); stock and COGS still apply. */
    @Column(name = "reward_line", nullable = false)
    private boolean rewardLine = false;

    @Column(name = "line_gross_amount", precision = 18, scale = 2)
    private BigDecimal lineGrossAmount;

    @Column(name = "line_own_discount_amount", precision = 18, scale = 2)
    private BigDecimal lineOwnDiscountAmount;

    @Column(name = "line_net_before_invoice_discount", precision = 18, scale = 2)
    private BigDecimal lineNetBeforeInvoiceDiscount;

    @Column(name = "allocated_manual_discount", precision = 18, scale = 2)
    private BigDecimal allocatedManualDiscount;

    @Column(name = "allocated_promotion_discount", precision = 18, scale = 2)
    private BigDecimal allocatedPromotionDiscount;

    @Column(name = "allocated_voucher_discount", precision = 18, scale = 2)
    private BigDecimal allocatedVoucherDiscount;

    @Column(name = "allocated_merchandise_discount", precision = 18, scale = 2)
    private BigDecimal allocatedMerchandiseDiscount;

    @Column(name = "line_net_revenue", precision = 18, scale = 2)
    private BigDecimal lineNetRevenue;

    @Column(name = "line_vat_base", precision = 18, scale = 2)
    private BigDecimal lineVatBase;

    @Column(name = "line_vat_amount", precision = 18, scale = 2)
    private BigDecimal lineVatAmount;

    @Column(name = "commercial_allocation_version")
    private Integer commercialAllocationVersion;

    @OneToMany(mappedBy = "invoiceItem", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesInvoiceItemBatchAllocation> batchAllocations = new ArrayList<>();
}


