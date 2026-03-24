package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record InventoryReceiptRequest(
        @Size(max = 150) String supplierName,
        @Size(max = 500) String note,
        @NotEmpty @Valid List<ReceiptItemRequest> items
) {}
