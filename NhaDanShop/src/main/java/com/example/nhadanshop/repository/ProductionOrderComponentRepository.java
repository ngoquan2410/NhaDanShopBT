package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionOrderComponent;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProductionOrderComponentRepository extends JpaRepository<ProductionOrderComponent, Long> {

    @EntityGraph(attributePaths = {"order"})
    List<ProductionOrderComponent> findByOrderIdOrderByIdAsc(Long orderId);

    Optional<ProductionOrderComponent> findByIdAndOrder_Id(Long componentId, Long orderId);
}
