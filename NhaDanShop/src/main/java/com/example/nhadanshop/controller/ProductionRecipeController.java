package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.production.ProductionRecipeDtos.*;
import com.example.nhadanshop.service.ProductionRecipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/production-recipes")
@RequiredArgsConstructor
public class ProductionRecipeController {

    private final ProductionRecipeService service;

    @GetMapping
    public Page<ProductionRecipeResponse> list(
            @RequestParam(required = false) Boolean archived,
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) Boolean includeArchived,
            @RequestParam(required = false) Long outputVariantId,
            @RequestParam(required = false) String query,
            @PageableDefault(size = 20, sort = "id", direction = Sort.Direction.DESC) Pageable pageable) {
        return service.list(archived, active, includeArchived, outputVariantId, query, pageable);
    }

    @GetMapping("/{id}")
    public ProductionRecipeResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductionRecipeResponse create(@Valid @RequestBody CreateProductionRecipeRequest body) {
        return service.create(body);
    }

    @PatchMapping("/{id}")
    public ProductionRecipeResponse patch(@PathVariable Long id, @Valid @RequestBody PatchProductionRecipeRequest body) {
        return service.patch(id, body);
    }

    @PostMapping("/{id}/archive")
    public ProductionRecipeResponse archive(@PathVariable Long id) {
        return service.archive(id);
    }
}
