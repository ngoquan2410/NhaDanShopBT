package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CustomerRequest;
import com.example.nhadanshop.dto.CustomerResponse;
import com.example.nhadanshop.service.CustomerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * API quản lý khách hàng — Sprint 2.
 *
 * GET  /api/customers          — danh sách KH đang active (q param để search)
 * GET  /api/customers/{id}     — chi tiết 1 KH
 * POST /api/customers          — tạo mới KH
 * PUT  /api/customers/{id}     — cập nhật KH
 * DELETE /api/customers/{id}   — vô hiệu hóa KH (soft delete)
 */
@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @GetMapping
    public List<CustomerResponse> getAll(@RequestParam(required = false) String q) {
        return q != null && !q.isBlank()
                ? customerService.search(q)
                : customerService.getAll();
    }

    @GetMapping("/{id}")
    public CustomerResponse getById(@PathVariable Long id) {
        return customerService.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerResponse create(@Valid @RequestBody CustomerRequest req) {
        return customerService.create(req);
    }

    @PutMapping("/{id}")
    public CustomerResponse update(@PathVariable Long id, @Valid @RequestBody CustomerRequest req) {
        return customerService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable Long id) {
        customerService.deactivate(id);
    }
}
