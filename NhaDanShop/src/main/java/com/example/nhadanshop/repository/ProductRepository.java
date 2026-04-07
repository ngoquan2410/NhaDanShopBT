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

import com.example.nhadanshop.entity.Product.ProductType;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByActiveTrue();
    Page<Product> findByCategoryIdAndActiveTrue(Long categoryId, Pageable pageable);
    Optional<Product> findByCode(String code);
    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, Long id);

    Optional<Product> findByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndCategoryId(String name, Long categoryId);

    List<Product> findByNameContainingIgnoreCase(String name);

    @Query("SELECT p.code FROM Product p WHERE p.category.id = :categoryId")
    List<String> findAllCodesByCategoryId(@Param("categoryId") Long categoryId);

    // ── Combo queries (KiotViet model) ────────────────────────────────────
    /** Tất cả combo (productType=COMBO) */
    List<Product> findByProductTypeAndActiveTrue(ProductType productType);

    /** Tất cả combo kể cả inactive (admin) */
    List<Product> findByProductTypeOrderByNameAsc(ProductType productType);

    /** Chỉ SINGLE products đang hoạt động (dùng cho hóa đơn, nhập kho) */
    @Query("SELECT p FROM Product p WHERE p.active = true AND p.productType = 'SINGLE' ORDER BY p.name")
    List<Product> findActiveSingleProducts();
}