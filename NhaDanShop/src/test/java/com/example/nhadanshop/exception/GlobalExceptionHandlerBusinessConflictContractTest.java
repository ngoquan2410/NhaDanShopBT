package com.example.nhadanshop.exception;

import com.example.nhadanshop.service.ReceiptDeleteEligibility;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerBusinessConflictContractTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void downstreamDeleteConflict_includesCodeAtRoot() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/receipts/99");
        var ex = new BusinessConflictException(
                ReceiptDeleteEligibility.REASON_DOWNSTREAM_CONSUMPTION,
                "Không thể xóa phiếu nhập — một số lô hàng đã được bán.");
        ResponseEntity<Map<String, Object>> res = handler.handleBusinessConflict(ex, req);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        Map<String, Object> body = res.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("status")).isEqualTo(409);
        assertThat(body.get("detail")).isEqualTo(ex.getMessage());
        assertThat(body.get("code")).isEqualTo(ReceiptDeleteEligibility.REASON_DOWNSTREAM_CONSUMPTION);
        assertThat(body.get("instance")).isEqualTo("/api/receipts/99");
    }

    @Test
    void voidedDeleteConflict_distinctCode() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/receipts/12");
        var ex = new BusinessConflictException(
                ReceiptDeleteEligibility.REASON_VOIDED,
                "Không thể xóa phiếu đã hủy (void).");
        ResponseEntity<Map<String, Object>> res = handler.handleBusinessConflict(ex, req);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().get("code")).isEqualTo(ReceiptDeleteEligibility.REASON_VOIDED);
    }

    @Test
    void alreadyVoidedConflict_distinctCode() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/receipts/5/void");
        var ex = new BusinessConflictException(
                ReceiptDeleteEligibility.REASON_ALREADY_VOIDED,
                "Phiếu nhập đã bị hủy (void).");
        ResponseEntity<Map<String, Object>> res = handler.handleBusinessConflict(ex, req);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().get("code")).isEqualTo(ReceiptDeleteEligibility.REASON_ALREADY_VOIDED);
    }
}
