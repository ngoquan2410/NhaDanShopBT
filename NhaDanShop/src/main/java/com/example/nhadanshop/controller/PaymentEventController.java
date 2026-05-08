package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.PaymentEventCountResponse;
import com.example.nhadanshop.dto.PaymentEventLinkRequest;
import com.example.nhadanshop.dto.PaymentEventLinkResponse;
import com.example.nhadanshop.dto.PaymentEventResponse;
import com.example.nhadanshop.service.IdempotencyScopes;
import com.example.nhadanshop.service.IdempotencyService;
import com.example.nhadanshop.service.PaymentEventService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payment-events")
@RequiredArgsConstructor
public class PaymentEventController {

    private final PaymentEventService paymentEventService;
    private final IdempotencyService idempotencyService;

    @GetMapping("/recent")
    public List<PaymentEventResponse> listRecent(@RequestParam(defaultValue = "50") int limit) {
        return paymentEventService.listRecent(limit);
    }

    @GetMapping("/unmatched")
    public List<PaymentEventResponse> listUnmatched(@RequestParam(defaultValue = "100") int limit) {
        return paymentEventService.listUnmatched(limit);
    }

    @GetMapping("/ignored")
    public List<PaymentEventResponse> listIgnored(@RequestParam(defaultValue = "100") int limit) {
        return paymentEventService.listIgnored(limit);
    }

    @GetMapping("/by-order-code/{code}")
    public List<PaymentEventResponse> findByOrderCode(@PathVariable String code) {
        return paymentEventService.findByOrderCode(code);
    }

    @GetMapping("/unmatched/count")
    public PaymentEventCountResponse countUnmatched() {
        return new PaymentEventCountResponse(paymentEventService.countUnmatched());
    }

    @PostMapping("/{eventId}/link")
    public PaymentEventLinkResponse link(
            @PathVariable long eventId,
            @Valid @RequestBody PaymentEventLinkRequest request,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.paymentEventLink(eventId),
                idempotencyKey,
                PaymentEventLinkResponse.class,
                () -> paymentEventService.linkToOrder(eventId, request.orderCode(), "admin"));
    }

    @PostMapping("/{eventId}/ignore")
    public PaymentEventResponse ignore(
            @PathVariable long eventId,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.paymentEventIgnore(eventId),
                idempotencyKey,
                PaymentEventResponse.class,
                () -> paymentEventService.markIgnored(eventId));
    }

    @PostMapping("/{eventId}/unignore")
    public PaymentEventResponse unignore(
            @PathVariable long eventId,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.paymentEventUnignore(eventId),
                idempotencyKey,
                PaymentEventResponse.class,
                () -> paymentEventService.unmarkIgnored(eventId));
    }
}
