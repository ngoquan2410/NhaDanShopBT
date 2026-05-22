package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PromotionResponse;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.repository.PromotionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:promotion_effective_status;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class PromotionEffectiveStatusIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired
    private PromotionService promotionService;

    @Autowired
    private PromotionRepository promotionRepository;

    @BeforeEach
    void seedPromotions() {
        promotionRepository.deleteAll();
        promotionRepository.save(promotion("Expired enabled", true,
                LocalDateTime.of(2026, 5, 9, 0, 0),
                LocalDateTime.of(2026, 5, 16, 23, 59, 59)));
        promotionRepository.save(promotion("Scheduled enabled", true,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 6, 30, 23, 59, 59)));
        promotionRepository.save(promotion("Running enabled", true,
                LocalDateTime.of(2026, 5, 1, 0, 0),
                LocalDateTime.of(2026, 5, 31, 23, 59, 59)));
        promotionRepository.save(promotion("Inactive within date", false,
                LocalDateTime.of(2026, 5, 1, 0, 0),
                LocalDateTime.of(2026, 5, 31, 23, 59, 59)));
    }

    @Test
    void adminEffectiveStatusFiltersAreDerivedFromActiveFlagAndDateWindow() {
        List<PromotionResponse> expired = listByStatus("expired");
        assertThat(expired).extracting(PromotionResponse::name).containsExactly("Expired enabled");
        assertThat(expired.get(0).currentlyActive()).isFalse();
        assertThat(expired.get(0).effectiveStatus()).isEqualTo("expired");

        assertThat(listByStatus("running"))
                .extracting(PromotionResponse::name)
                .containsExactly("Running enabled");
        assertThat(listByStatus("scheduled"))
                .extracting(PromotionResponse::name)
                .containsExactly("Scheduled enabled");
        assertThat(listByStatus("inactive"))
                .extracting(PromotionResponse::name)
                .containsExactly("Inactive within date");
    }

    @Test
    void publicActiveListOnlyReturnsPromotionsCurrentlyRunningByDate() {
        List<PromotionResponse> active = promotionService.listActive();
        assertThat(active).extracting(PromotionResponse::name).containsExactly("Running enabled");
        assertThat(active.get(0).currentlyActive()).isTrue();
        assertThat(active.get(0).effectiveStatus()).isEqualTo("running");
    }

    @Test
    void legacyActiveInactiveFiltersKeepAdminEnableFlagMeaning() {
        assertThat(listByStatus("active"))
                .extracting(PromotionResponse::name)
                .containsExactlyInAnyOrder("Expired enabled", "Scheduled enabled", "Running enabled");
        assertThat(listByStatus("inactive"))
                .extracting(PromotionResponse::name)
                .containsExactly("Inactive within date");
    }

    private List<PromotionResponse> listByStatus(String status) {
        return promotionService.list(0, 20, null, status, null, true, PageRequest.of(0, 20))
                .getContent();
    }

    private static Promotion promotion(String name, boolean active, LocalDateTime start, LocalDateTime end) {
        Promotion p = new Promotion();
        p.setName(name);
        p.setDescription(name);
        p.setType("FIXED_DISCOUNT");
        p.setDiscountValue(BigDecimal.valueOf(10_000));
        p.setMinOrderValue(BigDecimal.ZERO);
        p.setMaxDiscount(BigDecimal.ZERO);
        p.setStartDate(start);
        p.setEndDate(end);
        p.setActive(active);
        p.setAppliesTo("ALL");
        p.setMinOrderScope("ELIGIBLE_ITEMS");
        p.setRepeatable(true);
        return p;
    }

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedBusinessClock() {
            return Clock.fixed(Instant.parse("2026-05-21T05:00:00Z"), BUSINESS_ZONE);
        }
    }
}
