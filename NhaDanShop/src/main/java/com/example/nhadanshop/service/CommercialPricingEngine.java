package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CommercialLineSnapshotDto;
import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoiceItem;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Shared commercial math for quotes, quote-mode invoices, and pending-order snapshots.
 */
public final class CommercialPricingEngine {

    private CommercialPricingEngine() {}

    /** Version stored on quote/invoice snapshots with per-line allocation; bump when allocation rules change. */
    public static final int COMMERCIAL_SNAPSHOT_VERSION = 1;

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
                total,
                null,
                null,
                null
        );
    }

    /**
     * KiotViet-like merchandise allocation + VAT on merchandise net (+ deterministic line VAT split).
     * Use for new quotes; legacy {@link #computePricing} remains for compatibility tests.
     */
    public static QuoteCommercialResult computeMerchandiseQuoteAllocation(
            BigDecimal merchandiseSubtotal,
            BigDecimal manualRaw,
            Promotion promoOrNull,
            List<PromoPricingLine> promoLines,
            List<BillableAllocationRow> billableRows,
            BigDecimal voucherDiscountRaw,
            BigDecimal shippingFeeRaw,
            BigDecimal shippingDiscountPromoRaw,
            BigDecimal shippingDiscountVoucherRaw,
            BigDecimal vatPercentRaw
    ) {
        return computeMerchandiseQuoteAllocation(
                merchandiseSubtotal, manualRaw, promoOrNull, promoLines, billableRows,
                voucherDiscountRaw, BigDecimal.ZERO, 0L, shippingFeeRaw,
                shippingDiscountPromoRaw, shippingDiscountVoucherRaw, vatPercentRaw);
    }

    public static QuoteCommercialResult computeMerchandiseQuoteAllocation(
            BigDecimal merchandiseSubtotal,
            BigDecimal manualRaw,
            Promotion promoOrNull,
            List<PromoPricingLine> promoLines,
            List<BillableAllocationRow> billableRows,
            BigDecimal voucherDiscountRaw,
            BigDecimal loyaltyDiscountRaw,
            Long loyaltyRedeemedPointsRaw,
            BigDecimal shippingFeeRaw,
            BigDecimal shippingDiscountPromoRaw,
            BigDecimal shippingDiscountVoucherRaw,
            BigDecimal vatPercentRaw
    ) {
        if (billableRows.isEmpty()) {
            throw new IllegalArgumentException("Quote must have billable lines");
        }
        if (promoLines.size() != billableRows.size()) {
            throw new IllegalArgumentException("Promotion lines must match billable rows");
        }

        BigDecimal S = nz(merchandiseSubtotal);
        BigDecimal md = nz(manualRaw).min(S);

        BigDecimal pd = BigDecimal.ZERO;
        if (promoOrNull != null && !promoLines.isEmpty() && !"FREE_SHIPPING".equals(promoOrNull.getType())) {
            pd = merchandisePromotionDiscount(promoOrNull, promoLines, S);
        }

        BigDecimal vd = nz(voucherDiscountRaw).max(BigDecimal.ZERO);
        BigDecimal afterMp = S.subtract(md).subtract(pd);
        if (vd.compareTo(afterMp) > 0) {
            vd = afterMp.max(BigDecimal.ZERO);
        }

        BigDecimal ld = nz(loyaltyDiscountRaw).max(BigDecimal.ZERO);
        BigDecimal afterMpv = afterMp.subtract(vd).max(BigDecimal.ZERO);
        if (ld.compareTo(afterMpv) > 0) {
            ld = afterMpv;
        }
        Long loyaltyRedeemedPoints = loyaltyRedeemedPointsRaw != null && loyaltyRedeemedPointsRaw > 0 ? loyaltyRedeemedPointsRaw : 0L;

        List<BigDecimal> bases = new ArrayList<>();
        for (BillableAllocationRow row : billableRows) {
            bases.add(nz(row.lineNetBeforeInvoiceDiscount()));
        }

        List<Boolean> allMask = billableRows.stream().map(r -> Boolean.TRUE).toList();
        List<Boolean> promoMask = billableRows.stream()
                .map(r -> promoRowEligibleForAllocation(promoOrNull, r))
                .toList();

        List<BigDecimal> am = CommercialDiscountAllocationService.allocate(md, bases, allMask);
        List<BigDecimal> ap = CommercialDiscountAllocationService.allocate(pd, bases, promoMask);
        List<BigDecimal> av = CommercialDiscountAllocationService.allocate(vd, bases, allMask);
        List<BigDecimal> al = CommercialDiscountAllocationService.allocate(ld, bases, allMask);

        BigDecimal itemNet = BigDecimal.ZERO;
        List<BigDecimal> netRevenues = new ArrayList<>();
        for (int i = 0; i < billableRows.size(); i++) {
            BigDecimal base = nz(bases.get(i));
            BigDecimal man = nz(am.get(i));
            BigDecimal pr = nz(ap.get(i));
            BigDecimal vo = nz(av.get(i));
            BigDecimal lo = nz(al.get(i));
            BigDecimal allo = man.add(pr).add(vo).add(lo);
            BigDecimal netRev = base.subtract(allo);
            if (netRev.compareTo(BigDecimal.ZERO) < 0) {
                netRev = BigDecimal.ZERO;
            }
            netRevenues.add(netRev);
            itemNet = itemNet.add(netRev);
        }

        BigDecimal sf = nz(shippingFeeRaw).max(BigDecimal.ZERO);
        BigDecimal sdp = nz(shippingDiscountPromoRaw).max(BigDecimal.ZERO);
        BigDecimal sdv = nz(shippingDiscountVoucherRaw).max(BigDecimal.ZERO);
        BigDecimal sdf = sdp.add(sdv);
        if (sdf.compareTo(sf) > 0) {
            sdf = sf;
        }
        BigDecimal shippingNet = sf.subtract(sdf);

        BigDecimal vatPct = nz(vatPercentRaw).max(BigDecimal.ZERO);
        if (vatPct.compareTo(new BigDecimal("100")) > 0) {
            vatPct = new BigDecimal("100");
        }
        BigDecimal vatAmount = itemNet.multiply(vatPct)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR);

        List<Boolean> vatEligible = new ArrayList<>();
        List<BigDecimal> vatWeights = new ArrayList<>();
        for (BigDecimal nr : netRevenues) {
            vatWeights.add(nr);
            vatEligible.add(nr.compareTo(BigDecimal.ZERO) > 0);
        }
        List<BigDecimal> vatPerLine = CommercialDiscountAllocationService.allocate(vatAmount, vatWeights, vatEligible);

        List<CommercialLineSnapshotDto> lineSnapshots = new ArrayList<>();
        for (int i = 0; i < billableRows.size(); i++) {
            BillableAllocationRow row = billableRows.get(i);
            BigDecimal gross = nz(row.lineGrossAmount());
            BigDecimal netBefore = nz(bases.get(i));
            BigDecimal own = gross.subtract(netBefore);
            if (own.compareTo(BigDecimal.ZERO) < 0) {
                own = BigDecimal.ZERO;
            }
            BigDecimal man = nz(am.get(i));
            BigDecimal pr = nz(ap.get(i));
            BigDecimal vo = nz(av.get(i));
            BigDecimal lo = nz(al.get(i));
            BigDecimal allo = man.add(pr).add(vo).add(lo);
            BigDecimal nr = netRevenues.get(i);
            BigDecimal lvat = i < vatPerLine.size() ? nz(vatPerLine.get(i)) : BigDecimal.ZERO;
            lineSnapshots.add(new CommercialLineSnapshotDto(
                    gross,
                    own,
                    netBefore,
                    man,
                    pr,
                    vo,
                    lo,
                    allo,
                    nr,
                    nr,
                    lvat,
                    COMMERCIAL_SNAPSHOT_VERSION
            ));
        }

        BigDecimal total = itemNet.add(shippingNet).add(vatAmount);
        PricingBreakdownSnapshotDto breakdown = new PricingBreakdownSnapshotDto(
                S,
                md,
                pd,
                vd,
                sf,
                sdf,
                itemNet,
                vatPct,
                vatAmount,
                total,
                itemNet,
                shippingNet,
                COMMERCIAL_SNAPSHOT_VERSION,
                ld,
                loyaltyRedeemedPoints
        );
        return new QuoteCommercialResult(breakdown, lineSnapshots);
    }

    /** Per billable quote line for allocation weights and line gross/original snapshots. */
    public record BillableAllocationRow(
            Long productId,
            Long categoryId,
            BigDecimal lineGrossAmount,
            BigDecimal lineNetBeforeInvoiceDiscount
    ) {}

    public record QuoteCommercialResult(
            PricingBreakdownSnapshotDto breakdown,
            List<CommercialLineSnapshotDto> billableLineSnapshots
    ) {}

    private static boolean promoRowEligibleForAllocation(Promotion promo, BillableAllocationRow row) {
        if (promo == null) {
            return true;
        }
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) {
            return true;
        }
        if ("PRODUCT".equals(appliesTo)) {
            return promo.getProducts().stream().anyMatch(p -> p.getId().equals(row.productId()));
        }
        if ("CATEGORY".equals(appliesTo)) {
            if (row.categoryId() == null) {
                return false;
            }
            return promo.getCategories().stream().anyMatch(c -> c.getId().equals(row.categoryId()));
        }
        return true;
    }

    /** Legacy invoice items path — matches invoice-layer promotion math. */
    public static BigDecimal computePromotionDiscount(Promotion promo, List<SalesInvoiceItem> items, BigDecimal merchandiseTotal) {
        validatePromotionEligibility(promo, items);
        return computePromotionDiscountInternalFromInvoiceItems(promo, items, merchandiseTotal);
    }

    /** Exposes merchandise promotion discount from {@link PromoPricingLine} list (quote path). */
    public static BigDecimal merchandisePromotionDiscount(
            Promotion promo,
            List<PromoPricingLine> lines,
            BigDecimal merchandiseTotal
    ) {
        return computePromotionDiscountInternal(promo, lines, merchandiseTotal);
    }

    static BigDecimal computePromotionDiscountInternal(
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
