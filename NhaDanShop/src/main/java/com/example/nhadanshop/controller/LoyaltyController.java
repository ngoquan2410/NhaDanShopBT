package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.LoyaltySettingsResponse;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loyalty")
@RequiredArgsConstructor
public class LoyaltyController {
    private final CustomerLoyaltyService loyaltyService;

    @GetMapping("/settings")
    public LoyaltySettingsResponse settings() {
        return loyaltyService.settings();
    }
}
