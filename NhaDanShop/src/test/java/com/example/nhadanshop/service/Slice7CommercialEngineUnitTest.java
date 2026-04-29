package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CommercialLineSnapshotDto;
import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Slice 7 acceptance tests for commercial allocation ({@link CommercialPricingEngine},
 * {@link CommercialDiscountAllocationService}). Naming is test-only.
 */
class Slice7CommercialEngineUnitTest {

    private static Promotion promo(String type, String appliesTo) {
        Promotion p = new Promotion();
        p.setName("P1");
        p.setType(type);
        p.setDiscountValue(BigDecimal.ZERO);
        p.setMinOrderValue(BigDecimal.ZERO);
        LocalDate anchor = LocalDate.of(2026, 1, 1);
        p.setStartDate(anchor.atStartOfDay());
        p.setEndDate(anchor.plusYears(10).atTime(23, 59));
        p.setAppliesTo(appliesTo);
        p.setActive(true);
        return p;
    }

    private static Product product(long id, long categoryId, String code) {
        Product pr = new Product();
        pr.setId(id);
        pr.setCode(code);
        pr.setName("P" + id);
        Category c = new Category();
        c.setId(categoryId);
        c.setName("C" + categoryId);
        pr.setCategory(c);
        return pr;
    }

    private static CommercialPricingEngine.BillableAllocationRow row(
            Long productId,
            Long categoryId,
            BigDecimal gross,
            BigDecimal netBeforeInvoice) {
        return new CommercialPricingEngine.BillableAllocationRow(productId, categoryId, gross, netBeforeInvoice);
    }

