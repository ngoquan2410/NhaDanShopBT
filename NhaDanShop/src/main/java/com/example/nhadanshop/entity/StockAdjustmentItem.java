package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "stock_adjustment_items")
@Getter
@Setter
public class StockAdjustmentItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "adjustment_id", nullable = false)
    private StockAdjustment adjustment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariant variant;

    /** Snapshot tồn kho hệ thống lúc tạo phiếu — bất biến */
    @Column(name = "system_qty", nullable = false)
    private Integer systemQty;

    /** Số thực tế kiểm kê do admin nhập */
    @Column(name = "actual_qty", nullable = false)
    private Integer actualQty;

    /** Ghi chú cho dòng này (lý do cụ thể) */
    @Column(name = "note", length = 200)
    private String note;

    /** diff_qty = actual_qty - system_qty (computed, read-only từ DB) */
    @Column(name = "diff_qty", insertable = false, updatable = false)
    private Integer diffQty;
}
