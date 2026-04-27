package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CancelOrderRequest;
import com.example.nhadanshop.dto.ChangePaymentMethodRequest;
import com.example.nhadanshop.dto.ConfirmPendingOrderRequest;
import com.example.nhadanshop.dto.MarkWaitingConfirmRequest;
import com.example.nhadanshop.dto.PendingOrderConfirmResponse;
import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.PendingOrderResponse;
import com.example.nhadanshop.service.IdempotencyScopes;
import com.example.nhadanshop.service.IdempotencyService;
import com.example.nhadanshop.service.PendingOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pending-orders")
@RequiredArgsConstructor
public class PendingOrderController {

    private final PendingOrderService pendingOrderService;
    private final IdempotencyService idempotencyService;

    /**
     * Khách tạo đơn chờ thanh toán online.
     * POST /api/pending-orders
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PendingOrderResponse create(
            @Valid @RequestBody PendingOrderRequest req,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.PENDING_ORDER_CREATE,
                idempotencyKey,
                PendingOrderResponse.class,
                () -> pendingOrderService.createOrder(req));
    }

    /**
     * Admin lấy tất cả đơn chờ.
     * GET /api/pending-orders
     */
    @GetMapping
    public List<PendingOrderResponse> listAll() {
        return pendingOrderService.listAll();
    }

    /**
     * Khách/Admin lấy 1 đơn (polling trạng thái).
     * GET /api/pending-orders/{id}
     */
    @GetMapping("/{id}")
    public PendingOrderResponse getOne(@PathVariable Long id) {
        return pendingOrderService.getById(id);
    }

    @GetMapping("/by-code/{code}")
    public PendingOrderResponse getByCode(@PathVariable String code) {
        return pendingOrderService.getByCode(code);
    }

    @PostMapping("/{id}/mark-waiting-confirm")
    public PendingOrderResponse markWaitingConfirm(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) MarkWaitingConfirmRequest req) {
        return pendingOrderService.markWaitingConfirm(id, req != null ? req.note() : null);
    }

    @PostMapping("/{id}/change-payment-method")
    public PendingOrderResponse changePaymentMethod(
            @PathVariable Long id,
            @Valid @RequestBody ChangePaymentMethodRequest req) {
        return pendingOrderService.changePaymentMethod(id, req.paymentMethod());
    }

    /**
     * Admin xác nhận đã nhận tiền → tạo invoice + trừ kho.
     * POST /api/pending-orders/{id}/confirm
     */
    @PostMapping("/{id}/confirm")
    public PendingOrderConfirmResponse confirm(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ConfirmPendingOrderRequest req,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.pendingOrderConfirm(id),
                idempotencyKey,
                PendingOrderConfirmResponse.class,
                () -> pendingOrderService.confirmOrder(
                        id,
                        req != null ? req.note() : null,
                        req != null ? req.confirmedBy() : null));
    }

    /**
     * Admin hủy đơn.
     * POST /api/pending-orders/{id}/cancel
     */
    @PostMapping("/{id}/cancel")
    public PendingOrderResponse cancel(
            @PathVariable Long id,
            @RequestBody(required = false) CancelOrderRequest req,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        String reason = req != null ? req.reason() : null;
        return idempotencyService.execute(
                IdempotencyScopes.pendingOrderCancel(id),
                idempotencyKey,
                PendingOrderResponse.class,
                () -> pendingOrderService.cancelOrder(id, reason));
    }
}
