package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.dto.StockAdjustmentResponse;
import com.example.nhadanshop.dto.StockAdjustmentReverseRequest;
import com.example.nhadanshop.service.IdempotencyScopes;
import com.example.nhadanshop.service.IdempotencyService;
import com.example.nhadanshop.service.StockAdjustmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stock-adjustments")
@RequiredArgsConstructor
public class StockAdjustmentController {

    private final StockAdjustmentService service;
    private final IdempotencyService idempotencyService;

    @GetMapping
    public Page<StockAdjustmentResponse> getAll(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "adjDate", direction = Sort.Direction.DESC) Pageable pageable) {
        com.example.nhadanshop.entity.StockAdjustment.Status st = null;
        if (status != null && !status.isBlank()) {
            String s = status.trim().toLowerCase();
            if ("draft".equals(s)) {
                st = com.example.nhadanshop.entity.StockAdjustment.Status.DRAFT;
            } else if ("confirmed".equals(s)) {
                st = com.example.nhadanshop.entity.StockAdjustment.Status.CONFIRMED;
            }
        }
        return service.getAll(pageable, st, search);
    }

    @GetMapping("/{id}")
    public StockAdjustmentResponse getById(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StockAdjustmentResponse create(
            @Valid @RequestBody StockAdjustmentRequest req,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.STOCK_ADJUSTMENT_CREATE,
                idempotencyKey,
                StockAdjustmentResponse.class,
                () -> service.create(req));
    }

    @PutMapping("/{id}/confirm")
    public StockAdjustmentResponse confirm(
            @PathVariable Long id,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.stockAdjustmentConfirm(id),
                idempotencyKey,
                StockAdjustmentResponse.class,
                () -> service.confirm(id));
    }

    @PostMapping("/{id}/reverse")
    public StockAdjustmentResponse reverse(
            @PathVariable Long id,
            @RequestBody(required = false) StockAdjustmentReverseRequest request,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        return idempotencyService.execute(
                IdempotencyScopes.stockAdjustmentReverse(id),
                idempotencyKey,
                StockAdjustmentResponse.class,
                () -> service.reverse(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable Long id,
            @RequestHeader(value = IdempotencyScopes.HEADER_NAME, required = false) String idempotencyKey) {
        idempotencyService.executeVoid(
                IdempotencyScopes.stockAdjustmentDelete(id),
                idempotencyKey,
                () -> service.delete(id));
    }
}
