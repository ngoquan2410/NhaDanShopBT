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

    /**
     * Tìm kiếm không dấu tiếng Việt — VD: "trang" tìm được "Trạng", "manh" → "Mạnh Hùng".
     */
    @Query(value = "SELECT * FROM suppliers s WHERE s.active = true AND " +
           "(immutable_unaccent(lower(s.name)) LIKE '%' || immutable_unaccent(lower(:q)) || '%' OR " +
           " lower(s.code) LIKE '%' || lower(:q) || '%' OR " +
           " lower(coalesce(s.phone, '')) LIKE '%' || lower(:q) || '%')",
           nativeQuery = true)
    List<Supplier> searchActive(@Param("q") String query);
}
