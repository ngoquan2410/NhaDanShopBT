package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.VoucherResponse;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.VoucherRepository;
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
        "spring.datasource.url=jdbc:h2:mem:voucher_effective_status;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class VoucherEffectiveStatusIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired
    private VoucherService voucherService;

    @Autowired
    private VoucherRepository voucherRepository;

    @BeforeEach
    void seed() {
        voucherRepository.deleteAll();
        voucherRepository.save(voucher("FREESHIP100", true,
                LocalDateTime.of(2026, 5, 12, 0, 0),
                LocalDateTime.of(2026, 5, 12, 23, 59, 59)));
        voucherRepository.save(voucher("SCHEDULED", true,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 6, 30, 23, 59, 59)));
        voucherRepository.save(voucher("RUNNING", true,
                LocalDateTime.of(2026, 5, 1, 0, 0),
                LocalDateTime.of(2026, 5, 31, 23, 59, 59)));
        voucherRepository.save(voucher("INACTIVE", false,
                LocalDateTime.of(2026, 5, 1, 0, 0),
                LocalDateTime.of(2026, 5, 31, 23, 59, 59)));
    }

    @Test
    void effectiveStatusDerivedFromAdminFlagAndBusinessDateWindow() {
        assertThat(listByStatus("expired"))
                .extracting(VoucherResponse::code)
                .containsExactly("FREESHIP100");
        VoucherResponse expired = listByStatus("expired").get(0);
        assertThat(expired.effectiveStatus()).isEqualTo("expired");
        assertThat(expired.currentlyActive()).isFalse();

        assertThat(listByStatus("scheduled")).extracting(VoucherResponse::code).containsExactly("SCHEDULED");
        assertThat(listByStatus("running")).extracting(VoucherResponse::code).containsExactly("RUNNING");
        assertThat(listByStatus("inactive")).extracting(VoucherResponse::code).containsExactly("INACTIVE");
    }

    @Test
    void activeEndpointOnlyReturnsRunningVoucher() {
        List<VoucherResponse> active = voucherService.listActive();
        assertThat(active).extracting(VoucherResponse::code).containsExactly("RUNNING");
        assertThat(active.get(0).effectiveStatus()).isEqualTo("running");
        assertThat(active.get(0).currentlyActive()).isTrue();
    }

    @Test
    void legacyActiveFilterStillMeansAdminEnabledFlag() {
        assertThat(listByStatus("active"))
                .extracting(VoucherResponse::code)
                .containsExactlyInAnyOrder("FREESHIP100", "SCHEDULED", "RUNNING");
    }

    private List<VoucherResponse> listByStatus(String status) {
        return voucherService.list(0, 20, null, status, PageRequest.of(0, 20)).getContent();
    }

    private static Voucher voucher(String code, boolean active, LocalDateTime start, LocalDateTime end) {
        Voucher v = new Voucher();
        v.setCode(code);
        v.setRuleSummary(code);
        v.setActive(active);
        v.setMinSubtotal(BigDecimal.ZERO);
        v.setPercent(BigDecimal.TEN);
        v.setCap(BigDecimal.ZERO);
        v.setFixedAmount(BigDecimal.ZERO);
        v.setFreeShipping(false);
        v.setStartAt(start);
        v.setEndAt(end);
        return v;
    }

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedBusinessClock() {
            return Clock.fixed(Instant.parse("2026-05-22T05:00:00Z"), BUSINESS_ZONE);
        }
    }
}

