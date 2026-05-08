package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "production_order_allocations")
@Getter
@Setter
@NoArgsConstructor
public class ProductionOrderAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_component_id")
    private ProductionOrderComponent orderComponent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id")
    private ProductBatch batch;

    @Column(name = "qty", nullable = false)
    private Integer qty;

    @Column(name = "unit_cost", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitCost;

    @Column(name = "total_cost_snapshot", precision = 18, scale = 2)
    private BigDecimal totalCostSnapshot;

    @Column(name = "batch_code_snapshot", length = 80)
    private String batchCodeSnapshot;

    @Column(name = "allocation_index")
    private Integer allocationIndex;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;
}
