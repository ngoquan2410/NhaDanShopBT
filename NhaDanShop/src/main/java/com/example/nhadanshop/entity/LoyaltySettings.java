package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "loyalty_settings")
public class LoyaltySettings {
    @Id
    private Long id = 1L;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(name = "earn_money_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal earnMoneyAmount = BigDecimal.valueOf(1000);

    @Column(name = "earn_points", nullable = false)
    private Long earnPoints = 1L;

    @Column(name = "redeem_value_per_point", nullable = false, precision = 18, scale = 2)
    private BigDecimal redeemValuePerPoint = BigDecimal.ONE;

    @Column(name = "minimum_redeem_points", nullable = false)
    private Long minimumRedeemPoints = 1L;

    @Column(name = "max_redeem_percent", precision = 5, scale = 2)
    private BigDecimal maxRedeemPercent;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
