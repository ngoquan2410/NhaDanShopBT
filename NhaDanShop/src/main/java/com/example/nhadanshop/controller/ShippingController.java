package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ShippingQuoteRequest;
import com.example.nhadanshop.dto.ShippingQuoteResponse;
import com.example.nhadanshop.dto.ShippingSettingsDto;
import com.example.nhadanshop.service.ShippingQuoteService;
import com.example.nhadanshop.service.ShippingSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shipping")
@RequiredArgsConstructor
public class ShippingController {

    private final ShippingQuoteService shippingQuoteService;
    private final ShippingSettingsService shippingSettingsService;

    /** Admin-only; see {@code SecurityConfig}. */
    @GetMapping("/settings")
    public ShippingSettingsDto getSettings() {
        return shippingSettingsService.getSettings();
    }

    /** Admin-only; see {@code SecurityConfig}. */
    @PutMapping("/settings")
    public ShippingSettingsDto putSettings(@Valid @RequestBody ShippingSettingsDto body) {
        return shippingSettingsService.saveSettings(body);
    }

    @PostMapping("/quote")
    public ShippingQuoteResponse quote(@Valid @RequestBody ShippingQuoteRequest request) {
        return shippingQuoteService.quote(request);
    }
}
