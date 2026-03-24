package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SalesInvoiceRequest(
        @Size(max = 150) String customerName,
        @Size(max = 500) String note,
        @NotEmpty @Valid List<InvoiceItemRequest> items
) {}