    @Test
    void acceptance_85a_manual_allocation_uses_line_net_bases_not_quantity() {
        BigDecimal s = new BigDecimal("100000");
        BigDecimal lineA = new BigDecimal("25000");
        BigDecimal lineB = new BigDecimal("75000");
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(1L, 1L, lineA.multiply(BigDecimal.valueOf(2)), lineA),
                row(2L, 1L, lineB.multiply(BigDecimal.valueOf(2)), lineB));
        List<CommercialPricingEngine.PromoPricingLine> promoLines = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 1L, "A"), lineA),
                new CommercialPricingEngine.PromoPricingLine(product(2L, 1L, "B"), lineB));

        CommercialPricingEngine.QuoteCommercialResult qc = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                s,
                new BigDecimal("10000"),
                null,
                promoLines,
                rows,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO);

        CommercialLineSnapshotDto a = qc.billableLineSnapshots().get(0);
        CommercialLineSnapshotDto b = qc.billableLineSnapshots().get(1);
        assertEquals(10000, a.allocatedManualDiscount().add(b.allocatedManualDiscount()).intValue());
        assertEquals(2500, a.allocatedManualDiscount().intValue());
        assertEquals(7500, b.allocatedManualDiscount().intValue());
    }

    @Test
    void acceptance_85b_product_scope_allocates_promotion_only_to_eligible_lines() {
        Promotion p = promo("FIXED_DISCOUNT", "PRODUCT");
        p.setDiscountValue(new BigDecimal("3000"));
        Product eligible = product(10L, 1L, "EL");
        p.getProducts().add(eligible);

        BigDecimal lineNet = new BigDecimal("40000");
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(10L, 1L, lineNet, lineNet),
                row(99L, 1L, lineNet, lineNet));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(10L, 1L, "EL"), lineNet),
                new CommercialPricingEngine.PromoPricingLine(product(99L, 1L, "X"), lineNet));

        CommercialPricingEngine.QuoteCommercialResult qc = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                lineNet.multiply(BigDecimal.valueOf(2)),
                BigDecimal.ZERO,
                p,
                pl,
                rows,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO);

        assertEquals(3000, qc.breakdown().promotionDiscount().intValue());
        assertEquals(3000, qc.billableLineSnapshots().get(0).allocatedPromotionDiscount().intValue());
        assertEquals(0, qc.billableLineSnapshots().get(1).allocatedPromotionDiscount().intValue());
    }

    @Test
    void acceptance_85b_category_scope_allocates_only_to_matching_category() {
        Promotion p = promo("FIXED_DISCOUNT", "CATEGORY");
        p.setDiscountValue(new BigDecimal("500"));
        Category cat7 = new Category();
        cat7.setId(7L);
        cat7.setName("C7");
        p.getCategories().add(cat7);

        BigDecimal lineNet = new BigDecimal("20000");
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(1L, 7L, lineNet, lineNet),
                row(2L, 8L, lineNet, lineNet));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 7L, "A"), lineNet),
                new CommercialPricingEngine.PromoPricingLine(product(2L, 8L, "B"), lineNet));

        CommercialPricingEngine.QuoteCommercialResult qc = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                lineNet.multiply(BigDecimal.valueOf(2)),
                BigDecimal.ZERO,
                p,
                pl,
                rows,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO);

        assertEquals(500, qc.billableLineSnapshots().get(0).allocatedPromotionDiscount().intValue());
        assertEquals(0, qc.billableLineSnapshots().get(1).allocatedPromotionDiscount().intValue());
    }

    @Test
    void acceptance_85c_deterministic_vnd_allocation_sums_to_bucket() {
        List<BigDecimal> bases = List.of(
                new BigDecimal("10001"),
                new BigDecimal("20002"),
                new BigDecimal("30003"));
        List<BigDecimal> am = CommercialDiscountAllocationService.allocate(
                new BigDecimal("12345"), bases, List.of(true, true, true));
        assertEquals(12345, am.stream().reduce(BigDecimal.ZERO, BigDecimal::add).intValue());
    }

    @Test
    void acceptance_85d_separate_manual_promo_voucher_and_combined_merchandise_columns() {
        BigDecimal line = new BigDecimal("100000");
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(row(1L, 1L, line, line));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 1L, "A"), line));
        CommercialLineSnapshotDto x = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                line,
                new BigDecimal("5000"),
                null,
                pl,
                rows,
                new BigDecimal("3000"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO).billableLineSnapshots().get(0);

        assertEquals(5000, x.allocatedManualDiscount().intValue());
        assertEquals(0, x.allocatedPromotionDiscount().intValue());
        assertEquals(3000, x.allocatedVoucherDiscount().intValue());
        assertEquals(8000, x.allocatedMerchandiseDiscount().intValue());
    }

    @Test
    void acceptance_85g_free_shipping_promo_plus_voucher_caps_at_shipping_fee() {
        Promotion fs = promo("FREE_SHIPPING", "ALL");
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(1L, 1L, new BigDecimal("50000"), new BigDecimal("50000")));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 1L, "A"), new BigDecimal("50000")));
        PricingBreakdownSnapshotDto b = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                fs,
                pl,
                rows,
                BigDecimal.ZERO,
                new BigDecimal("40000"),
                new BigDecimal("40000"),
                new BigDecimal("50000"),
                BigDecimal.ZERO).breakdown();

        assertEquals(40000, b.shippingFee().intValue());
        assertEquals(40000, b.shippingDiscount().intValue());
        assertEquals(0, b.shippingNetRevenue().intValue());
    }

    @Test
    void acceptance_85h_vat_base_is_merchandise_net_excludes_shipping() {
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(1L, 1L, new BigDecimal("100000"), new BigDecimal("100000")));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 1L, "A"), new BigDecimal("100000")));
        PricingBreakdownSnapshotDto b = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                new BigDecimal("100000"),
                BigDecimal.ZERO,
                null,
                pl,
                rows,
                BigDecimal.ZERO,
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                new BigDecimal("10")).breakdown();

        assertEquals(100000, b.vatBase().intValue());
        assertEquals(10000, b.vatAmount().setScale(0, RoundingMode.UNNECESSARY).intValue());
    }

    @Test
    void acceptance_85i_payable_total_equals_item_net_plus_shipping_net_plus_vat() {
        List<CommercialPricingEngine.BillableAllocationRow> rows = List.of(
                row(1L, 1L, new BigDecimal("50000"), new BigDecimal("50000")));
        List<CommercialPricingEngine.PromoPricingLine> pl = List.of(
                new CommercialPricingEngine.PromoPricingLine(product(1L, 1L, "A"), new BigDecimal("50000")));
        PricingBreakdownSnapshotDto b = CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                null,
                pl,
                rows,
                BigDecimal.ZERO,
                new BigDecimal("12000"),
                BigDecimal.ZERO,
                new BigDecimal("2000"),
                new BigDecimal("8")).breakdown();

        assertEquals(0, b.total().compareTo(
                b.itemNetRevenue().add(b.shippingNetRevenue()).add(b.vatAmount())));
    }
}
