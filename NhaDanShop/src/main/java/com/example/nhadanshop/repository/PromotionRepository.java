package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Promotion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    Page<Promotion> findAllByOrderByStartDateDesc(Pageable pageable);
    Page<Promotion> findByActiveTrueOrderByStartDateDesc(Pageable pageable);

    /** Tất cả khuyến mãi đang active tại thời điểm now */
    @Query("SELECT p FROM Promotion p WHERE p.active = true "
            + "AND p.startDate <= :now AND p.endDate >= :now")
    List<Promotion> findCurrentlyActive(@Param("now") LocalDateTime now);

    @Query("SELECT DISTINCT p FROM Promotion p "
            + "LEFT JOIN FETCH p.buyItems bi "
            + "LEFT JOIN FETCH bi.product "
            + "LEFT JOIN FETCH p.categories "
            + "LEFT JOIN FETCH p.products "
            + "WHERE p.id = :id")
    Optional<Promotion> findByIdWithDetails(@Param("id") Long id);

    @Query("SELECT DISTINCT p FROM Promotion p "
            + "LEFT JOIN FETCH p.buyItems bi "
            + "LEFT JOIN FETCH bi.product "
            + "LEFT JOIN FETCH p.categories "
            + "LEFT JOIN FETCH p.products "
            + "WHERE p.active = true AND p.startDate <= :now AND p.endDate >= :now")
    List<Promotion> findCurrentlyActiveWithDetails(@Param("now") LocalDateTime now);

    /** Active và lọc theo type */
    @Query("SELECT p FROM Promotion p WHERE p.active = true "
            + "AND p.startDate <= :now AND p.endDate >= :now AND p.type = :type")
    List<Promotion> findCurrentlyActiveByType(@Param("now") LocalDateTime now,
                                              @Param("type") String type);

    @Query(value = "SELECT count(*) > 0 FROM promotions WHERE get_product_id = :productId", nativeQuery = true)
    boolean existsByGiftTargetProductId(@Param("productId") long productId);

    @Query(value = "SELECT count(*) > 0 FROM promotion_products WHERE product_id = :productId", nativeQuery = true)
    boolean existsInLinkedProducts(@Param("productId") long productId);
}
