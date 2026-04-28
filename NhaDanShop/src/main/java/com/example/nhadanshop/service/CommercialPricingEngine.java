package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoiceItem;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Shared commercial math for quotes, quote-mode invoices, and pending-order snapshots (Slice 6C).
 * VAT v1: {@code vatBase = merchandise subtotal}, {@code vatAmount = floor(subtotal * vatPercent / 100)} (no discount reduces VAT base).
 */
public final class CommercialPricingEngine {

    private CommercialPricingEngine() {}

    public record PromoPricingLine(Product product, BigDecimal lineAmount) {}

    public static PricingBreakdownSnapshotDto computePricing(
            BigDecimal merchandiseSubtotalBeforeInvoiceDiscounts,
            BigDecimal manualDiscountRaw,
            Promotion promotionOrNull,
            List<PromoPricingLine> promoLines,
            BigDecimal voucherDiscountRaw,
            BigDecimal shippingFeeRaw,
            BigDecimal shippingDiscountRaw,
            BigDecimal vatPercentRaw
    ) {
        BigDecimal S = nz(merchandiseSubtotalBeforeInvoiceDiscounts);
        BigDecimal md = nz(manualDiscountRaw).min(S);
        BigDecimal pd = promotionOrNull != null && !promoLines.isEmpty()
                ? computePromotionDiscountInternal(promotionOrNull, promoLines, S)
                : BigDecimal.ZERO;

        BigDecimal vd = nz(voucherDiscountRaw).max(BigDecimal.ZERO);
        BigDecimal remainderAfterMv = S.subtract(md).subtract(pd);
        if (vd.compareTo(remainderAfterMv) > 0) {
            vd = remainderAfterMv.max(BigDecimal.ZERO);
        }

        BigDecimal sf = nz(shippingFeeRaw).max(BigDecimal.ZERO);
        BigDecimal sdf = nz(shippingDiscountRaw).max(BigDecimal.ZERO);
        if (sdf.compareTo(sf) > 0) {
            sdf = sf;
        }

        BigDecimal vatPct = nz(vatPercentRaw).max(BigDecimal.ZERO);
        if (vatPct.compareTo(new BigDecimal("100")) > 0) {
            vatPct = new BigDecimal("100");
        }
        BigDecimal vatAmount = S.multiply(vatPct)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR);

        BigDecimal total = S.subtract(md).subtract(pd).subtract(vd).add(sf).subtract(sdf).add(vatAmount);

