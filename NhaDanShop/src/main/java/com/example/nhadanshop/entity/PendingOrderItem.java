package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "pending_order_items")
@Getter
@Setter
public class PendingOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pending_order_id")
    private PendingOrder pendingOrder;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    /**
     * Biến thể đóng gói được đặt (Sprint 0).
     * Nullable để backward compat — backfill từ V23.
     */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "variant_id")
    private ProductVariant variant;

    @Column(name = "line_id", length = 100)
    private String lineId;

    @Column(name = "product_name_snapshot", length = 255)
    private String productNameSnapshot;

    @Column(name = "variant_name_snapshot", length = 255)
    private String variantNameSnapshot;

    @Column(nullable = false)
    private Integer quantity;

    /** Giá bán tại thời điểm đặt hàng */
    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "line_subtotal", nullable = false, precision = 18, scale = 2)
    private BigDecimal lineSubtotal;

    /** POS/trace snapshot optional batch at checkout snapshot time (pricing-independent). */
    @JoinColumn(name = "batch_id")
    @ManyToOne(fetch = FetchType.LAZY)
    private ProductBatch batch;

    @Column(name = "reward_line", nullable = false)
    private boolean rewardLine;

    /** Catalog/original unit snapshot — populated when revenue ({@link #unitPrice}) is zero (gift/free tier lines). */
    @Column(name = "original_unit_price", precision = 18, scale = 2)
    private BigDecimal originalUnitPrice;

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

    @Column(name = "allocated_loyalty_discount", precision = 18, scale = 2)
    private BigDecimal allocatedLoyaltyDiscount;

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
}
