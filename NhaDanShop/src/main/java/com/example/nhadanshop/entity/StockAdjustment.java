package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "stock_adjustments")
@Getter
@Setter
public class StockAdjustment {

    public enum Reason { EXPIRED, DAMAGED, LOST, STOCKTAKE, PERIODIC_STOCKTAKE, WRONG_RECEIPT, OTHER }
    public enum Status { DRAFT, CONFIRMED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "adj_no", nullable = false, unique = true, length = 50)
    private String adjNo;

    @Column(name = "adj_date", nullable = false)
    private LocalDateTime adjDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false, length = 50)
    private Reason reason;

    @Column(name = "note", length = 500)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.DRAFT;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirmed_by")
    private User confirmedBy;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @OneToMany(mappedBy = "adjustment", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<StockAdjustmentItem> items = new ArrayList<>();

    /** When this (original) was reversed: timestamp of the reversal. */
    @Column(name = "reversed_at")
    private LocalDateTime reversedAt;

    /** When this (original) was reversed: who performed it (VARCHAR, optional in request or username). */
    @Column(name = "reversed_by", length = 100)
    private String reversedBy;

    @Column(name = "reversal_reason", columnDefinition = "TEXT")
    private String reversalReason;

    /** On original: points to the new reversal document. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reversal_adjustment_id")
    private StockAdjustment reversalAdjustment;

    /** On reversal document: points to the original being reversed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reverses_adjustment_id")
    private StockAdjustment reversesOriginal;

    @PrePersist
    void prePersist() {
        if (adjDate  == null) adjDate  = LocalDateTime.now();
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (updatedAt == null) updatedAt = LocalDateTime.now();
        if (status == null) status = Status.DRAFT;
    }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
