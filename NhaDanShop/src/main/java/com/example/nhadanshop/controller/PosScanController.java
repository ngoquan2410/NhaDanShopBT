package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.PosScanResponse;
import com.example.nhadanshop.service.PosScanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pos")
@RequiredArgsConstructor
public class PosScanController {

    private final PosScanService posScanService;

    /**
     * GET /api/pos/scan/{code}
     * Supports {@code BATCH:{batchId}} and legacy variant/product barcode codes.
     */
    @GetMapping("/scan/{code}")
    public PosScanResponse scan(@PathVariable("code") String code) {
        return posScanService.scan(code);
    }
}
