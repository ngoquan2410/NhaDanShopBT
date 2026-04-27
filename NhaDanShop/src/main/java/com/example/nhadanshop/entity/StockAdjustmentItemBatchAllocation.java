package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Per-batch effect of a stock adjustment line (signed qty_delta; positive = increase batch remaining).
 * Written on confirm (post V16) and on reversal. Not {@link com.example.nhadanshop.entity.InventoryMovement}.
 */
@Entity
@Table(name = "stock_adjustment_item_batch_allocations")
@Getter
@Setter
public class StockAdjustmentItemBatchAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "adjustment_item_id", nullable = false)
    private StockAdjustmentItem adjustmentItem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id", nullable = false)
    private ProductBatch batch;

    @Column(name = "qty_delta", nullable = false)
    private int qtyDelta;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
