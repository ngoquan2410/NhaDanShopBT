package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Promotion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    Page<Promotion> findAllByOrderByStartDateDesc(Pageable pageable);

    /** Tất cả khuyến mãi đang active tại thời điểm now */
    @Query("SELECT p FROM Promotion p WHERE p.active = true " +
           "AND p.startDate <= :now AND p.endDate >= :now")
    List<Promotion> findCurrentlyActive(@Param("now") LocalDateTime now);

    /** Active và lọc theo type */
    @Query("SELECT p FROM Promotion p WHERE p.active = true " +
           "AND p.startDate <= :now AND p.endDate >= :now AND p.type = :type")
    List<Promotion> findCurrentlyActiveByType(@Param("now") LocalDateTime now,
                                              @Param("type") String type);
}
