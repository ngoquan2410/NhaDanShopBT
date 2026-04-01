package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductCombo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductComboRepository extends JpaRepository<ProductCombo, Long> {
    List<ProductCombo> findByActiveOrderByNameAsc(Boolean active);
    boolean existsByCode(String code);
    Optional<ProductCombo> findByCode(String code);
}
