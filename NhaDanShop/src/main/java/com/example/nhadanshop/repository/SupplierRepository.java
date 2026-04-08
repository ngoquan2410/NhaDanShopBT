package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findByActiveTrueOrderByNameAsc();

    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, Long id);

    Optional<Supplier> findByCode(String code);

    @Query("SELECT s FROM Supplier s WHERE s.active = true AND " +
           "(LOWER(s.name) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           " LOWER(s.code) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           " LOWER(COALESCE(s.phone, '')) LIKE LOWER(CONCAT('%', :q, '%')))")
    List<Supplier> searchActive(@Param("q") String query);
}
