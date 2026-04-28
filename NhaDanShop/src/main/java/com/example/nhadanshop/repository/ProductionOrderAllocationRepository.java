package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionOrderAllocation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductionOrderAllocationRepository extends JpaRepository<ProductionOrderAllocation, Long> {

    @EntityGraph(attributePaths = {"batch"})
    List<ProductionOrderAllocation> findByOrderComponent_IdOrderByIdAsc(Long orderComponentId);
}
