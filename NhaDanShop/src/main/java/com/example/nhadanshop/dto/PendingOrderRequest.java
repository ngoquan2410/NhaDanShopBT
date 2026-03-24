package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PendingOrderRequest(
        @Size(max = 150) String customerName,
        @Size(max = 500) String note,
        @NotBlank @Size(max = 20) String paymentMethod,
        @NotEmpty @Valid List<InvoiceItemRequest> items
) {}
