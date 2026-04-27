package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.StorePaymentSettingsDto;
import com.example.nhadanshop.service.StorePaymentSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/store")
@RequiredArgsConstructor
public class StoreSettingsController {

    private final StorePaymentSettingsService storePaymentSettingsService;

    @GetMapping("/payment-settings")
    public StorePaymentSettingsDto getPaymentSettings() {
        // Kept public for current checkout/pending-payment compatibility. Narrowing
        // this into separate public/admin DTOs should happen in a follow-up slice.
        return storePaymentSettingsService.getPaymentSettings();
    }

    @PutMapping("/payment-settings")
    public StorePaymentSettingsDto savePaymentSettings(@Valid @RequestBody StorePaymentSettingsDto input) {
        return storePaymentSettingsService.savePaymentSettings(input);
    }
}
