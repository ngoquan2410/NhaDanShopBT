package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@Entity
@Table(
        name = "inventory_receipt_items",
        uniqueConstraints = @UniqueConstraint(name = "uq_inventory_items", columnNames = {"receipt_id", "product_id"})
)
public class InventoryReceiptItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private InventoryReceipt receipt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /** Giá nhập gốc (chưa chiết khấu) */
    @Column(name = "unit_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitCost;

    /** Chiết khấu % nhà cung cấp cho dòng sản phẩm này (0-100) */
    @Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPercent = BigDecimal.ZERO;

    /** Giá nhập sau khi áp dụng chiết khấu (unitCost * (1 - discountPercent/100)) */
    @Column(name = "discounted_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal discountedCost = BigDecimal.ZERO;

    /** Phần phí vận chuyển được phân bổ cho dòng này */
    @Column(name = "shipping_allocated", nullable = false, precision = 18, scale = 2)
    private BigDecimal shippingAllocated = BigDecimal.ZERO;

    /** VAT % áp dụng cho dòng này (0–100), admin nhập tay */
    @Column(name = "vat_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal vatPercent = BigDecimal.ZERO;

    /** Phần VAT được phân bổ vào giá vốn/đơn vị bán lẻ */
    @Column(name = "vat_allocated", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAllocated = BigDecimal.ZERO;

    /** Giá vốn cuối = discountedCost + shippingAllocated + vatAllocated */
    @Column(name = "final_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal finalCost = BigDecimal.ZERO;

    /** Alias sau khi cộng VAT (= finalCost, dùng để phân biệt với finalCost trước VAT) */
    @Column(name = "final_cost_with_vat", nullable = false, precision = 18, scale = 2)
    private BigDecimal finalCostWithVat = BigDecimal.ZERO;
}
