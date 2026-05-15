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
         * Derived from aggregate LINKED bank {@code PaymentEvent}s for bank pending only:
         * {@code NONE | EXACT_PAID | UNDERPAID_LINKED | OVERPAID_LINKED}. Non-bank pending always returns {@code NONE}.
         */
        String paymentLinkStatus,
        /**
         * Delta between {@link #linkedPaymentTotal} and {@link #totalAmount} for bank pending; {@code null} for non-bank.
         */
        BigDecimal paymentDelta,
        Long linkedPaymentEventId,
        BigDecimal linkedPaymentAmount,
        /**
         * Sum of {@code PaymentEvent.amount} for status LINKED bound to this order (bank only). {@code null} for non-bank.
         */
        BigDecimal linkedPaymentTotal,
        /**
         * Count of LINKED bank events bound to this order. {@code 0} for bank without link / non-bank.
         */
        long linkedPaymentCount
) {}
