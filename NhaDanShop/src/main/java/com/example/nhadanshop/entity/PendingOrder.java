package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Đơn hàng chờ xác nhận thanh toán online (chuyển khoản / MoMo / ZaloPay).
 * - Khi tạo: CHƯA trừ kho, CHƯA tạo invoice.
 * - Khi admin confirm: tạo SalesInvoice + trừ kho.
 * - Khi hủy (admin hủy hoặc hết hạn): không ảnh hưởng kho.
 */
@Entity
@Table(name = "pending_orders")
@Getter
@Setter
public class PendingOrder {

    public enum Status { PENDING_PAYMENT, WAITING_CONFIRM, CONFIRMED, PAID_AUTO, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_no", nullable = false, unique = true, length = 50)
    private String orderNo;

    @Column(name = "customer_id", length = 100)
    private String customerId;

    @Column(name = "customer_name", length = 150)
    private String customerName;

    @Column(name = "customer_phone", length = 30)
    private String customerPhone;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "payment_method", nullable = false, length = 20)
    private String paymentMethod;

    @Column(name = "payment_reference", length = 100)
    private String paymentReference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING_PAYMENT;

    @Column(name = "cancel_reason", length = 255)
    private String cancelReason;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

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

    /** Thời hạn xác nhận — mặc định 15 phút sau khi tạo */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /** Invoice được tạo sau khi admin confirm */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id")
    private SalesInvoice invoice;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "pendingOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PendingOrderItem> items = new ArrayList<>();

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (expiresAt == null) expiresAt = now.plusHours(12);
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
