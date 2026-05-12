package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record VoucherSnapshotDto(
        @Size(max = 100) String code,
        @Size(max = 500) String ruleSummary,
        BigDecimal discountAmount,
        BigDecimal shippingDiscountAmount,
        /** True when voucher reduces shipping only (incl. FREESHIP* legacy codes). */
        boolean freeShipping
) {}
