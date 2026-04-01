package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Thành phần của 1 combo (KiotViet model).
 * combo_product_id → products.id (product_type=COMBO)
 * product_id       → products.id (product_type=SINGLE)
 */
@Entity
@Table(
    name = "product_combo_items",
    uniqueConstraints = @UniqueConstraint(name = "uq_combo_product",
        columnNames = {"combo_product_id", "product_id"})
)
@Getter
@Setter
public class ProductComboItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Sản phẩm combo chứa item này (productType=COMBO) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "combo_product_id", nullable = false)
    private Product comboProduct;

    /** Sản phẩm thành phần (productType=SINGLE) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private Integer quantity;
}