        return new PricingBreakdownSnapshotDto(
                S,
                md,
                pd,
                vd,
                sf,
                sdf,
                S,
                vatPct,
                vatAmount,
                total
        );
    }

    /** Legacy invoice items path — matches invoice-layer promotion math. */
    public static BigDecimal computePromotionDiscount(Promotion promo, List<SalesInvoiceItem> items, BigDecimal merchandiseTotal) {
        validatePromotionEligibility(promo, items);
        return computePromotionDiscountInternalFromInvoiceItems(promo, items, merchandiseTotal);
    }

    private static BigDecimal computePromotionDiscountInternal(
            Promotion promo,
            List<PromoPricingLine> lines,
            BigDecimal merchandiseTotal
    ) {
        validatePromotionEligibilityFromLines(promo, lines);
        BigDecimal eligibleAmount = computeEligibleAmount(promo, lines, merchandiseTotal);
        if (merchandiseTotal.compareTo(promo.getMinOrderValue()) < 0) return BigDecimal.ZERO;
        return switch (promo.getType()) {
            case "PERCENT_DISCOUNT" -> {
                BigDecimal pct = promo.getDiscountValue().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
                BigDecimal disc = eligibleAmount.multiply(pct).setScale(0, RoundingMode.HALF_UP);
                if (promo.getMaxDiscount() != null && disc.compareTo(promo.getMaxDiscount()) > 0) {
                    disc = promo.getMaxDiscount();
                }
                yield disc;
            }
            case "FIXED_DISCOUNT" -> {
                BigDecimal disc = promo.getDiscountValue();
                yield disc.compareTo(eligibleAmount) > 0 ? eligibleAmount : disc;
            }
            default -> BigDecimal.ZERO;
        };
    }

    private static BigDecimal computePromotionDiscountInternalFromInvoiceItems(
            Promotion promo,
            List<SalesInvoiceItem> items,
            BigDecimal merchandiseTotal
    ) {
        BigDecimal eligibleAmount = computeEligibleAmountFromItems(promo, items, merchandiseTotal);
        if (merchandiseTotal.compareTo(promo.getMinOrderValue()) < 0) return BigDecimal.ZERO;
        return switch (promo.getType()) {
            case "PERCENT_DISCOUNT" -> {
                BigDecimal pct = promo.getDiscountValue().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
                BigDecimal disc = eligibleAmount.multiply(pct).setScale(0, RoundingMode.HALF_UP);
                if (promo.getMaxDiscount() != null && disc.compareTo(promo.getMaxDiscount()) > 0) {
                    disc = promo.getMaxDiscount();
                }
                yield disc;
            }
            case "FIXED_DISCOUNT" -> {
                BigDecimal disc = promo.getDiscountValue();
                yield disc.compareTo(eligibleAmount) > 0 ? eligibleAmount : disc;
            }
            default -> BigDecimal.ZERO;
        };
    }

    private static void validatePromotionEligibilityFromLines(Promotion promo, List<PromoPricingLine> lines) {
        String appliesTo = promo.getAppliesTo();
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> eligibleIds = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            boolean hasEligible = lines.stream().anyMatch(l -> eligibleIds.contains(l.product().getId()));
            if (!hasEligible) {
                String names = promo.getProducts().stream().map(Product::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho san pham: " + names);
            }
        } else if ("CATEGORY".equals(appliesTo)) {
            Set<Long> eligibleCatIds = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            boolean hasEligible = lines.stream().anyMatch(l ->
                    eligibleCatIds.contains(l.product().getCategory().getId()));
            if (!hasEligible) {
                String names = promo.getCategories().stream().map(Category::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho danh muc: " + names);
            }
        }
    }

    private static void validatePromotionEligibility(Promotion promo, List<SalesInvoiceItem> items) {
        String appliesTo = promo.getAppliesTo();
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> eligibleIds = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            boolean hasEligible = items.stream().anyMatch(i -> eligibleIds.contains(i.getProduct().getId()));
            if (!hasEligible) {
                String names = promo.getProducts().stream().map(Product::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho san pham: " + names);
            }
        } else if ("CATEGORY".equals(appliesTo)) {
            Set<Long> eligibleCatIds = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            boolean hasEligible = items.stream().anyMatch(i ->
                    eligibleCatIds.contains(i.getProduct().getCategory().getId()));
            if (!hasEligible) {
                String names = promo.getCategories().stream().map(Category::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho danh muc: " + names);
            }
        }
    }

    private static BigDecimal computeEligibleAmount(Promotion promo, List<PromoPricingLine> lines, BigDecimal totalAmount) {
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) return totalAmount;
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> ids = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            return lines.stream().filter(l -> ids.contains(l.product().getId()))
                    .map(PromoPricingLine::lineAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        if ("CATEGORY".equals(appliesTo)) {
            Set<Long> ids = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            return lines.stream().filter(l -> ids.contains(l.product().getCategory().getId()))
                    .map(PromoPricingLine::lineAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        return totalAmount;
    }

    private static BigDecimal computeEligibleAmountFromItems(Promotion promo, List<SalesInvoiceItem> items, BigDecimal totalAmount) {
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) return totalAmount;
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> ids = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            return items.stream().filter(i -> ids.contains(i.getProduct().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        if ("CATEGORY".equals(appliesTo)) {
            Set<Long> ids = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            return items.stream().filter(i -> ids.contains(i.getProduct().getCategory().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        return totalAmount;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
