package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.LoyaltyRedemptionSnapshotDto;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteLineResponse;
import com.example.nhadanshop.dto.SalesQuotePayloadDto;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.SalesQuoteResponse;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.dto.ShippingQuoteSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesQuote;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesQuoteRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.repository.VoucherRepository;
import com.example.nhadanshop.service.AccountService;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.GhnShippingService;
import com.example.nhadanshop.service.PromotionEvaluationService;
import com.example.nhadanshop.service.SalesQuoteService;
import com.example.nhadanshop.service.SellableStockService;
import com.example.nhadanshop.service.ShippingQuoteService;
import com.example.nhadanshop.service.ShippingSettingsService;
import com.example.nhadanshop.service.StockMutationService;
import com.example.nhadanshop.service.StockedCatalogGuardService;
import com.example.nhadanshop.service.ProductVariantService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.persistence.EntityManager;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Phase 3A — SalesQuote golden / parity baseline (test-only). Documents current commercial semantics
 * before QuoteContext refactor. No production logic changes in this phase.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "casso.webhook-secure-token=phase3a-golden-quote"
})
@Import({
        SalesQuoteService.class,
        ShippingSettingsService.class,
        ShippingQuoteService.class,
        PromotionEvaluationService.class,
        GhnShippingService.class,
        SellableStockService.class,
        ProductVariantService.class,
        StockMutationService.class,
        Phase3aSalesQuoteGoldenBaselineIntegrationTest.TestCfg.class
})
class Phase3aSalesQuoteGoldenBaselineIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(Phase3aSalesQuoteGoldenBaselineIntegrationTest.class);
    private static final String PREFIX = "P3A-" + System.nanoTime();

    @MockBean
    private StockedCatalogGuardService stockedCatalogGuardService;
    @MockBean
    private CustomerLoyaltyService customerLoyaltyService;
    @MockBean
    private AccountService accountService;

    @Autowired
    private SalesQuoteService salesQuoteService;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private ProductComboRepository comboRepository;
    @Autowired
    private PromotionRepository promotionRepository;
    @Autowired
    private VoucherRepository voucherRepository;
    @Autowired
    private SalesQuoteRepository salesQuoteRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private CustomerRepository customerRepository;
    @Autowired
    private StockMutationService stockMutationService;

    @BeforeEach
    void authenticatePosUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("p3a_pos_user", "n/a", List.of()));
    }

    private Statistics stats() {
        return HibernateStatementStatsHelper.statistics(entityManager);
    }

    private void flushClearAndResetStats() {
        entityManager.flush();
        entityManager.clear();
        Statistics s = stats();
        s.clear();
    }

    private long measurePrepareStatements(Runnable action) {
        Statistics s = stats();
        s.clear();
        action.run();
        entityManager.flush();
        return HibernateStatementStatsHelper.prepareStatementCount(s);
    }

    // --- 1. POS manual discount ---
    @Test
    @DisplayName("Golden 1: POS quote — manualDiscount bucket riêng")
    void golden_pos_manual_discount_separate_bucket() {
        ProductVariant v = mkVariant("MAN-D");
        mkBatch(v, 10);
        BigDecimal manual = new BigDecimal("15000");
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, null,
                new ShippingQuoteSnapshotDto("client", "Z1", new BigDecimal("20000"), null),
                null,
                manual,
                BigDecimal.ZERO
        ));
        assertMoney(manual, q.pricingBreakdownSnapshot().manualDiscount());
        assertTrue(q.pricingBreakdownSnapshot().subtotal().compareTo(BigDecimal.ZERO) > 0);
        assertNotNull(q.quoteId());
        assertEquals(1, q.lines().size());
    }

    // --- 2–3. Storefront rejects ---
    @Test
    @DisplayName("Golden 2: Storefront — manual discount bị từ chối")
    void golden_storefront_rejects_manual_discount() {
        ProductVariant v = mkVariant("SF-MAN");
        mkBatch(v, 5);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                salesQuoteService.quote(new SalesQuoteRequest(
                        "storefront", null,
                        List.of(line(v, 1, BigDecimal.ZERO, null)),
                        null, null, null, shipAddr(), new BigDecimal("1"), BigDecimal.ZERO
                )));
        assertTrue(ex.getMessage().toLowerCase().contains("thu cong")
                || ex.getMessage().contains("giam gia"));
    }

    @Test
    @DisplayName("Golden 3: Storefront — line discount bị từ chối")
    void golden_storefront_rejects_line_discount() {
        ProductVariant v = mkVariant("SF-LINE");
        mkBatch(v, 5);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                salesQuoteService.quote(new SalesQuoteRequest(
                        "storefront", null,
                        List.of(line(v, 1, new BigDecimal("10"), null)),
                        null, null, null, shipAddr(), null, BigDecimal.ZERO
                )));
        assertTrue(ex.getMessage().contains("dong") || ex.getMessage().contains("giam gia"));
    }

    @Test
    @DisplayName("Golden 3b: Client không được gửi rewardLine=true")
    void golden_client_reward_line_rejected() {
        ProductVariant v = mkVariant("SF-RWD");
        mkBatch(v, 5);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                salesQuoteService.quote(new SalesQuoteRequest(
                        "storefront", null,
                        List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, true)),
                        null, null, null, shipAddr(), null, BigDecimal.ZERO
                )));
        assertTrue(ex.getMessage().contains("rewardLine") || ex.getMessage().contains("reward"));
    }

    // --- 4. Percent promotion ---
    @Test
    @DisplayName("Golden 4: PERCENT_DISCOUNT — promotionDiscount + effective fields + breakdown")
    void golden_percent_promotion() {
        ProductVariant v = mkVariant("PCT");
        mkBatch(v, 5);
        Promotion p = mkPromotion("P3A-PCT", "PERCENT_DISCOUNT", new BigDecimal("10"));
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 2, BigDecimal.ZERO, null)),
                p.getId(), null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(p.getId(), q.effectivePromotionId());
        assertEquals(p.getName(), q.effectivePromotionName());
        assertEquals(p.getType(), q.effectivePromotionType());
        assertNotNull(q.promotionSnapshot());
        assertMoney(new BigDecimal("20000"), q.pricingBreakdownSnapshot().promotionDiscount());
        assertMoney(new BigDecimal("200000"), q.pricingBreakdownSnapshot().subtotal());
    }

    // --- 5. Fixed promotion ---
    @Test
    @DisplayName("Golden 5: FIXED_DISCOUNT — cap theo merchandise eligible")
    void golden_fixed_promotion_capped() {
        ProductVariant v = mkVariant("FIX");
        mkBatch(v, 5);
        Promotion p = mkPromotion("P3A-FIX", "FIXED_DISCOUNT", new BigDecimal("150000"));
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                p.getId(), null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertMoney(new BigDecimal("100000"), q.pricingBreakdownSnapshot().promotionDiscount());
        assertMoney(new BigDecimal("100000"), q.pricingBreakdownSnapshot().subtotal());
    }

    // --- 6. Free shipping promotion ---
    @Test
    @DisplayName("Golden 6: FREE_SHIPPING — shippingDiscount>0, promotionDiscount=0, subtotal hàng không giảm vì ship")
    void golden_free_shipping_buckets() {
        ProductVariant v = mkVariant("FS");
        mkBatch(v, 5);
        Promotion freeShip = mkPromotion("P3A-FS", "FREE_SHIPPING", BigDecimal.ZERO);
        freeShip.setMaxDiscount(new BigDecimal("50000"));
        promotionRepository.save(freeShip);
        BigDecimal shipFee = new BigDecimal("35000");
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                freeShip.getId(), null,
                new ShippingQuoteSnapshotDto("client", "Z", shipFee, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(0, q.pricingBreakdownSnapshot().promotionDiscount().compareTo(BigDecimal.ZERO));
        assertTrue(q.pricingBreakdownSnapshot().shippingDiscount().compareTo(BigDecimal.ZERO) > 0);
        assertMoney(new BigDecimal("100000"), q.pricingBreakdownSnapshot().subtotal());
        assertNotNull(q.promotionSnapshot());
        assertEquals(0, q.promotionSnapshot().discountAmount().compareTo(BigDecimal.ZERO));
        assertTrue(q.promotionSnapshot().shippingDiscountAmount().compareTo(BigDecimal.ZERO) > 0);
    }

    // --- 7–9 Vouchers ---
    @Test
    @DisplayName("Golden 7: Voucher percent — voucherSnapshot + voucherDiscount bucket")
    void golden_voucher_percent() {
        ProductVariant v = mkVariant("VC-PCT");
        mkBatch(v, 5);
        Voucher vo = mkVoucherBase("P3AVPCT" + PREFIX);
        vo.setPercent(new BigDecimal("10"));
        vo.setCap(BigDecimal.ZERO);
        vo.setFixedAmount(BigDecimal.ZERO);
        vo = voucherRepository.save(vo);
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, vo.getCode(),
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertNotNull(q.voucherSnapshot());
        assertEquals(vo.getCode(), q.voucherSnapshot().code());
        assertMoney(new BigDecimal("10000"), q.pricingBreakdownSnapshot().voucherDiscount());
    }

    @Test
    @DisplayName("Golden 8: Voucher fixed — voucherDiscount bucket")
    void golden_voucher_fixed() {
        ProductVariant v = mkVariant("VC-FIX");
        mkBatch(v, 5);
        Voucher vo = mkVoucherBase("P3AVFIX" + PREFIX);
        vo.setPercent(BigDecimal.ZERO);
        vo.setFixedAmount(new BigDecimal("25000"));
        vo = voucherRepository.save(vo);
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, vo.getCode(),
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertMoney(new BigDecimal("25000"), q.pricingBreakdownSnapshot().voucherDiscount());
        assertEquals(0, q.pricingBreakdownSnapshot().promotionDiscount().compareTo(BigDecimal.ZERO));
    }

    @Test
    @DisplayName("Golden 9: Voucher free shipping — shipping bucket, không gộp promotionDiscount")
    void golden_voucher_free_shipping() {
        ProductVariant v = mkVariant("VC-FS");
        mkBatch(v, 5);
        Voucher vo = mkVoucherBase("P3AVFS" + PREFIX);
        vo.setPercent(BigDecimal.ZERO);
        vo.setFixedAmount(BigDecimal.ZERO);
        vo.setFreeShipping(true);
        vo.setCap(new BigDecimal("12000"));
        vo = voucherRepository.save(vo);
        BigDecimal shipFee = new BigDecimal("30000");
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, vo.getCode(),
                new ShippingQuoteSnapshotDto("client", "Z", shipFee, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(0, q.pricingBreakdownSnapshot().promotionDiscount().compareTo(BigDecimal.ZERO));
        assertEquals(0, q.pricingBreakdownSnapshot().voucherDiscount().compareTo(BigDecimal.ZERO));
        assertMoney(new BigDecimal("12000"), q.pricingBreakdownSnapshot().shippingDiscount());
        assertNotNull(q.voucherSnapshot());
        assertMoney(new BigDecimal("12000"), q.voucherSnapshot().shippingDiscountAmount());
    }

    @Test
    @DisplayName("Golden 9b: Mã FREESHIP* cấu hình sai (fixed trên tiền hàng) — chỉ giảm phí ship, tối đa phí ship")
    void golden_freeship_prefix_legacy_fixed_routes_to_shipping_bucket() {
        Category cat = mkCategory("FSP");
        ProductVariant v = mkVariantInCategory(cat, "FSP32", new BigDecimal("32000"));
        mkBatch(v, 5);
        Voucher vo = mkVoucherBase("FREESHIP100" + PREFIX);
        vo.setPercent(BigDecimal.ZERO);
        vo.setFreeShipping(false);
        vo.setFixedAmount(new BigDecimal("100000"));
        vo.setCap(BigDecimal.ZERO);
        vo = voucherRepository.save(vo);
        BigDecimal shipFee = new BigDecimal("38000");
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, vo.getCode(),
                new ShippingQuoteSnapshotDto("client", "Z", shipFee, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(0, q.pricingBreakdownSnapshot().voucherDiscount().compareTo(BigDecimal.ZERO));
        assertMoney(new BigDecimal("38000"), q.pricingBreakdownSnapshot().shippingDiscount());
        assertTrue(q.voucherSnapshot().freeShipping());
        assertMoney(new BigDecimal("38000"), q.voucherSnapshot().shippingDiscountAmount());
    }

    // --- 10. Loyalty ---
    @Test
    @DisplayName("Golden 10: Loyalty redeem — loyaltySnapshot + loyaltyDiscount trong breakdown")
    void golden_loyalty_redeem() {
        ProductVariant v = mkVariant("LOY");
        mkBatch(v, 5);
        Customer c = new Customer();
        c.setCode("C-P3A-" + PREFIX);
        c.setName("KH P3A");
        c = customerRepository.save(c);
        final Long customerId = c.getId();
        User u = new User();
        u.setUsername("p3a_loyal_user");
        u.setPassword("x");
        u.setCustomer(c);
        userRepository.save(u);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("p3a_loyal_user", "n/a", List.of()));

        when(customerLoyaltyService.capRedemption(
                argThat(cust -> cust != null && cust.getId().equals(customerId)),
                eq(100L),
                any(BigDecimal.class)))
                .thenReturn(new LoyaltyRedemptionSnapshotDto(
                        c.getId(), 100L, 100L, new BigDecimal("8000"), 5000L, "test-policy"));

        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", String.valueOf(c.getId()),
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO, 100L
        ));
        assertNotNull(q.loyaltySnapshot());
        assertEquals(c.getId(), q.loyaltySnapshot().customerId());
        assertMoney(new BigDecimal("8000"), q.loyaltySnapshot().discountAmount());
        assertMoney(new BigDecimal("8000"), q.pricingBreakdownSnapshot().loyaltyDiscount());
        assertEquals(100L, q.pricingBreakdownSnapshot().loyaltyRedeemedPoints());
    }

    // --- 11. Gift promotion ---
    @Test
    @DisplayName("Golden 11: BUY_X_GET_Y — reward line giá 0, không phải discount tiền")
    void golden_buy_x_get_y_gift_line() {
        ProductVariant paid = mkVariant("BXGY-P");
        ProductVariant gift = mkVariant("BXGY-G");
        mkBatch(paid, 20);
        mkBatch(gift, 20);
        Promotion p = mkBuyXGetY("P3A-BXGY", paid.getProduct().getId(), gift.getProduct().getId(), 2, 1);
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(paid, 2, BigDecimal.ZERO, null)),
                p.getId(), null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(1, q.rewardLines().size());
        SalesQuoteLineResponse rw = q.rewardLines().get(0);
        assertTrue(rw.rewardLine());
        assertEquals(0, rw.unitPrice().compareTo(BigDecimal.ZERO));
        assertEquals(0, rw.lineSubtotal().compareTo(BigDecimal.ZERO));
        assertEquals(0, q.pricingBreakdownSnapshot().promotionDiscount().compareTo(BigDecimal.ZERO));
        assertNotNull(q.promotionSnapshot());
        assertNotNull(q.promotionSnapshot().giftLines());
        assertEquals(1, q.promotionSnapshot().giftLines().size());
    }

    // --- 12. Combo ---
    @Test
    @DisplayName("Golden 12: Combo line — mapping & pricing hiện tại")
    void golden_combo_line() {
        Category cat = categoryRepository.save(mkCategory("COMBO-CAT"));
        ProductVariant c1 = mkVariantInCategory(cat, "CB-A", new BigDecimal("40000"));
        ProductVariant c2 = mkVariantInCategory(cat, "CB-B", new BigDecimal("50000"));
        mkBatch(c1, 50);
        mkBatch(c2, 50);
        stockMutationService.syncVariantStockWithBatches(c1.getId());
        stockMutationService.syncVariantStockWithBatches(c2.getId());

        Product comboP = new Product();
        comboP.setCode(PREFIX + "-COMBO");
        comboP.setName("Combo P3A");
        comboP.setCategory(cat);
        comboP.setActive(true);
        comboP.setProductType(Product.ProductType.COMBO);
        comboP = productRepository.save(comboP);

        ProductVariant comboV = new ProductVariant();
        comboV.setProduct(comboP);
        comboV.setVariantCode(PREFIX + "-CV");
        comboV.setVariantName("Default");
        comboV.setSellUnit("cai");
        comboV.setPiecesPerUnit(1);
        comboV.setSellPrice(new BigDecimal("155000"));
        comboV.setCostPrice(BigDecimal.ZERO);
        comboV.setStockQty(0);
        comboV.setMinStockQty(0);
        comboV.setActive(true);
        comboV.setIsDefault(true);
        comboV.setIsSellable(true);
        comboV = variantRepository.save(comboV);

        ProductComboItem i1 = new ProductComboItem();
        i1.setComboProduct(comboP);
        i1.setProduct(c1.getProduct());
        i1.setQuantity(1);
        comboRepository.save(i1);
        ProductComboItem i2 = new ProductComboItem();
        i2.setComboProduct(comboP);
        i2.setProduct(c2.getProduct());
        i2.setQuantity(1);
        comboRepository.save(i2);

        mkBatch(comboV, 30);
        stockMutationService.syncVariantStockWithBatches(comboV.getId());

        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(new SalesQuoteLineRequest(comboP.getId(), comboV.getId(), 1, BigDecimal.ZERO, null, false)),
                null, null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(1, q.lines().size());
        assertEquals(comboP.getId(), q.lines().get(0).productId());
        assertMoney(new BigDecimal("155000"), q.lines().get(0).lineSubtotal());
        assertNotNull(q.lines().get(0).commercialSnapshot());
        assertMoney(new BigDecimal("155000"), q.pricingBreakdownSnapshot().subtotal());
    }

    // --- 13. Exact batch ---
    @Test
    @DisplayName("Golden 13: batchId trên line — response giữ batchId, không mutate stock trong quote")
    void golden_exact_batch_line() {
        ProductVariant v = mkVariant("BATCH");
        ProductBatch b = mkBatch(v, 15);
        int remBefore = b.getRemainingQty();
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 2, BigDecimal.ZERO, b.getId(), false)),
                null, null,
                new ShippingQuoteSnapshotDto("client", null, BigDecimal.ZERO, null),
                null, BigDecimal.ZERO, BigDecimal.ZERO
        ));
        assertEquals(b.getId(), q.lines().get(0).batchId());
        ProductBatch bAfter = batchRepository.findById(b.getId()).orElseThrow();
        assertEquals(remBefore, bAfter.getRemainingQty());
    }

    // --- 14. Storefront shipping ---
    @Test
    @DisplayName("Golden 14: Storefront + shippingAddress — shippingQuoteSnapshot quoted")
    void golden_storefront_shipping_snapshot() {
        ProductVariant v = mkVariant("SF-SHIP");
        mkBatch(v, 5);
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                null, null, null, shipAddr(), null, BigDecimal.ZERO
        ));
        assertNotNull(q.shippingQuoteSnapshot());
        assertNotNull(q.shippingQuoteSnapshot().fee());
        assertTrue(q.shippingQuoteSnapshot().fee().compareTo(BigDecimal.ZERO) >= 0);
        assertNotNull(q.shippingQuoteSnapshot().source());
    }

    // --- 15. Persisted payload ---
    @Test
    @DisplayName("Golden 15: SalesQuote persist — payload JSON chứa breakdown + lines + snapshots")
    void golden_persisted_payload_snapshot() throws Exception {
        ProductVariant v = mkVariant("PERS");
        mkBatch(v, 5);
        Promotion p = mkPromotion("P3A-PERS", "PERCENT_DISCOUNT", new BigDecimal("5"));
        SalesQuoteResponse q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos", null,
                List.of(line(v, 1, BigDecimal.ZERO, null)),
                p.getId(), null,
                new ShippingQuoteSnapshotDto("client", null, new BigDecimal("15000"), null),
                null, new BigDecimal("3000"), new BigDecimal("10")
        ));
        SalesQuote ent = salesQuoteRepository.findByPublicId(q.quoteId()).orElseThrow();
        SalesQuotePayloadDto payload = objectMapper.readValue(ent.getPayloadJson(), SalesQuotePayloadDto.class);
        assertEquals(1, payload.version());
        assertNotNull(payload.pricingBreakdownSnapshot());
        assertMoney(q.pricingBreakdownSnapshot().subtotal(), payload.pricingBreakdownSnapshot().subtotal());
        assertMoney(q.pricingBreakdownSnapshot().total(), payload.pricingBreakdownSnapshot().total());
        assertEquals(q.lines().size(), payload.lines().size());
        assertNotNull(payload.promotionSnapshot());
        assertNotNull(payload.shippingQuoteSnapshot());
    }

    // --- 16. Query baseline N=20 ---
    @Test
    @DisplayName("Phase 3A reference: quote N=20 lines — Hibernate prepareStatementCount (không claim cải thiện)")
    void baseline_quote_n20_prepare_statement_count() {
        ProductVariant v = mkVariant("N20");
        ProductBatch b = mkBatch(v, 100);
        List<SalesQuoteLineRequest> lines = IntStream.range(0, 20)
                .mapToObj(i -> new SalesQuoteLineRequest(
                        v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, b.getId(), false))
                .toList();
        flushClearAndResetStats();
        long stmts = measurePrepareStatements(() ->
                salesQuoteService.quote(new SalesQuoteRequest(
                        "storefront", null, lines, null, null, null, shipAddr(), null, BigDecimal.ZERO)));
        log.info("PHASE3A\tsales_quote\tN_lines=20\tprepareStatements={}", stmts);
        assertTrue(stmts > 0, "expected measurable statement count");
    }

    // --- helpers ---

    private static void assertMoney(BigDecimal expected, BigDecimal actual) {
        assertNotNull(actual);
        assertEquals(0, expected.compareTo(actual), () -> "expected " + expected + " was " + actual);
    }

    private static SalesQuoteLineRequest line(ProductVariant v, int qty, BigDecimal disc, Long batchId) {
        return new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), qty, disc, batchId, false);
    }

    private Category mkCategory(String suffix) {
        Category cat = new Category();
        cat.setName(PREFIX + "-" + suffix);
        cat.setActive(true);
        return categoryRepository.save(cat);
    }

    private ProductVariant mkVariant(String sku) {
        Category cat = mkCategory("CAT-" + sku);
        return mkVariantInCategory(cat, sku, new BigDecimal("100000"));
    }

    private ProductVariant mkVariantInCategory(Category cat, String sku, BigDecimal sellPrice) {
        Product p = new Product();
        p.setCode(PREFIX + "-P-" + sku);
        p.setName("P-" + sku);
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        p = productRepository.save(p);
        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode(PREFIX + "-" + sku);
        v.setVariantName("V");
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(sellPrice);
        v.setCostPrice(sellPrice.divide(BigDecimal.valueOf(2), 0, java.math.RoundingMode.HALF_UP));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private ProductBatch mkBatch(ProductVariant variant, int qty) {
        ProductBatch b = new ProductBatch();
        b.setProduct(variant.getProduct());
        b.setVariant(variant);
        b.setBatchCode("B-" + PREFIX + "-" + System.nanoTime());
        b.setExpiryDate(LocalDate.now().plusDays(30));
        b.setImportQty(qty);
        b.setRemainingQty(qty);
        b.setCostPrice(new BigDecimal("50000"));
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        return batchRepository.save(b);
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

    private Promotion mkBuyXGetY(String name, Long buyPid, Long giftPid, int buyQty, int getQty) {
        Promotion p = mkPromotion(name, "BUY_X_GET_Y", BigDecimal.ZERO);
        p.setAppliesTo("PRODUCT");
        p.setProducts(new HashSet<>(Set.of(productRepository.findById(buyPid).orElseThrow())));
        p.setBuyQty(buyQty);
        p.setGetProductId(giftPid);
        p.setGetQty(getQty);
        p.setRepeatable(false);
        return promotionRepository.save(p);
    }

    private Voucher mkVoucherBase(String code) {
        Voucher v = new Voucher();
        v.setCode(code);
        v.setRuleSummary("p3a");
        v.setActive(true);
        v.setMinSubtotal(BigDecimal.ZERO);
        v.setStartAt(LocalDateTime.of(2026, 4, 1, 0, 0));
        v.setEndAt(LocalDateTime.of(2026, 6, 1, 23, 59));
        return v;
    }

    private ShippingAddressDto shipAddr() {
        return new ShippingAddressDto(
                "A", "0909123456", "79", "HCM", "760", "Q1",
                "26734", "Phuong", "1 Le Loi", null, null);
    }

    @TestConfiguration
    static class TestCfg {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-04-29T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }

        @Bean
        ObjectMapper objectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.registerModule(new JavaTimeModule());
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return mapper;
        }
    }
}
