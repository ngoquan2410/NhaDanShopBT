package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.SalesInvoiceItemBatchAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SalesInvoiceItemBatchAllocationRepository extends JpaRepository<SalesInvoiceItemBatchAllocation, Long> {

    boolean existsByBatch_Id(Long batchId);
}
