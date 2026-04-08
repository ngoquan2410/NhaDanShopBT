package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.StockAdjustment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, Long> {

    Page<StockAdjustment> findAllByOrderByAdjDateDesc(Pageable pageable);

    @Query("SELECT MAX(CAST(SUBSTRING(a.adjNo, LENGTH(:prefix)+1) AS int)) " +
           "FROM StockAdjustment a WHERE a.adjNo LIKE :pattern")
    Integer findMaxSeqForPrefix(@Param("prefix") String prefix,
                                @Param("pattern") String pattern);
}
