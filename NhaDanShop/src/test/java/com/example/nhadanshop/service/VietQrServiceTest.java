package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StorePaymentSettingsDto;
import com.example.nhadanshop.dto.VietQrGenerateRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VietQrServiceTest {

    @Mock
    private StorePaymentSettingsService settingsService;

    private VietQrService service;

    @BeforeEach
    void setUp() {
        service = new VietQrService(settingsService);
        ReflectionTestUtils.setField(service, "vietQrImageBaseUrl", "https://img.vietqr.io/image");
        when(settingsService.getPaymentSettings()).thenReturn(settings());
    }

    @Test
    void repeated_generate_with_same_instruction_is_stable_before_ttl() {
        VietQrGenerateRequest request = new VietQrGenerateRequest(
                new BigDecimal("100000"),
                "DH-20260512-001",
                "order-1-v0",
                null);

        var first = service.generate(request);
        var second = service.generate(request);

        assertEquals(first.transferContent(), second.transferContent());
        assertEquals("DH-20260512-001", first.transferContent());
        assertEquals(first.imageUrl(), second.imageUrl());
        assertEquals(first.scanImageUrl(), second.scanImageUrl());
    }

    @Test
    void regenerate_with_new_cache_key_changes_url_without_changing_payment_content() {
        VietQrGenerateRequest firstRequest = new VietQrGenerateRequest(
                new BigDecimal("100000"),
                "DH-20260512-001",
                "order-1-v0",
                null);
        VietQrGenerateRequest nextRequest = new VietQrGenerateRequest(
                new BigDecimal("100000"),
                "DH-20260512-001",
                "order-1-v1",
                null);

        var first = service.generate(firstRequest);
        var next = service.generate(nextRequest);

        assertEquals(first.transferContent(), next.transferContent());
        assertNotEquals(first.imageUrl(), next.imageUrl());
        assertNotEquals(first.scanImageUrl(), next.scanImageUrl());
    }

    @Test
    void qr_amount_matches_pending_total() {
        BigDecimal pendingTotal = new BigDecimal("123456");
        VietQrGenerateRequest request = new VietQrGenerateRequest(
                pendingTotal,
                "DH-20260512-014",
                "pending-42-v0",
                null);

        var result = service.generate(request);

        assertEquals(0, result.amount().compareTo(pendingTotal));
    }

    private StorePaymentSettingsDto settings() {
        return new StorePaymentSettingsDto(
                "Shop",
                true,
                "VCB",
                "Vietcombank",
                "1234567890",
                "NHA DAN SHOP",
                null,
                "DH",
                "compact2",
                null,
                null,
                null,
                null,
                null,
                null);
    }
}

