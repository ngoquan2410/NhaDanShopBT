package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/** Thành phần của 1 combo: sản phẩm nào, số lượng bao nhiêu */
@Entity
@Table(
    name = "product_combo_items",
    uniqueConstraints = @UniqueConstraint(name = "uq_combo_product", columnNames = {"combo_id", "product_id"})
)
@Getter
@Setter
public class ProductComboItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "combo_id", nullable = false)
    private ProductCombo combo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private Integer quantity;
}
