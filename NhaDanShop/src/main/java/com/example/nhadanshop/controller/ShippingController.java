package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ShippingQuoteRequest;
import com.example.nhadanshop.dto.ShippingQuoteResponse;
import com.example.nhadanshop.service.ShippingQuoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shipping")
@RequiredArgsConstructor
public class ShippingController {

    private final ShippingQuoteService shippingQuoteService;

    @PostMapping("/quote")
    public ShippingQuoteResponse quote(@Valid @RequestBody ShippingQuoteRequest request) {
        return shippingQuoteService.quote(request);
    }
}
