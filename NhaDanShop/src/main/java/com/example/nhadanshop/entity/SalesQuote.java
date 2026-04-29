package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "sales_quotes")
public class SalesQuote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, length = 36)
    private String publicId;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "consumed_invoice_id")
    private SalesInvoice consumedInvoice;

    /** When set, quote is reserved for this pending order until confirmation produces an invoice. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "consumed_pending_order_id")
    private PendingOrder consumedPendingOrder;

    @Column(name = "payload_json", nullable = false, columnDefinition = "text")
    private String payloadJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public boolean isExpired(java.time.Clock clock) {
        return expiresAt.isBefore(LocalDateTime.now(clock));
    }
}
