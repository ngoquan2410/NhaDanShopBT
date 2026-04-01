package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@Entity
@Table(
        name = "sales_invoice_items",
        uniqueConstraints = @UniqueConstraint(name = "uq_sales_items", columnNames = {"invoice_id", "product_id"})
)
public class SalesInvoiceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private SalesInvoice invoice;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /** Giá bán gốc (trước chiết khấu dòng) */
    @Column(name = "original_unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal originalUnitPrice = BigDecimal.ZERO;

    /** Chiết khấu % trên dòng này (0–100) */
    @Column(name = "line_discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal lineDiscountPercent = BigDecimal.ZERO;

    /** Giá bán thực tế (sau chiết khấu dòng = originalUnitPrice × (1 - lineDiscount/100)) */
    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "unit_cost_snapshot", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitCostSnapshot = BigDecimal.ZERO;
}


