package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.dto.StockAdjustmentResponse;
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

    @GetMapping
    public Page<StockAdjustmentResponse> getAll(
            @PageableDefault(size = 20, sort = "adjDate", direction = Sort.Direction.DESC) Pageable pageable) {
        return service.getAll(pageable);
    }

    @GetMapping("/{id}")
    public StockAdjustmentResponse getById(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StockAdjustmentResponse create(@Valid @RequestBody StockAdjustmentRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}/confirm")
    public StockAdjustmentResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
