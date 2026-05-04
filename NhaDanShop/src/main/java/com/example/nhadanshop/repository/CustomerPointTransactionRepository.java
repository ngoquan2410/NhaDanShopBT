package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.CustomerPointTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CustomerPointTransactionRepository extends JpaRepository<CustomerPointTransaction, Long> {
    boolean existsByIdempotencyKey(String idempotencyKey);
    Optional<CustomerPointTransaction> findByIdempotencyKey(String idempotencyKey);
    Page<CustomerPointTransaction> findByCustomerIdOrderByCreatedAtDesc(Long customerId, Pageable pageable);
}
