package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "production_order_components")
@Getter
@Setter
@NoArgsConstructor
public class ProductionOrderComponent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private ProductionOrder order;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "required_qty", nullable = false)
    private Integer requiredQty;

    @Column(name = "consumed_qty", nullable = false)
    private Integer consumedQty;

    @Column(name = "unit", nullable = false, length = 32)
    private String unit = "unit";

    @Column(name = "product_name_snapshot", length = 255)
    private String productNameSnapshot;

    @Column(name = "variant_name_snapshot", length = 255)
    private String variantNameSnapshot;

    @Column(name = "variant_code_snapshot", length = 100)
    private String variantCodeSnapshot;
}
