package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.service.ProductComboService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/combos")
@RequiredArgsConstructor
public class ProductComboController {

    private final ProductComboService comboService;

    /** GET /api/combos — Tất cả combo (kể cả inactive, dành cho admin) */
    @GetMapping
    public List<ProductComboResponse> list() {
        return comboService.listAll();
    }

    /** GET /api/combos/active — Combo đang hoạt động (dành cho bán hàng) */
    @GetMapping("/active")
    public List<ProductComboResponse> listActive() {
        return comboService.listActive();
    }

    /** GET /api/combos/{id} */
    @GetMapping("/{id}")
    public ProductComboResponse one(@PathVariable Long id) {
        return comboService.getOne(id);
    }

    /** POST /api/combos */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductComboResponse create(@Valid @RequestBody ProductComboRequest req) {
        return comboService.create(req);
    }

    /** PUT /api/combos/{id} */
    @PutMapping("/{id}")
    public ProductComboResponse update(@PathVariable Long id,
                                       @Valid @RequestBody ProductComboRequest req) {
        return comboService.update(id, req);
    }

    /** DELETE /api/combos/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        comboService.delete(id);
    }

    /** PATCH /api/combos/{id}/toggle */
    @PatchMapping("/{id}/toggle")
    public ProductComboResponse toggle(@PathVariable Long id) {
        return comboService.toggleActive(id);
    }
}
