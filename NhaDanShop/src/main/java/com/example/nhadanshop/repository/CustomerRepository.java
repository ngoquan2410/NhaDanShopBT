package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {

    /** Tất cả KH đang hoạt động, sort theo tên */
    List<Customer> findByActiveTrueOrderByNameAsc();

    /** Tìm theo mã — để validate unique */
    Optional<Customer> findByCode(String code);

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, Long id);

    /** Tìm theo SĐT (để nhanh chọn KH tại quầy) */
    Optional<Customer> findByPhoneAndActiveTrue(String phone);

    /**
     * Tìm kiếm đa tiêu chí: tên, SĐT, mã KH.
     * Dùng cho search input trên FE.
     */
    @Query("""
            SELECT c FROM Customer c
            WHERE c.active = TRUE
              AND (LOWER(c.name)  LIKE LOWER(CONCAT('%', :q, '%'))
                OR c.phone        LIKE CONCAT('%', :q, '%')
                OR LOWER(c.code)  LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY c.name
            """)
    List<Customer> searchActive(@Param("q") String q);

    /** Top N KH theo tổng chi tiêu (VIP ranking) */
    List<Customer> findTop10ByActiveTrueOrderByTotalSpendDesc();

    /**
     * Cộng thêm total_spend cho KH — dùng @Modifying để cập nhật atomic.
     * Tránh race condition khi nhiều HĐ cùng lúc.
     */
    @Modifying
    @Query("UPDATE Customer c SET c.totalSpend = c.totalSpend + :amount, c.updatedAt = CURRENT_TIMESTAMP WHERE c.id = :id")
    void addSpend(@Param("id") Long id, @Param("amount") BigDecimal amount);
}
