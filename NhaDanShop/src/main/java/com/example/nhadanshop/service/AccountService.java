package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccountService {
    private final UserRepository userRepository;
    private final CustomerRepository customerRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final CustomerLoyaltyService loyaltyService;

    @Transactional
    public Customer ensureLinkedCustomer(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy user: " + username));
        if (user.getCustomer() != null) return user.getCustomer();
        Customer c = new Customer();
        c.setCode(nextCustomerCode());
        c.setName(user.getFullName() != null && !user.getFullName().isBlank() ? user.getFullName() : user.getUsername());
        c.setActive(true);
        c = customerRepository.save(c);
        user.setCustomer(c);
        userRepository.save(user);
        return c;
    }

    @Transactional
    public AccountMeResponse me(String username) {
        User user = userRepository.findByUsername(username).orElseThrow();
        Customer c = ensureLinkedCustomer(username);
        Set<String> roles = user.getRoles().stream().map(r -> r.getName()).collect(Collectors.toSet());
        return new AccountMeResponse(user.getId(), user.getUsername(), user.getFullName(), roles, c.getId(), c.getCode(),
                c.getName(), c.getPhone(), c.getEmail(), c.getAddress(), loyaltyService.summary(c));
    }

    @Transactional
    public AccountMeResponse updateProfile(String username, AccountProfileUpdateRequest req) {
        User user = userRepository.findByUsername(username).orElseThrow();
        Customer c = ensureLinkedCustomer(username);
        if (req.fullName() != null && !req.fullName().isBlank()) {
            user.setFullName(req.fullName().trim());
            c.setName(req.fullName().trim());
        }
        c.setPhone(blankToNull(req.phone()));
        c.setEmail(blankToNull(req.email()));
        c.setAddress(blankToNull(req.address()));
        userRepository.save(user);
        customerRepository.save(c);
        return me(username);
    }

    @Transactional
    public Page<AccountOrderResponse> orders(String username, Pageable pageable) {
        Customer c = ensureLinkedCustomer(username);
        return salesInvoiceRepository.findByCustomerIdOrderByInvoiceDateDesc(c.getId(), pageable).map(this::toOrder);
    }

    @Transactional
    public CustomerPointsSummaryResponse points(String username) {
        return loyaltyService.summary(ensureLinkedCustomer(username));
    }

    @Transactional
    public Page<CustomerPointTransactionResponse> pointHistory(String username, Pageable pageable) {
        return loyaltyService.history(ensureLinkedCustomer(username).getId(), pageable);
    }

    public boolean userOwnsCustomer(String username, Long customerId) {
        return userRepository.findByUsername(username)
                .map(User::getCustomer)
                .map(Customer::getId)
                .filter(id -> id.equals(customerId))
                .isPresent();
    }

    private AccountOrderResponse toOrder(SalesInvoice i) {
        return new AccountOrderResponse(i.getId(), i.getInvoiceNo(), i.getInvoiceDate(), i.getTotalAmount(), i.getDiscountAmount(),
                i.getLoyaltyDiscountAmount(), i.getLoyaltyRedeemedPoints(), i.getPaymentMethod(), i.getStatus().name());
    }

    private String nextCustomerCode() {
        long max = customerRepository.findAll().stream()
                .map(Customer::getCode)
                .filter(c -> c != null && c.matches("KH\\d+"))
                .mapToLong(c -> {
                    try { return Long.parseLong(c.substring(2)); } catch (Exception e) { return 0L; }
                })
                .max().orElse(0L);
        String candidate;
        do {
            candidate = String.format("KH%03d", ++max);
        } while (customerRepository.existsByCode(candidate));
        return candidate;
    }

    private String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
}
