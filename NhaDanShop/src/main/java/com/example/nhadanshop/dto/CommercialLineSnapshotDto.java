package com.example.nhadanshop.dto;

import java.math.BigDecimal;

/**
 * Frozen per-line commercial snapshot for quotes and invoice materialization:
 * allocated discounts, net revenue, and line VAT allocation.
 */
public record CommercialLineSnapshotDto(
        BigDecimal lineGrossAmount,
        BigDecimal lineOwnDiscountAmount,
        BigDecimal lineNetBeforeInvoiceDiscount,
        BigDecimal allocatedManualDiscount,
        BigDecimal allocatedPromotionDiscount,
        BigDecimal allocatedVoucherDiscount,
        BigDecimal allocatedLoyaltyDiscount,
        BigDecimal allocatedMerchandiseDiscount,
        BigDecimal lineNetRevenue,
        BigDecimal lineVatBase,
        BigDecimal lineVatAmount,
        int commercialAllocationVersion
) {
    public CommercialLineSnapshotDto(
            BigDecimal lineGrossAmount,
            BigDecimal lineOwnDiscountAmount,
            BigDecimal lineNetBeforeInvoiceDiscount,
            BigDecimal allocatedManualDiscount,
            BigDecimal allocatedPromotionDiscount,
            BigDecimal allocatedVoucherDiscount,
            BigDecimal allocatedMerchandiseDiscount,
            BigDecimal lineNetRevenue,
            BigDecimal lineVatBase,
            BigDecimal lineVatAmount,
            int commercialAllocationVersion
    ) {
        this(lineGrossAmount, lineOwnDiscountAmount, lineNetBeforeInvoiceDiscount,
                allocatedManualDiscount, allocatedPromotionDiscount, allocatedVoucherDiscount,
                BigDecimal.ZERO, allocatedMerchandiseDiscount, lineNetRevenue,
                lineVatBase, lineVatAmount, commercialAllocationVersion);
    }
}
