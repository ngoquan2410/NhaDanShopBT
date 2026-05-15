package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.SalesQuoteResponse;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.HashSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        SalesQuoteService.class,
        ShippingSettingsService.class,
        ShippingQuoteService.class,
        PromotionEvaluationService.class,
        GhnShippingService.class,
        ProductVariantService.class,
        ProductComboService.class,
        Slice7CommercialFlowIntegrationTest.TestCfg.class
})
class SalesQuotePromotionFlowIntegrationTest {
    @MockBean private StockedCatalogGuardService stockedCatalogGuardService;
    @MockBean private CustomerLoyaltyService customerLoyaltyService;
    @MockBean private AccountService accountService;

    @Autowired private SalesQuoteService salesQuoteService;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private ProductBatchRepository batchRepository;
    @Autowired private PromotionRepository promotionRepository;

    @Test
    void returns_effective_promotion_fields_from_applied_promo() {
        ProductVariant v = mkVariant("SQT-EFF");
        mkBatch(v, 10);
        Promotion promo = mkPromotion("SQT-EFF-PROMO", "PERCENT_DISCOUNT", new BigDecimal("10"));
        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                promo.getId(), null, null, shipAddr(), null, BigDecimal.ZERO
        ));
        assertEquals(promo.getId(), quote.effectivePromotionId());
        assertEquals(promo.getName(), quote.effectivePromotionName());
        assertEquals(promo.getType(), quote.effectivePromotionType());
    }

    @Test
    void manual_invalid_keeps_invalid_reason_and_no_effective_promotion() {
        ProductVariant v = mkVariant("SQT-INV");
        mkBatch(v, 10);
        Promotion inactive = mkPromotion("SQT-OLD", "PERCENT_DISCOUNT", new BigDecimal("10"));
        inactive.setActive(false);
        promotionRepository.save(inactive);
        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                inactive.getId(), null, null, shipAddr(), null, BigDecimal.ZERO
        ));
        assertNotNull(quote.selectedPromotionInvalidReason());
        assertNull(quote.effectivePromotionId());
        assertNull(quote.effectivePromotionName());
        assertNull(quote.effectivePromotionType());
    }

    @Test
    void free_shipping_has_shipping_discount_without_promotion_discount_stack() {
        ProductVariant v = mkVariant("SQT-NOSTACK");
        mkBatch(v, 10);
        Promotion freeShip = mkPromotion("SQT-FS", "FREE_SHIPPING", BigDecimal.ZERO);
        freeShip.setMaxDiscount(new BigDecimal("50000"));
        promotionRepository.save(freeShip);
        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                freeShip.getId(), null, null, shipAddr(), null, BigDecimal.ZERO
        ));
        assertEquals(0, quote.pricingBreakdownSnapshot().promotionDiscount().compareTo(BigDecimal.ZERO));
        assertEquals(true, quote.pricingBreakdownSnapshot().shippingDiscount().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void buy_x_get_y_repeatable_false_vs_true_affects_reward_quantity() {
        ProductVariant paid = mkVariant("SQT-BXGY-PAID");
        ProductVariant gift = mkVariant("SQT-BXGY-GIFT");
        mkBatch(paid, 20);
        mkBatch(gift, 20);

        Promotion nonRepeatable = mkBuyXGetYPromotion("SQT-BXGY-NR", paid.getProduct().getId(), gift.getProduct().getId(), 2, 1, false, null);
        Promotion repeatable = mkBuyXGetYPromotion("SQT-BXGY-R", paid.getProduct().getId(), gift.getProduct().getId(), 2, 1, true, null);

        List<SalesQuoteLineRequest> lines = List.of(
                new SalesQuoteLineRequest(paid.getProduct().getId(), paid.getId(), 6, BigDecimal.ZERO, null, false));
        SalesQuoteResponse quoteNonRepeat = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null, lines, nonRepeatable.getId(), null, null, shipAddr(), null, BigDecimal.ZERO));
        SalesQuoteResponse quoteRepeat = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null, lines, repeatable.getId(), null, null, shipAddr(), null, BigDecimal.ZERO));

        assertEquals(1, quoteNonRepeat.rewardLines().size());
        assertEquals(1, quoteNonRepeat.rewardLines().get(0).quantity());
        assertEquals(1, quoteRepeat.rewardLines().size());
        assertEquals(3, quoteRepeat.rewardLines().get(0).quantity());
    }

    @Test
    void quantity_gift_repeatable_false_vs_true_and_max_cap() {
        ProductVariant trigger = mkVariant("SQT-QG-TRIG");
        ProductVariant gift = mkVariant("SQT-QG-GIFT");
        mkBatch(trigger, 20);
        mkBatch(gift, 20);

        Promotion nonRepeatable = mkQuantityGiftPromotion("SQT-QG-NR", trigger.getProduct().getId(), gift.getProduct().getId(), 2, 1, false, null);
        Promotion repeatable = mkQuantityGiftPromotion("SQT-QG-R", trigger.getProduct().getId(), gift.getProduct().getId(), 2, 1, true, null);
        Promotion capped = mkQuantityGiftPromotion("SQT-QG-CAP", trigger.getProduct().getId(), gift.getProduct().getId(), 2, 1, true, 2);

        List<SalesQuoteLineRequest> lines = List.of(
                new SalesQuoteLineRequest(trigger.getProduct().getId(), trigger.getId(), 6, BigDecimal.ZERO, null, false));
        SalesQuoteResponse quoteNonRepeat = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null, lines, nonRepeatable.getId(), null, null, shipAddr(), null, BigDecimal.ZERO));
        SalesQuoteResponse quoteRepeat = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null, lines, repeatable.getId(), null, null, shipAddr(), null, BigDecimal.ZERO));
        SalesQuoteResponse quoteCapped = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null, lines, capped.getId(), null, null, shipAddr(), null, BigDecimal.ZERO));

        assertEquals(1, quoteNonRepeat.rewardLines().get(0).quantity());
        assertEquals(3, quoteRepeat.rewardLines().get(0).quantity());
        assertEquals(2, quoteCapped.rewardLines().get(0).quantity());
    }

    @Test
    void quantity_gift_insufficient_stock_checks_paid_plus_gift() {
        ProductVariant same = mkVariant("SQT-QG-STOCK");
        mkBatch(same, 3);
        Promotion promo = mkQuantityGiftPromotion("SQT-QG-STOCK-P", same.getProduct().getId(), same.getProduct().getId(), 2, 2, true, null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null,
                List.of(new SalesQuoteLineRequest(same.getProduct().getId(), same.getId(), 2, BigDecimal.ZERO, null, false)),
                promo.getId(), null, null, shipAddr(), null, BigDecimal.ZERO
        )));
        assertTrue(ex.getMessage().contains("Không đủ tồn bán được cho đơn hàng và quà tặng"));
    }

    private ProductVariant mkVariant(String sku) {
        Category cat = new Category();
        cat.setName("CAT-" + sku);
        cat.setActive(true);
        cat = categoryRepository.save(cat);
        Product p = new Product();
        p.setCode("P-" + sku);
        p.setName("P-" + sku);
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        p = productRepository.save(p);
        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode(sku);
        v.setVariantName("V");
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(new BigDecimal("100000"));
        v.setCostPrice(new BigDecimal("50000"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private void mkBatch(ProductVariant variant, int qty) {
        ProductBatch b = new ProductBatch();
        b.setProduct(variant.getProduct());
        b.setVariant(variant);
        b.setBatchCode("B-" + System.nanoTime());
        b.setExpiryDate(LocalDate.now().plusDays(30));
        b.setImportQty(qty);
        b.setRemainingQty(qty);
        b.setCostPrice(new BigDecimal("50000"));
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        batchRepository.save(b);
    }

    private Promotion mkPromotion(String name, String type, BigDecimal discount) {
        Promotion p = new Promotion();
        p.setName(name);
        p.setType(type);
        p.setDiscountValue(discount);
        p.setMinOrderValue(BigDecimal.ZERO);
        p.setStartDate(LocalDateTime.now().minusDays(1));
        p.setEndDate(LocalDateTime.now().plusDays(5));
        p.setActive(true);
        p.setAppliesTo("ALL");
        return promotionRepository.save(p);
    }

    private Promotion mkBuyXGetYPromotion(
            String name,
            Long buyProductId,
            Long giftProductId,
            int buyQty,
            int getQty,
            boolean repeatable,
            Integer maxApplications
    ) {
        Promotion p = mkPromotion(name, "BUY_X_GET_Y", BigDecimal.ZERO);
        p.setAppliesTo("PRODUCT");
        p.setProducts(new HashSet<>(Set.of(productRepository.findById(buyProductId).orElseThrow())));
        p.setBuyQty(buyQty);
        p.setGetProductId(giftProductId);
        p.setGetQty(getQty);
        p.setRepeatable(repeatable);
        p.setMaxBuyQty(maxApplications);
        return promotionRepository.save(p);
    }

    private Promotion mkQuantityGiftPromotion(
            String name,
            Long triggerProductId,
            Long giftProductId,
            int minBuyQty,
            int getQty,
            boolean repeatable,
            Integer maxApplications
    ) {
        Promotion p = mkPromotion(name, "QUANTITY_GIFT", BigDecimal.ZERO);
        p.setAppliesTo("PRODUCT");
        p.setProducts(new HashSet<>(Set.of(productRepository.findById(triggerProductId).orElseThrow())));
        p.setMinBuyQty(minBuyQty);
        p.setGetProductId(giftProductId);
        p.setGetQty(getQty);
        p.setRepeatable(repeatable);
        p.setMaxBuyQty(maxApplications);
        return promotionRepository.save(p);
    }

    private ShippingAddressDto shipAddr() {
        return new ShippingAddressDto("A", "090", "79", "HCM", "760", "Q1", "26734", "P Ben Nghe", "1 Le Loi", null, null);
    }
}
