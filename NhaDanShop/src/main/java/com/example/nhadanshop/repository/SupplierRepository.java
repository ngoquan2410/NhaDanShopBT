package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Supplier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findByActiveTrueOrderByNameAsc();

    Page<Supplier> findByActiveTrueOrderByNameAsc(Pageable pageable);

    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, Long id);

    Optional<Supplier> findByCode(String code);

    /**
     * Tìm kiếm không dấu tiếng Việt — VD: "trang" tìm được "Trạng", "manh" → "Mạnh Hùng".
     */
    @Query(value = "SELECT * FROM suppliers s WHERE s.is_active = true AND " +
           "(immutable_unaccent(lower(s.name)) LIKE '%' || immutable_unaccent(lower(:q)) || '%' OR " +
           " lower(s.code) LIKE '%' || lower(:q) || '%' OR " +
           " lower(coalesce(s.phone, '')) LIKE '%' || lower(:q) || '%')",
           nativeQuery = true)
    List<Supplier> searchActive(@Param("q") String query);

    @Query("""
            SELECT s FROM Supplier s
            WHERE s.active = true
              AND (:q IS NULL OR :q = ''
                   OR LOWER(s.name) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(s.code, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(s.phone, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(s.email, '')) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY s.name ASC
            """)
    Page<Supplier> searchActivePage(@Param("q") String q, Pageable pageable);

    /**
     * Max numeric suffix for auto codes {@code NCC001}… (only {@code NCC + digits} rows).
     */
    @Query(value = """
            SELECT MAX(CAST(SUBSTRING(s.code, 4) AS BIGINT))
            FROM suppliers s
            WHERE LENGTH(s.code) > 3
              AND UPPER(SUBSTRING(s.code, 1, 3)) = 'NCC'
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    SUBSTRING(s.code, 4), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
            """, nativeQuery = true)
    Long findMaxNccAutoNumericSuffix();
}
