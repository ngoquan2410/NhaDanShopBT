package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.StockAdjustmentItemBatchAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface StockAdjustmentItemBatchAllocationRepository extends JpaRepository<StockAdjustmentItemBatchAllocation, Long> {

    @Query("SELECT a FROM StockAdjustmentItemBatchAllocation a " +
            "WHERE a.adjustmentItem.id IN :itemIds " +
            "ORDER BY a.adjustmentItem.id, a.id")
    List<StockAdjustmentItemBatchAllocation> findByAdjustmentItemIdIn(@Param("itemIds") Collection<Long> itemIds);
}
