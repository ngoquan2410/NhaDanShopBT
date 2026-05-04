package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.service.AccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {
    private final AccountService accountService;

    @GetMapping("/me")
    public AccountMeResponse me(Authentication auth) {
        return accountService.me(auth.getName());
    }

    @PutMapping("/profile")
    public AccountMeResponse updateProfile(Authentication auth, @Valid @RequestBody AccountProfileUpdateRequest req) {
        return accountService.updateProfile(auth.getName(), req);
    }

    @GetMapping("/orders")
    public Page<AccountOrderResponse> orders(Authentication auth, @PageableDefault(size = 20) Pageable pageable) {
        return accountService.orders(auth.getName(), pageable);
    }

    @GetMapping("/points")
    public CustomerPointsSummaryResponse points(Authentication auth) {
        return accountService.points(auth.getName());
    }

    @GetMapping("/points/history")
    public Page<CustomerPointTransactionResponse> pointHistory(Authentication auth, @PageableDefault(size = 20) Pageable pageable) {
        return accountService.pointHistory(auth.getName(), pageable);
    }
}
