package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.SalesQuoteResponse;
import com.example.nhadanshop.service.SalesQuoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SalesQuoteController {

    private final SalesQuoteService salesQuoteService;

    @PostMapping("/quote")
    public ResponseEntity<SalesQuoteResponse> quote(@Valid @RequestBody SalesQuoteRequest req) {
        return ResponseEntity.ok(salesQuoteService.quote(req));
    }
}
