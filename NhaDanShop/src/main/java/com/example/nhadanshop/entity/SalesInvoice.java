package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "sales_invoices")
public class SalesInvoice {

    /** Trạng thái hóa đơn */
    public enum Status { COMPLETED, CANCELLED }
    public enum SourceType { POS, ONLINE_PENDING, MANUAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_no", nullable = false, unique = true, length = 50)
    private String invoiceNo;

    @Column(name = "invoice_date", nullable = false)
    private LocalDateTime invoiceDate;

    @Column(name = "customer_name", length = 150)
    private String customerName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Column(name = "customer_phone", length = 30)
    private String customerPhone;

    @Column(name = "payment_method", length = 20)
    private String paymentMethod;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(name = "promotion_id")
    private Long promotionId;

    @Column(name = "promotion_name", length = 200)
    private String promotionName;

    @Column(name = "discount_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal discountAmount = BigDecimal.ZERO;

    @Column(name = "loyalty_discount_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal loyaltyDiscountAmount = BigDecimal.ZERO;

    @Column(name = "loyalty_redeemed_points", nullable = false)
    private Long loyaltyRedeemedPoints = 0L;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 30)
    private SourceType sourceType = SourceType.POS;

    @Column(name = "pending_order_id")
    private Long pendingOrderId;

    @Column(name = "shipping_address_json", columnDefinition = "text")
    private String shippingAddressJson;

    @Column(name = "gift_lines_snapshot_json", columnDefinition = "text")
    private String giftLinesSnapshotJson;

    @Column(name = "promotion_snapshot_json", columnDefinition = "text")
    private String promotionSnapshotJson;

    @Column(name = "voucher_snapshot_json", columnDefinition = "text")
    private String voucherSnapshotJson;

    @Column(name = "shipping_quote_snapshot_json", columnDefinition = "text")
    private String shippingQuoteSnapshotJson;

    @Column(name = "pricing_breakdown_snapshot_json", columnDefinition = "text")
    private String pricingBreakdownSnapshotJson;

    @Column(name = "vat_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal vatPercent = BigDecimal.ZERO;

    // ── Soft Cancel fields ────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.COMPLETED;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancelled_by", length = 100)
    private String cancelledBy;

    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    // ── Audit fields ──────────────────────────────────────────────────────────
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesInvoiceItem> items = new ArrayList<>();

    public boolean isCancelled() { return Status.CANCELLED.equals(status); }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (invoiceDate == null) invoiceDate = now;
        if (createdAt  == null) createdAt  = now;
        if (updatedAt  == null) updatedAt  = now;
        if (totalAmount == null) totalAmount = BigDecimal.ZERO;
        if (discountAmount == null) discountAmount = BigDecimal.ZERO;
        if (loyaltyDiscountAmount == null) loyaltyDiscountAmount = BigDecimal.ZERO;
        if (loyaltyRedeemedPoints == null) loyaltyRedeemedPoints = 0L;
        if (status == null) status = Status.COMPLETED;
        if (sourceType == null) sourceType = SourceType.POS;
        if (vatPercent == null) vatPercent = BigDecimal.ZERO;
    }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
