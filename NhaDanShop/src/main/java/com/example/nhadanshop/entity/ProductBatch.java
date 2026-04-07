package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Lô hàng (Batch) – mỗi lần nhập kho tạo ra 1 lô riêng.
 *
 * - remainingQty giảm dần khi bán (FEFO: lô hết hạn sớm được bán trước).
 * - Khi remainingQty = 0 → lô đã bán hết.
 * - expiryDate = ngày nhập + product.expiryDays.
 */
@Entity
@Table(name = "product_batches",
        indexes = {
                @Index(name = "idx_pb_product_expiry",
                        columnList = "product_id, expiry_date, remaining_qty"),
                @Index(name = "idx_pb_expiry_date",
                        columnList = "expiry_date, remaining_qty")
        })
@Getter
@Setter
@NoArgsConstructor
public class ProductBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Sản phẩm thuộc lô này — nullable sau V25 (DEPRECATED, dùng variant.product) */
    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "product_id", nullable = true)
    private Product product;

    /**
     * Biến thể đóng gói của lô này (Sprint 0).
     * Nullable để backward compat — backfill từ V23.
     * Sau V23: luôn có giá trị (application layer enforce).
     * FEFO query dùng variant_id thay vì product_id.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "variant_id")
    private ProductVariant variant;

    /** Phiếu nhập kho tạo ra lô (NULL = nhập thủ công) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receipt_id")
    private InventoryReceipt receipt;

    /** Mã lô: BATCH-{receiptNo}-{productCode} hoặc INIT-{productCode} */
    @Column(name = "batch_code", nullable = false, unique = true, length = 80)
    private String batchCode;

    /** Ngày sản xuất (optional) */
    @Column(name = "mfg_date")
    private LocalDate mfgDate;

    /** Ngày hết hạn thực tế = ngày nhập + product.expiryDays */
    @Column(name = "expiry_date", nullable = false)
    private LocalDate expiryDate;

    /** Số lượng nhập ban đầu (đơn vị bán lẻ) */
    @Column(name = "import_qty", nullable = false)
    private int importQty;

    /** Số lượng còn lại trong lô (đơn vị bán lẻ) */
    @Column(name = "remaining_qty", nullable = false)
    private int remainingQty;

    /** Giá vốn của lô này */
    @Column(name = "cost_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal costPrice;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    /** Còn hàng trong lô không? */
    public boolean hasStock() {
        return remainingQty > 0;
    }

    /** Lô đã hết hạn chưa? */
    public boolean isExpired() {
        return LocalDate.now().isAfter(expiryDate);
    }

    /** Số ngày còn lại đến hết hạn (âm = đã hết hạn) */
    public long daysUntilExpiry() {
        return java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), expiryDate);
    }
}
