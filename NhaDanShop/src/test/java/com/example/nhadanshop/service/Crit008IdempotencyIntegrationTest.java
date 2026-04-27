package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.IdempotencyKeyRecord;
import com.example.nhadanshop.repository.IdempotencyKeyRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * CRIT-008: Idempotency-Key dedupes retries (same user + scope + key).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({IdempotencyService.class, Crit008IdempotencyIntegrationTest.TestBeans.class})
class Crit008IdempotencyIntegrationTest {

    @Autowired
    private IdempotencyService idempotencyService;
    @Autowired
    private IdempotencyKeyRepository idempotencyKeyRepository;

    @BeforeEach
    void loginUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("cashier1", "x", Collections.emptyList()));
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void crit008_sameKeySecondCallReplaysWithoutRunningSupplier() {
        AtomicInteger sideEffects = new AtomicInteger();
        String scope = "crit008.test.body";
        String key = "order-retry-uuid-1";

        Integer first = idempotencyService.execute(scope, key, Integer.class, () -> sideEffects.incrementAndGet());
        Integer second = idempotencyService.execute(scope, key, Integer.class, () -> sideEffects.incrementAndGet());

        assertEquals(1, sideEffects.get());
        assertEquals(1, first);
        assertEquals(1, second);
        assertEquals(1, idempotencyKeyRepository.count());
    }

    @Test
    void crit008_voidSecondCallSkipsAction() {
        AtomicInteger sideEffects = new AtomicInteger();
        String scope = "crit008.test.void";
        String key = "delete-retry-1";

        idempotencyService.executeVoid(scope, key, sideEffects::incrementAndGet);
        idempotencyService.executeVoid(scope, key, sideEffects::incrementAndGet);

        assertEquals(1, sideEffects.get());
    }

    @Test
    void crit008_differentUsersSameKeyAreIndependent() {
        AtomicInteger a = new AtomicInteger();
        AtomicInteger b = new AtomicInteger();

        idempotencyService.execute("crit008.scope", "shared-key", Integer.class, a::incrementAndGet);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("cashier2", "x", Collections.emptyList()));

        idempotencyService.execute("crit008.scope", "shared-key", Integer.class, b::incrementAndGet);

        assertEquals(1, a.get());
        assertEquals(1, b.get());
        assertEquals(2, idempotencyKeyRepository.count());
    }

    @Test
    void crit008_blankKeyRunsEveryTime() {
        AtomicInteger sideEffects = new AtomicInteger();
        Integer x = idempotencyService.execute("s", "  ", Integer.class, sideEffects::incrementAndGet);
        Integer y = idempotencyService.execute("s", null, Integer.class, sideEffects::incrementAndGet);
        assertEquals(2, sideEffects.get());
        assertEquals(1, x);
        assertEquals(2, y);
    }

    @Test
    void crit008_inFlightThrowsOnConcurrentDuplicateKeySameUser() {
        String scope = "crit008.inflight";
        String key = "dup";

        IdempotencyKeyRecord stuck = new IdempotencyKeyRecord();
        stuck.setUserRef("cashier1");
        stuck.setScope(scope);
        stuck.setIdempotencyKey(key);
        stuck.setStatus(IdempotencyKeyRecord.Status.IN_FLIGHT);
        idempotencyKeyRepository.saveAndFlush(stuck);

        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                idempotencyService.execute(scope, key, Integer.class, () -> 99));
        assertEquals(true, ex.getMessage().contains("đang xử lý"));
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        ObjectMapper objectMapper() {
            ObjectMapper m = new ObjectMapper();
            m.registerModule(new JavaTimeModule());
            m.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return m;
        }
    }
}
