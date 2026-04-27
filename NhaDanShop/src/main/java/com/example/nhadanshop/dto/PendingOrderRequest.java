package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.time.LocalDateTime;

public record PendingOrderRequest(
        @Size(max = 100) String customerId,
        @Size(max = 150) String customerName,
        @Size(max = 30) String customerPhone,
        @Valid ShippingAddressDto shippingAddress,
        @Size(max = 500) String note,
        @NotBlank @Size(max = 20) String paymentMethod,
        @Valid List<PendingOrderLineRequest> lines,
        @Valid PromotionSnapshotDto promotionSnapshot,
        @Valid VoucherSnapshotDto voucherSnapshot,
        @Valid ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        @Valid PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
        LocalDateTime expiresAt
) {}
