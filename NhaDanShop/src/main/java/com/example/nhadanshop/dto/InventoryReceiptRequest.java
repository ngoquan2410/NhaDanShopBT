package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record InventoryReceiptRequest(
        @Size(max = 150) String supplierName,
        @Size(max = 500) String note,
        /** Phí vận chuyển toàn đơn (sẽ chia đều vào giá vốn từng dòng) */
        @DecimalMin("0.00") BigDecimal shippingFee,
        @NotEmpty @Valid List<ReceiptItemRequest> items
) {}
