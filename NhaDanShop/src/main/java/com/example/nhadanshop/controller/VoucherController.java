package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.VoucherRequest;
import com.example.nhadanshop.dto.VoucherResponse;
import com.example.nhadanshop.service.VoucherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vouchers")
@RequiredArgsConstructor
public class VoucherController {

    private final VoucherService voucherService;

    @GetMapping
    public Page<VoucherResponse> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 50) Pageable pageable) {
        return voucherService.list(page, size, search, status, pageable);
    }

    /** Voucher còn hiệu lực — dùng cho chọn ưu đãi ở checkout */
    @GetMapping("/active")
    public List<VoucherResponse> listActive() {
        return voucherService.listActive();
    }

    @GetMapping("/{id}")
    public VoucherResponse one(@PathVariable Long id) {
        return voucherService.getOne(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VoucherResponse create(@Valid @RequestBody VoucherRequest req) {
        return voucherService.create(req);
    }

    @PutMapping("/{id}")
    public VoucherResponse update(@PathVariable Long id, @Valid @RequestBody VoucherRequest req) {
        return voucherService.update(id, req);
    }

    @PatchMapping("/{id}/toggle")
    public VoucherResponse toggle(@PathVariable Long id) {
        return voucherService.toggleActive(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        voucherService.delete(id);
    }
}
