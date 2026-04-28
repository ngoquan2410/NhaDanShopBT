package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "vouchers")
public class Voucher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String code;

    @Column(name = "rule_summary", length = 500)
    private String ruleSummary;

    @Column(name = "is_active", nullable = false)
    private Boolean active = true;

    @Column(name = "min_subtotal", nullable = false, precision = 18, scale = 2)
    private BigDecimal minSubtotal = BigDecimal.ZERO;

    /** Percent discount on merchandise subtotal (e.g. 10 = 10%). */
    @Column(name = "percent", nullable = false, precision = 18, scale = 4)
    private BigDecimal percent = BigDecimal.ZERO;

    /** Max discount when {@link #percent} &gt; 0; 0 = no cap. */
    @Column(name = "cap", nullable = false, precision = 18, scale = 2)
    private BigDecimal cap = BigDecimal.ZERO;

    @Column(name = "fixed_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal fixedAmount = BigDecimal.ZERO;

    @Column(name = "free_shipping", nullable = false)
    private Boolean freeShipping = false;

    @Column(name = "start_at")
    private LocalDateTime startAt;

    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (active == null) active = true;
        if (minSubtotal == null) minSubtotal = BigDecimal.ZERO;
        if (percent == null) percent = BigDecimal.ZERO;
        if (cap == null) cap = BigDecimal.ZERO;
        if (fixedAmount == null) fixedAmount = BigDecimal.ZERO;
        if (freeShipping == null) freeShipping = false;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
