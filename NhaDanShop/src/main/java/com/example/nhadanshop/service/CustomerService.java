package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CustomerRequest;
import com.example.nhadanshop.dto.CustomerResponse;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CustomerResponse> getAll() {
        List<Customer> customers = customerRepository.findByActiveTrueOrderByNameAsc();
        return toResponsesWithBatchStats(customers);
    }

    @Transactional(readOnly = true)
    public List<CustomerResponse> search(String q) {
        if (q == null || q.isBlank()) return getAll();
        List<Customer> customers = customerRepository.searchActive(q.trim());
        return toResponsesWithBatchStats(customers);
    }

    @Transactional(readOnly = true)
    public CustomerResponse getById(Long id) {
        Customer c = findOrThrow(id);
        return toResponsesWithBatchStats(List.of(c)).getFirst();
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
        return toResponsesWithBatchStats(List.of(customerRepository.save(c))).getFirst();
    }

    /** Sinh mã KH tự động: KH001, KH002, ... max suffix trong DB (pattern KH+digits) rồi +1; retry nếu trùng. */
    private String generateNextCode() {
        long maxNum = Optional.ofNullable(customerRepository.findMaxKhAutoNumericSuffix()).orElse(0L);
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
        return toResponsesWithBatchStats(List.of(customerRepository.save(c))).getFirst();
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
        return toResponsesWithBatchStats(List.of(c)).getFirst();
    }

    private List<CustomerResponse> toResponsesWithBatchStats(List<Customer> customers) {
        if (customers.isEmpty()) {
            return List.of();
        }
        Map<Long, InvoiceStats> statsByCustomerId = batchInvoiceStatsFor(customers);
        return customers.stream()
                .map(c -> toResponse(c, statsByCustomerId.getOrDefault(c.getId(), InvoiceStats.EMPTY)))
                .toList();
    }

    private CustomerResponse toResponse(Customer c, InvoiceStats stats) {
        return new CustomerResponse(
                c.getId(), c.getCode(), c.getName(), c.getPhone(),
                c.getAddress(), c.getEmail(),
                c.getGroup() != null ? c.getGroup().name() : "RETAIL",
                stats.totalSpend(), c.getDebt(),
                stats.orderCount(),
                stats.lastPurchaseAt(),
                c.getNote(), c.getActive(),
                c.getCreatedAt(), c.getUpdatedAt()
        );
    }

    /**
     * Mirrors per-customer aggregate predicates (COMPLETED only; customer FK OR phone snapshot OR),
     * without issuing per-customer SQL.
     */
    private Map<Long, InvoiceStats> batchInvoiceStatsFor(List<Customer> customers) {
        Set<Long> customerIds = new HashSet<>();
        Set<String> phones = new HashSet<>();
        for (Customer c : customers) {
            customerIds.add(c.getId());
            String p = normalizePhone(c.getPhone());
            if (p != null) {
                phones.add(p);
            }
        }

        List<SalesInvoice> byId = salesInvoiceRepository.findCompletedByCustomerIdIn(
                SalesInvoice.Status.COMPLETED, customerIds);
        List<SalesInvoice> byPhone = phones.isEmpty()
                ? List.of()
                : salesInvoiceRepository.findCompletedByCustomerPhoneIn(SalesInvoice.Status.COMPLETED, phones);

        Map<Long, List<SalesInvoice>> invoicesByLinkedCustomerId = new HashMap<>();
        for (SalesInvoice i : byId) {
            if (i.getCustomer() != null && customerIds.contains(i.getCustomer().getId())) {
                invoicesByLinkedCustomerId
                        .computeIfAbsent(i.getCustomer().getId(), k -> new ArrayList<>())
                        .add(i);
            }
        }
        Map<String, List<SalesInvoice>> invoicesByPhone = new HashMap<>();
        for (SalesInvoice i : byPhone) {
            if (i.getCustomerPhone() != null && phones.contains(i.getCustomerPhone())) {
                invoicesByPhone.computeIfAbsent(i.getCustomerPhone(), k -> new ArrayList<>()).add(i);
            }
        }

        Map<Long, InvoiceStats> out = new HashMap<>();
        for (Customer c : customers) {
            Set<SalesInvoice> matches = new HashSet<>();
            List<SalesInvoice> idMatches = invoicesByLinkedCustomerId.get(c.getId());
            if (idMatches != null) {
                matches.addAll(idMatches);
            }
            String norm = normalizePhone(c.getPhone());
            if (norm != null) {
                List<SalesInvoice> phoneMatches = invoicesByPhone.get(norm);
                if (phoneMatches != null) {
                    matches.addAll(phoneMatches);
                }
            }
            out.put(c.getId(), aggregateStats(matches));
        }
        return out;
    }

    private static InvoiceStats aggregateStats(Set<SalesInvoice> invoices) {
        if (invoices.isEmpty()) {
            return InvoiceStats.EMPTY;
        }
        BigDecimal total = invoices.stream()
                .map(SalesInvoice::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long count = invoices.size();
        LocalDateTime last = invoices.stream()
                .map(SalesInvoice::getInvoiceDate)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        return new InvoiceStats(total, count, last);
    }

    private record InvoiceStats(BigDecimal totalSpend, long orderCount, LocalDateTime lastPurchaseAt) {
        static final InvoiceStats EMPTY = new InvoiceStats(BigDecimal.ZERO, 0, null);
    }

    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String p = phone.replaceAll("\\D", "");
        return p.isBlank() ? null : p;
    }
}
