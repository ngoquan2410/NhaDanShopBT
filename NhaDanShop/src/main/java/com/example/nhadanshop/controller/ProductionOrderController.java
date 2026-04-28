package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.production.ProductionRecipeDtos.*;
import com.example.nhadanshop.service.ProductionOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/production-orders")
@RequiredArgsConstructor
public class ProductionOrderController {

    private final ProductionOrderService service;

    @PostMapping("/preview")
    public ProductionPreviewResponse preview(@Valid @RequestBody ProductionPreviewRequest body) {
        return service.preview(body);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductionOrderResponse create(@Valid @RequestBody CreateProductionOrderRequest body) {
        return service.create(body);
    }

    @GetMapping
    public Page<ProductionOrderResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long recipeId,
            @RequestParam(required = false) Long outputVariantId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return service.list(pageable, status, recipeId, outputVariantId, query, dateFrom, dateTo);
    }

    @GetMapping("/{id}")
    public ProductionOrderResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping("/{id}/void")
    public ProductionOrderResponse voidOrder(
            @PathVariable Long id,
            @RequestBody(required = false) ProductionOrderVoidRequest body) {
        return service.voidOrder(id, body != null ? body : new ProductionOrderVoidRequest(null, null));
    }
}
