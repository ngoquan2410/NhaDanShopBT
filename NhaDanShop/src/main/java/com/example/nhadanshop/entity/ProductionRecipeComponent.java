package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "production_recipe_components")
@Getter
@Setter
@NoArgsConstructor
public class ProductionRecipeComponent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id")
    private ProductionRecipe recipe;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id")
    private ProductVariant variant;

    @Column(name = "qty_per_output", nullable = false)
    private Integer qtyPerOutput;

    @Column(name = "unit", nullable = false, length = 32)
    private String unit = "unit";

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
