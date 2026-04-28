package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.SalesQuote;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface SalesQuoteRepository extends JpaRepository<SalesQuote, Long> {

    Optional<SalesQuote> findByPublicId(String publicId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT q FROM SalesQuote q WHERE q.publicId = :publicId")
    Optional<SalesQuote> findByPublicIdForUpdate(@Param("publicId") String publicId);
}
