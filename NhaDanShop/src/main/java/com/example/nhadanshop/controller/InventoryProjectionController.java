package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.InventoryProjectionResponse;
import com.example.nhadanshop.service.InventoryProjectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/inventory/projections")
@RequiredArgsConstructor
public class InventoryProjectionController {

    private final InventoryProjectionService inventoryProjectionService;

    @GetMapping
    public List<InventoryProjectionResponse> list() {
        return inventoryProjectionService.listProjections();
    }

    @GetMapping("/{variantId}")
    public InventoryProjectionResponse one(@PathVariable Long variantId) {
        return inventoryProjectionService.getProjection(variantId);
    }
}
