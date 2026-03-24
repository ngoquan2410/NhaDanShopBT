package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CancelOrderRequest;
import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.PendingOrderResponse;
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

    /**
     * Khách tạo đơn chờ thanh toán online.
     * POST /api/pending-orders
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PendingOrderResponse create(@Valid @RequestBody PendingOrderRequest req) {
        return pendingOrderService.createOrder(req);
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

    /**
     * Admin xác nhận đã nhận tiền → tạo invoice + trừ kho.
     * POST /api/pending-orders/{id}/confirm
     */
    @PostMapping("/{id}/confirm")
    public PendingOrderResponse confirm(@PathVariable Long id) {
        return pendingOrderService.confirmOrder(id);
    }

    /**
     * Admin hủy đơn.
     * POST /api/pending-orders/{id}/cancel
     */
    @PostMapping("/{id}/cancel")
    public PendingOrderResponse cancel(
            @PathVariable Long id,
            @RequestBody(required = false) CancelOrderRequest req) {
        String reason = req != null ? req.reason() : null;
        return pendingOrderService.cancelOrder(id, reason);
    }
}
