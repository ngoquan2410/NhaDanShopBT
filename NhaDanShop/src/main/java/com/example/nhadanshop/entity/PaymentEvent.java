package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "payment_events",
        uniqueConstraints = @UniqueConstraint(name = "uk_payment_events_provider_tx", columnNames = {"provider", "provider_tx_id"}),
        indexes = {
                @Index(name = "idx_payment_events_status_created", columnList = "status, created_at"),
                @Index(name = "idx_payment_events_matched_code", columnList = "matched_code"),
                @Index(name = "idx_payment_events_linked_order_code", columnList = "linked_order_code")
        }
)
@Getter
@Setter
public class PaymentEvent {

    public enum Status {
        UNMATCHED,
        MATCHED,
        IGNORED,
        LINKED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String provider;

    @Column(name = "provider_tx_id", nullable = false, length = 120)
    private String providerTxId;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(name = "transfer_content", length = 1000)
    private String transferContent;

    @Column(name = "matched_code", length = 50)
    private String matchedCode;

    @Column(name = "bank_account", length = 100)
    private String bankAccount;

    @Column(name = "bank_sub_acc", length = 100)
    private String bankSubAcc;

    @Column(name = "tx_time")
    private LocalDateTime txTime;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_pending_order_id")
    private PendingOrder linkedPendingOrder;

    @Column(name = "linked_order_code", length = 50)
    private String linkedOrderCode;

    @Column(name = "linked_at")
    private LocalDateTime linkedAt;

    @Column(name = "linked_by", length = 20)
    private String linkedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.UNMATCHED;

    @Column(name = "raw_payload", columnDefinition = "text")
    private String rawPayload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
