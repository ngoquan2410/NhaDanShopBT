package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "production_recipes")
@Getter
@Setter
@NoArgsConstructor
public class ProductionRecipe {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recipe_code", nullable = false, unique = true, length = 80)
    private String recipeCode;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "output_product_id")
    private Product outputProduct;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "output_variant_id")
    private ProductVariant outputVariant;

    @Column(name = "output_qty", nullable = false)
    private Integer outputQty;

    @Column(name = "output_must_be_sellable", nullable = false)
    private Boolean outputMustBeSellable = true;

    @Column(name = "overhead_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal overheadCost = BigDecimal.ZERO;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @Column(name = "archived", nullable = false)
    private Boolean archived = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (outputMustBeSellable == null) outputMustBeSellable = true;
        if (active == null) active = true;
        if (archived == null) archived = false;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
