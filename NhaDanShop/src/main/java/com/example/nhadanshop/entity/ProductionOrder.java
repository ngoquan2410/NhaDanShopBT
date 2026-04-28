package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "production_orders")
@Getter
@Setter
@NoArgsConstructor
public class ProductionOrder {

    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_VOIDED = "voided";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_no", nullable = false, unique = true, length = 50)
    private String orderNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id")
    private ProductionRecipe recipe;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "output_product_id")
    private Product outputProduct;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "output_variant_id")
    private ProductVariant outputVariant;

    @Column(name = "output_qty", nullable = false)
    private Integer outputQty;

    @Column(name = "output_must_be_sellable", nullable = false)
    private Boolean outputMustBeSellable;

    @Column(name = "overhead_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal overheadCost = BigDecimal.ZERO;

    /** Immutable JSON snapshot at completion time */
    @Column(name = "recipe_snapshot_json", nullable = false, columnDefinition = "TEXT")
    private String recipeSnapshotJson;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "output_batch_id")
    private ProductBatch outputBatch;

    @Column(name = "output_unit_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal outputUnitCost;

    @Column(name = "output_expiry_date", nullable = false)
    private LocalDate outputExpiryDate;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "voided_at")
    private LocalDateTime voidedAt;

    @Column(name = "void_reason", columnDefinition = "TEXT")
    private String voidReason;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
