package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.IdempotencyKeyRecord;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKeyRecord, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT r FROM IdempotencyKeyRecord r
            WHERE r.userRef = :userRef AND r.scope = :scope AND r.idempotencyKey = :idempotencyKey
            """)
    Optional<IdempotencyKeyRecord> findByUserRefAndScopeAndIdempotencyKeyForUpdate(
            @Param("userRef") String userRef,
            @Param("scope") String scope,
            @Param("idempotencyKey") String idempotencyKey);
}
