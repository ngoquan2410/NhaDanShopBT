package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PendingOrderResponse(
        String id,
        String code,
        LocalDateTime createdAt,
        LocalDateTime expiresAt,
        String status,
        String customerId,
        String customerName,
        String customerPhone,
        ShippingAddressDto shippingAddress,
        String paymentMethod,
        String paymentReference,
        List<PendingOrderItemResponse> lines,
        List<GiftLineSnapshotDto> giftLinesSnapshot,
        PromotionSnapshotDto promotionSnapshot,
        VoucherSnapshotDto voucherSnapshot,
        ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
        String note,
        // compatibility fields for older callers
        LocalDateTime updatedAt,
        String createdBy,
        String cancelReason,
        BigDecimal totalAmount,
        SalesInvoiceResponse invoice,
        /**
         * Derived from manually/webhook-linked bank {@code PaymentEvent}: NONE, EXACT_PAID, UNDERPAID_LINKED, OVERPAID_LINKED.
         */
        String paymentLinkStatus,
        BigDecimal paymentDelta,
        Long linkedPaymentEventId,
        BigDecimal linkedPaymentAmount
) {}
