package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByActiveTrue();
    Page<Product> findByCategoryIdAndActiveTrue(Long categoryId, Pageable pageable);
    Optional<Product> findByCode(String code);
    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, Long id);

    /** Dùng cho ExpiryWarningService - chỉ lấy sản phẩm có expiryDays */
    List<Product> findByActiveTrueAndExpiryDaysIsNotNull();

    /** Tìm theo tên CHÍNH XÁC (exact, ignore case) — ưu tiên dùng trước */
    Optional<Product> findByNameIgnoreCase(String name);

    /** Check trùng tên + danh mục (dùng cho import và API tạo mới) */
    boolean existsByNameIgnoreCaseAndCategoryId(String name, Long categoryId);

    /** Tìm theo tên (chứa chuỗi, không phân biệt hoa/thường) - fallback khi không exact match */
    List<Product> findByNameContainingIgnoreCase(String name);

    /**
     * Lấy tất cả mã sản phẩm theo category để generate code mới.
     * Trả về danh sách code (bao gồm cả inactive) để tránh trùng.
     */
    @Query("SELECT p.code FROM Product p WHERE p.category.id = :categoryId")
    List<String> findAllCodesByCategoryId(@Param("categoryId") Long categoryId);
}