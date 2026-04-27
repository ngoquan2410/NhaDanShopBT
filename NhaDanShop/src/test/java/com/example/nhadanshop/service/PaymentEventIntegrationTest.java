package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.PaymentEvent;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.repository.PaymentEventRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "casso.webhook-secure-token=test-secure-token"
})
@Import({PaymentEventService.class, PaymentEventIntegrationTest.TestConfig.class})
class PaymentEventIntegrationTest {

    @Autowired
    private PaymentEventService paymentEventService;
    @Autowired
    private PaymentEventRepository paymentEventRepository;
    @Autowired
    private PendingOrderRepository pendingOrderRepository;
    @Autowired
    private TestEntityManager entityManager;
    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private PendingOrderService pendingOrderService;

    @Test
    void webhook_match_marksOrderPaidAuto_withoutCreatingInvoiceOrConfirmingOrder() throws Exception {
        PendingOrder order = new PendingOrder();
        order.setOrderNo("DH-20260424-001");
        order.setCustomerName("Khach test");
        order.setPaymentMethod("bank_transfer");
        order.setPaymentReference("DH-20260424-001");
        order.setStatus(PendingOrder.Status.PENDING_PAYMENT);
        order.setTotalAmount(new BigDecimal("100000"));
        order.setExpiresAt(LocalDateTime.now().plusHours(4));
        entityManager.persistAndFlush(order);

        JsonNode payload = objectMapper.readTree("""
                {
                  "error": 0,
                  "data": [
                    {
                      "id": 6785,
                      "tid": "BANK_REF_001",
                      "description": "CK DH-20260424-001",
                      "amount": 100000,
                      "when": "2026-04-24 10:15:30",
                      "subAccId": "123456789"
                    }
                  ]
                }
                """);

        PaymentEventService.CassoIngestResult result = paymentEventService.ingestCassoPayload(
                payload,
                null,
                "test-secure-token");

        PaymentEvent event = paymentEventRepository.findAll().get(0);
        PendingOrder refreshed = pendingOrderRepository.findById(order.getId()).orElseThrow();

        assertEquals(1, result.received());
        assertEquals(1, result.upserted());
        assertEquals(1, result.autoLinked());
        assertEquals(1, result.markedPaidAuto());
        assertEquals(PaymentEvent.Status.LINKED, event.getStatus());
        assertEquals(order.getOrderNo(), event.getLinkedOrderCode());
        assertEquals(PendingOrder.Status.PAID_AUTO, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
    }

    @TestConfiguration
    static class TestConfig {
        @Bean
        ObjectMapper objectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.registerModule(new JavaTimeModule());
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return mapper;
        }
    }
}
