package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.GhnQuoteLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GhnQuoteLogRepository extends JpaRepository<GhnQuoteLog, Long> {
    Page<GhnQuoteLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
