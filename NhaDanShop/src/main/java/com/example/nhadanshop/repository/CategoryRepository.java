package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findAllByOrderByNameAsc();

    List<Category> findByActiveTrueOrderByNameAsc();
    boolean existsByName(String name);
    boolean existsByNameAndIdNot(String name, Long id);
    Optional<Category> findByNameIgnoreCase(String name);

    @Query(value = "SELECT count(*) > 0 FROM promotion_categories WHERE category_id = :categoryId", nativeQuery = true)
    boolean existsInPromotionLinks(@Param("categoryId") long categoryId);
}