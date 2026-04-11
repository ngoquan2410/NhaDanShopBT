package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.service.InvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;

@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
public class SalesInvoiceController {

    private final InvoiceService invoiceService;

    /**
     * Lấy danh sách hóa đơn, hỗ trợ lọc theo ngày hoặc theo KH.
     * Ví dụ: GET /api/invoices?from=2026-01-01&to=2026-03-31&page=0&size=10
     *        GET /api/invoices?customerId=5&page=0&size=10
     */
    @GetMapping
    public Page<SalesInvoiceResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long customerId,
            @PageableDefault(size = 20) Pageable pageable) {

        if (customerId != null) {
            return invoiceService.listInvoicesByCustomer(customerId, pageable);
        }
        if (from != null && to != null) {
            return invoiceService.listInvoicesByDateRange(
                    from.atStartOfDay(), to.atTime(LocalTime.MAX), pageable);
        }
        return invoiceService.listInvoices(pageable);
    }

    @GetMapping("/{id}")
    public SalesInvoiceResponse one(@PathVariable Long id) {
        return invoiceService.getInvoice(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SalesInvoiceResponse create(@Valid @RequestBody SalesInvoiceRequest req) {
        return invoiceService.createInvoice(req);
    }

    /**
     * PATCH /api/invoices/{id}/cancel
     * Soft Cancel: đánh trạng thái CANCELLED, hoàn tồn kho, ghi audit.
     * Không xóa vật lý — hóa đơn vẫn còn trong lịch sử với badge "Đã hủy".
     */
    @PatchMapping("/{id}/cancel")
    public SalesInvoiceResponse cancel(
            @PathVariable Long id,
            @RequestBody(required = false) @Valid com.example.nhadanshop.dto.CancelInvoiceRequest req) {
        String actor = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication() != null
                ? org.springframework.security.core.context.SecurityContextHolder
                    .getContext().getAuthentication().getName()
                : "unknown";
        String reason = req != null ? req.reason() : null;
        return invoiceService.cancelInvoice(id, reason, actor);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        invoiceService.deleteInvoice(id);
    }
}
