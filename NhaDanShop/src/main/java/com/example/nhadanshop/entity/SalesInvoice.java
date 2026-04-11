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
        if (status == null) status = Status.COMPLETED;
    }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
