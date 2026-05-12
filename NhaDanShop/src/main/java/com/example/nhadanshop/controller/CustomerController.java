package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CustomerRequest;
import com.example.nhadanshop.dto.CustomerResponse;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.service.CustomerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * API quản lý khách hàng — Sprint 2.
 *
 * GET  /api/customers          — danh sách KH đang active, phân trang Spring (q = tìm DB trước khi phân trang)
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
    public Page<CustomerResponse> getAll(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String group,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        Customer.CustomerGroup g = parseCustomerGroup(group);
        return customerService.listPage(pageable, q, g);
    }

    private static Customer.CustomerGroup parseCustomerGroup(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim().toLowerCase();
        if ("retail".equals(s) || "le".equals(s)) {
            return Customer.CustomerGroup.RETAIL;
        }
        if ("wholesale".equals(s) || "si".equals(s)) {
            return Customer.CustomerGroup.WHOLESALE;
        }
        if ("vip".equals(s)) {
            return Customer.CustomerGroup.VIP;
        }
        return null;
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
