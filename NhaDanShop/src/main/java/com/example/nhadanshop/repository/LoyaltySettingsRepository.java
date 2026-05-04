package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.LoyaltySettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LoyaltySettingsRepository extends JpaRepository<LoyaltySettings, Long> {
}
