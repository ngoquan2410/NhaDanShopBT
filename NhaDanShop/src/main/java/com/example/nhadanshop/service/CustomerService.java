package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CustomerRequest;
import com.example.nhadanshop.dto.CustomerResponse;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.repository.CustomerRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CustomerResponse> getAll() {
        return customerRepository.findByActiveTrueOrderByNameAsc()
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CustomerResponse> search(String q) {
        if (q == null || q.isBlank()) return getAll();
        return customerRepository.searchActive(q.trim())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public CustomerResponse getById(Long id) {
        return toResponse(findOrThrow(id));
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    @Transactional
    public CustomerResponse create(CustomerRequest req) {
        // Tự sinh code nếu FE không gửi (VD: tạo inline từ form hóa đơn)
        String code;
        if (req.code() == null || req.code().isBlank()) {
            code = generateNextCode();
        } else {
            code = req.code().trim().toUpperCase();
            if (customerRepository.existsByCode(code))
                throw new IllegalStateException("Mã KH '" + code + "' đã tồn tại.");
        }

        Customer c = new Customer();
        applyFields(c, req, code);
        return toResponse(customerRepository.save(c));
    }

    /** Sinh mã KH tự động: KH001, KH002, ... tìm số lớn nhất hiện có rồi +1 */
    private String generateNextCode() {
        // Lấy tất cả code bắt đầu bằng KH, tìm số lớn nhất
        long maxNum = customerRepository.findAll().stream()
                .map(Customer::getCode)
                .filter(c -> c != null && c.matches("KH\\d+"))
                .mapToLong(c -> {
                    try { return Long.parseLong(c.substring(2)); }
                    catch (NumberFormatException e) { return 0L; }
                })
                .max()
                .orElse(0L);

        String candidate;
        do {
            maxNum++;
            candidate = String.format("KH%03d", maxNum);
        } while (customerRepository.existsByCode(candidate));

        return candidate;
    }

    @Transactional
    public CustomerResponse update(Long id, CustomerRequest req) {
        Customer c = findOrThrow(id);
        String code = req.code().trim().toUpperCase();
        if (!code.equals(c.getCode()) && customerRepository.existsByCodeAndIdNot(code, id))
            throw new IllegalStateException("Mã KH '" + code + "' đã tồn tại.");

        applyFields(c, req, code);
        return toResponse(customerRepository.save(c));
    }

    @Transactional
    public void deactivate(Long id) {
        Customer c = findOrThrow(id);
        c.setActive(false);
        customerRepository.save(c);
    }

    /**
     * Cộng tổng chi tiêu cho KH khi tạo hóa đơn.
     * Dùng @Modifying query để atomic — tránh lost-update khi nhiều HĐ cùng lúc.
     * Gọi từ InvoiceService sau khi lưu HĐ thành công.
     */
    @Transactional
    public void addSpend(Long customerId, BigDecimal amount) {
        if (customerId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;
        customerRepository.addSpend(customerId, amount);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private Customer findOrThrow(Long id) {
        return customerRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy KH ID: " + id));
    }

    private void applyFields(Customer c, CustomerRequest req, String code) {
        c.setCode(code);
        c.setName(req.name().trim());
        c.setPhone(req.phone() != null ? req.phone().trim() : null);
        c.setAddress(req.address());
        c.setEmail(req.email());
        c.setNote(req.note());
        if (req.active() != null) c.setActive(req.active());

        // Parse customer group — mặc định RETAIL
        if (req.group() != null && !req.group().isBlank()) {
            try {
                c.setGroup(Customer.CustomerGroup.valueOf(req.group().toUpperCase()));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Nhóm KH không hợp lệ: '" + req.group() +
                        "'. Chấp nhận: RETAIL, WHOLESALE, VIP");
            }
        } else {
            if (c.getGroup() == null) c.setGroup(Customer.CustomerGroup.RETAIL);
        }
    }

    public CustomerResponse toResponse(Customer c) {
        return new CustomerResponse(
                c.getId(), c.getCode(), c.getName(), c.getPhone(),
                c.getAddress(), c.getEmail(),
                c.getGroup() != null ? c.getGroup().name() : "RETAIL",
                c.getTotalSpend(), c.getDebt(),
                c.getNote(), c.getActive(),
                c.getCreatedAt(), c.getUpdatedAt()
        );
    }
}
