package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record SalesQuoteRequest(
        @NotBlank @Size(max = 32) String source,
        @Size(max = 100) String customerId,
        @Valid @NotEmpty List<SalesQuoteLineRequest> lines,
        Long promotionId,
        @Size(max = 64) String voucherCode,
        /**
         * POS/admin only: client-provided shipping context. Ignored for {@code source=storefront}
         * (server recomputes via {@link com.example.nhadanshop.service.ShippingQuoteService}).
         */
        @Valid ShippingQuoteSnapshotDto shippingQuoteSnapshot,
        /**
         * Storefront: required — used to compute shipping; client fee / snapshot is not trusted.
         * POS/admin: optional.
         */
        @Valid ShippingAddressDto shippingAddress,
        BigDecimal manualDiscount,
        BigDecimal vatPercent,
        Long requestedRedeemPoints
) {
    public SalesQuoteRequest(
            String source,
            String customerId,
            List<SalesQuoteLineRequest> lines,
            Long promotionId,
            String voucherCode,
            ShippingQuoteSnapshotDto shippingQuoteSnapshot,
            ShippingAddressDto shippingAddress,
            BigDecimal manualDiscount,
            BigDecimal vatPercent
    ) {
        this(source, customerId, lines, promotionId, voucherCode, shippingQuoteSnapshot,
                shippingAddress, manualDiscount, vatPercent, null);
    }
}
