package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record SalesInvoiceResponse(
        Long id,
        String invoiceNo,
        LocalDateTime invoiceDate,
        String customerName,
        Long customerId,
        String customerPhone,
        ShippingAddressDto shippingAddress,
        String paymentMethod,
        String note,
        BigDecimal totalAmount,
        BigDecimal discountAmount,
        BigDecimal finalAmount,
        String promotionName,
        BigDecimal totalProfit,
        String createdBy,
        List<SalesInvoiceItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        // ── Soft Cancel ────────────────────────────────────────
        String status,          // "COMPLETED" | "CANCELLED"
        LocalDateTime cancelledAt,
        String cancelledBy,
        String cancelReason,
        String sourceType,
        String pendingOrderId,
        List<GiftLineSnapshotDto> giftLinesSnapshot,
        PromotionSnapshotDto promotionSnapshot,
        VoucherSnapshotDto voucherSnapshot,
        ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot,
        BigDecimal vatPercent,
        /** Slice 6C: item-level only (qty × unitPrice); excludes shipping and invoice-wide discount smear. */
        BigDecimal itemRevenue,
        BigDecimal itemCogs,
        BigDecimal itemGrossProfit,
        BigDecimal shippingFee,
        BigDecimal shippingDiscount,
        BigDecimal shippingNetRevenue,
        /** Carrier settlement deferred — null when unknown. */
        BigDecimal shippingActualCost,
        BigDecimal shippingProfit,
        /**
         * Human-readable basis for {@link #totalProfit} (e.g. carrier cost unknown for shipping).
         */
        String invoiceProfitBasis
) {}
