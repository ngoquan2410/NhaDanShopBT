package com.example.nhadanshop.service;

import com.example.nhadanshop.controller.PromotionController;
import com.example.nhadanshop.dto.CommercialLineSnapshotDto;
import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.dto.PromotionEvaluationLineRequest;
import com.example.nhadanshop.dto.PromotionEvaluationRequest;
import com.example.nhadanshop.dto.PromotionEvaluationResponse;
import com.example.nhadanshop.dto.SalesInvoiceItemResponse;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteLineResponse;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.SalesQuoteResponse;
import com.example.nhadanshop.dto.ShippingQuoteSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.InventoryMovementRepository;
import com.example.nhadanshop.repository.PaymentEventRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.SalesQuoteRepository;
import com.example.nhadanshop.repository.VoucherRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "casso.webhook-secure-token=test-secure-token"
})
@Import({
        PendingOrderService.class,
        InvoiceService.class,
        SalesQuoteService.class,
        PromotionEvaluationService.class,
        ShippingQuoteService.class,
        GhnShippingService.class,
        ProductBatchService.class,
        StockMutationService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        Slice7CommercialFlowIntegrationTest.TestCfg.class
})
class Slice7CommercialFlowIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @Autowired
    private PendingOrderService pendingOrderService;
    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private SalesQuoteService salesQuoteService;
    @Autowired
    private PromotionEvaluationService promotionEvaluationService;
    @Autowired
    private StockMutationService stockMutationService;
    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private SalesQuoteRepository salesQuoteRepository;
    @Autowired
    private PendingOrderRepository pendingOrderRepository;
    @Autowired
    private PaymentEventRepository paymentEventRepository;
    @Autowired
    private InventoryMovementRepository inventoryMovementRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private PromotionRepository promotionRepository;
    @Autowired
    private VoucherRepository voucherRepository;

    @BeforeEach
    void setAdminAuth() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", "n/a", List.of()));
    }

    @Test
    void acceptance_85f_reward_free_item_persists_zero_revenue_commercial_invariants_and_cogs_stock() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S7-85F-001");
        Category cat = mkCategory("CAT-S7-85F");
        ProductVariant buyV = mkVariant(cat, "S7-85F-BUY", new BigDecimal("100000"), new BigDecimal("30000"));
        ProductVariant giftV = mkVariant(cat, "S7-85F-GIFT", new BigDecimal("25000"), new BigDecimal("8000"));
        mkBatch(buyV, 10, new BigDecimal("30000"));
        ProductBatch giftBatch = mkBatch(giftV, 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(buyV.getId());
        stockMutationService.syncVariantStockWithBatches(giftV.getId());
        Promotion promo = mkBuyXGetY(giftV.getProduct(), 2, 1, "BXGY-85F");

        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "pos",
                null,
                List.of(new SalesQuoteLineRequest(buyV.getProduct().getId(), buyV.getId(), 2, BigDecimal.ZERO, null, false)),
                promo.getId(),
                null,
                null,
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO
        ));
        assertEquals(1, quote.rewardLines().size());

        SalesInvoiceResponse invoice = invoiceService.createInvoiceFromQuoteRequest(
                new SalesInvoiceRequest(null, null, null, null, null, quote.quoteId(), "cash"));
        assertMoney(invoice.pricingBreakdownSnapshot().total(), invoice.finalAmount());

        SalesInvoiceItemResponse reward = invoice.items().stream()
                .filter(SalesInvoiceItemResponse::rewardLine)
                .findFirst()
                .orElseThrow();
        assertNotNull(reward.id(), "reward/free item must be a persisted invoice item");
        assertEquals(0, reward.unitPrice().compareTo(BigDecimal.ZERO));
        assertEquals(0, reward.originalUnitPrice().compareTo(new BigDecimal("25000")));
        assertEquals(0, reward.unitCostSnapshot().compareTo(new BigDecimal("8000")));
        CommercialLineSnapshotDto snap = reward.commercialSnapshot();
        assertNotNull(snap);
        assertMoney(BigDecimal.ZERO, snap.lineNetRevenue());
        assertMoney(BigDecimal.ZERO, snap.allocatedManualDiscount());
        assertMoney(BigDecimal.ZERO, snap.allocatedPromotionDiscount());
        assertMoney(BigDecimal.ZERO, snap.allocatedVoucherDiscount());
        assertMoney(BigDecimal.ZERO, snap.allocatedMerchandiseDiscount());

        giftBatch = batchRepository.findById(giftBatch.getId()).orElseThrow();
        assertEquals(4, giftBatch.getRemainingQty(), "reward stock must be deducted through the existing stock path");

        LocalDate invoiceDay = invoice.invoiceDate().toLocalDate();
        BigDecimal reportProfit = salesInvoiceRepository.sumProfitBetween(
                invoiceDay.atStartOfDay(), invoiceDay.atTime(LocalTime.MAX));
        assertMoney(new BigDecimal("132000"), reportProfit);
        assertMoney(new BigDecimal("132000"), invoice.itemGrossProfit());
    }

    @Test
    void acceptance_85j_quote_to_pending_to_invoice_preserves_commercial_snapshots_without_recompute() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S7-85J-001");
        Category cat = mkCategory("CAT-S7-85J");
        ProductVariant first = mkVariant(cat, "S7-85J-A", new BigDecimal("100000"), new BigDecimal("40000"));
        ProductVariant second = mkVariant(cat, "S7-85J-B", new BigDecimal("50000"), new BigDecimal("20000"));
        ProductVariant gift = mkVariant(cat, "S7-85J-G", new BigDecimal("30000"), new BigDecimal("10000"));
        mkBatch(first, 10, new BigDecimal("40000"));
        mkBatch(second, 10, new BigDecimal("20000"));
        mkBatch(gift, 10, new BigDecimal("10000"));
        stockMutationService.syncVariantStockWithBatches(first.getId());
        stockMutationService.syncVariantStockWithBatches(second.getId());
        stockMutationService.syncVariantStockWithBatches(gift.getId());
        Promotion promo = mkBuyXGetY(gift.getProduct(), 2, 1, "BXGY-85J");

        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "pos",
                null,
                List.of(
                        new SalesQuoteLineRequest(first.getProduct().getId(), first.getId(), 2, BigDecimal.ZERO, null, false),
                        new SalesQuoteLineRequest(second.getProduct().getId(), second.getId(), 1, BigDecimal.ZERO, null, false)
                ),
                promo.getId(),
                null,
                new ShippingQuoteSnapshotDto("manual", "Z1", new BigDecimal("15000"), null),
                null,
                new BigDecimal("10000"),
                new BigDecimal("10")
        ));
        assertEquals(2, quote.lines().size());
        assertEquals(1, quote.rewardLines().size());
        assertTrue(quote.pricingBreakdownSnapshot().itemNetRevenue().compareTo(BigDecimal.ZERO) > 0);
        assertTrue(quote.lines().stream().anyMatch(l -> l.commercialSnapshot().allocatedMerchandiseDiscount().compareTo(BigDecimal.ZERO) > 0));

        var pending = pendingOrderService.createOrder(new PendingOrderRequest(
                null, "S7", "090", null, null, "bank_transfer",
                null, null, null, null, null, null, quote.quoteId()));

        first.setSellPrice(new BigDecimal("999999"));
        variantRepository.save(first);
        promo.setBuyQty(99);
        promotionRepository.save(promo);

        var confirmed = pendingOrderService.confirmOrder(Long.parseLong(pending.id()), "confirm", "admin:s7");
        SalesInvoiceResponse invoice = confirmed.invoice();
        assertNotNull(invoice);
        assertMoney(invoice.pricingBreakdownSnapshot().total(), invoice.finalAmount());

        assertPricingParity(quote.pricingBreakdownSnapshot(), pending.pricingBreakdownSnapshot());
        assertPricingParity(quote.pricingBreakdownSnapshot(), invoice.pricingBreakdownSnapshot());
        for (SalesQuoteLineResponse qLine : quote.lines()) {
            var pLine = pending.lines().stream()
                    .filter(l -> !l.rewardLine() && Long.valueOf(l.productId()).equals(qLine.productId()))
                    .findFirst()
                    .orElseThrow();
            var iLine = invoice.items().stream()
                    .filter(l -> !l.rewardLine() && l.productId().equals(qLine.productId()))
                    .findFirst()
                    .orElseThrow();
            assertCommercialParity(qLine.commercialSnapshot(), pLine.commercialSnapshot());
            assertCommercialParity(qLine.commercialSnapshot(), iLine.commercialSnapshot());
        }
        SalesQuoteLineResponse qReward = quote.rewardLines().getFirst();
        var pReward = pending.lines().stream().filter(l -> l.rewardLine()).findFirst().orElseThrow();
        var iReward = invoice.items().stream().filter(SalesInvoiceItemResponse::rewardLine).findFirst().orElseThrow();
        assertCommercialParity(qReward.commercialSnapshot(), pReward.commercialSnapshot());
        assertCommercialParity(qReward.commercialSnapshot(), iReward.commercialSnapshot());
    }

    @Test
    void direct_cash_pos_no_quote_invoice_materializes_slice7_allocation_for_exact_batch_and_fefo_lines() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S7-DIRECT-001");
        Category cat = mkCategory("CAT-S7-DIRECT");
        ProductVariant exact = mkVariant(cat, "S7-DIR-E", new BigDecimal("100000"), new BigDecimal("40000"));
        ProductVariant fefo = mkVariant(cat, "S7-DIR-F", new BigDecimal("100000"), new BigDecimal("40000"));
        ProductBatch exactBatch = mkBatch(exact, 5, new BigDecimal("40000"));
        mkBatch(fefo, 5, new BigDecimal("40000"));
        stockMutationService.syncVariantStockWithBatches(exact.getId());
        stockMutationService.syncVariantStockWithBatches(fefo.getId());
        Promotion promo = new Promotion();
        promo.setName("DIRECT-10K");
        promo.setType("FIXED_DISCOUNT");
        promo.setDiscountValue(new BigDecimal("10000"));
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now().minusDays(1));
        promo.setEndDate(LocalDateTime.now().plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo = promotionRepository.save(promo);

        SalesInvoiceResponse invoice = invoiceService.createInvoice(new SalesInvoiceRequest(
                null,
                null,
                "direct",
                promo.getId(),
                List.of(
                        new InvoiceItemRequest(exact.getProduct().getId(), 1, BigDecimal.ZERO, exact.getId(), null, exactBatch.getId()),
                        new InvoiceItemRequest(fefo.getProduct().getId(), 1, BigDecimal.ZERO, fefo.getId(), null, null)
                ),
                null,
                "cash"
        ));

        assertNotNull(invoice.pricingBreakdownSnapshot());
        assertMoney(invoice.pricingBreakdownSnapshot().total(), invoice.finalAmount());
        assertMoney(new BigDecimal("190000"), invoice.pricingBreakdownSnapshot().itemNetRevenue());
        assertMoney(BigDecimal.ZERO, invoice.pricingBreakdownSnapshot().shippingNetRevenue());
        assertMoney(BigDecimal.ZERO, invoice.pricingBreakdownSnapshot().vatAmount());
        assertMoney(new BigDecimal("190000"), invoice.pricingBreakdownSnapshot().total());
        assertEquals(CommercialPricingEngine.COMMERCIAL_SNAPSHOT_VERSION,
                invoice.pricingBreakdownSnapshot().commercialAllocationVersion());
        assertEquals(2, invoice.items().size());
        for (SalesInvoiceItemResponse line : invoice.items()) {
            assertNotNull(line.commercialSnapshot());
            assertMoney(new BigDecimal("100000"), line.commercialSnapshot().lineGrossAmount());
            assertMoney(new BigDecimal("100000"), line.commercialSnapshot().lineNetBeforeInvoiceDiscount());
            assertMoney(new BigDecimal("5000"), line.commercialSnapshot().allocatedPromotionDiscount());
            assertMoney(new BigDecimal("95000"), line.commercialSnapshot().lineNetRevenue());
        }
    }

    @Test
    void free_shipping_promotion_quote_affects_only_shipping_bucket_and_caps_with_voucher() {
        Category cat = mkCategory("CAT-S7-FS");
        ProductVariant v = mkVariant(cat, "S7-FS-P", new BigDecimal("100000"), new BigDecimal("40000"));
        mkBatch(v, 10, new BigDecimal("40000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Promotion promo = mkFreeShipping("FS-FULL", BigDecimal.ZERO, new BigDecimal("30000"));
        Voucher voucher = new Voucher();
        voucher.setCode("FSVOUCH");
        voucher.setRuleSummary("Free ship voucher");
        voucher.setActive(true);
        voucher.setMinSubtotal(BigDecimal.ZERO);
        voucher.setFreeShipping(true);
        voucherRepository.save(voucher);

        SalesQuoteResponse quote = salesQuoteService.quote(new SalesQuoteRequest(
                "pos",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                promo.getId(),
                "FSVOUCH",
                new ShippingQuoteSnapshotDto("manual", "ZFS", new BigDecimal("30000"), null),
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO
        ));

        PricingBreakdownSnapshotDto pricing = quote.pricingBreakdownSnapshot();
        assertMoney(BigDecimal.ZERO, pricing.promotionDiscount());
        assertMoney(new BigDecimal("30000"), pricing.shippingDiscount());
        assertMoney(new BigDecimal("100000"), pricing.itemNetRevenue());
        assertMoney(new BigDecimal("100000"), quote.lines().getFirst().commercialSnapshot().lineNetRevenue());
        assertMoney(new BigDecimal("30000"), quote.promotionSnapshot().shippingDiscountAmount());
        assertMoney(BigDecimal.ZERO, quote.voucherSnapshot().shippingDiscountAmount());
        assertMoney(BigDecimal.ZERO, pricing.shippingNetRevenue());
        assertMoney(pricing.itemNetRevenue().add(pricing.shippingNetRevenue()).add(pricing.vatAmount()), pricing.total());
    }

    @Test
    void promotion_controller_evaluate_and_pick_best_delegate_without_persisting_commercial_rows() {
        Category cat = mkCategory("CAT-S7-CTRL");
        ProductVariant v = mkVariant(cat, "S7-CTRL-P", new BigDecimal("100000"), new BigDecimal("40000"));
        Promotion promo = mkFreeShipping("FS-CTRL", BigDecimal.ZERO, new BigDecimal("15000"));
        long quotesBefore = salesQuoteRepository.count();
        long pendingBefore = pendingOrderRepository.count();
        long invoicesBefore = salesInvoiceRepository.count();
        long paymentsBefore = paymentEventRepository.count();
        long movementsBefore = inventoryMovementRepository.count();

        PromotionEvaluationRequest req = new PromotionEvaluationRequest(
                null,
                List.of(new PromotionEvaluationLineRequest("ctrl-1", v.getProduct().getId(), v.getId(), 1, new BigDecimal("100000"), new BigDecimal("100000"))),
                new BigDecimal("100000"),
                new BigDecimal("15000")
        );

        PromotionController controller = new PromotionController(null, promotionEvaluationService);
        List<PromotionEvaluationResponse> evaluated = controller.evaluate(req);
        PromotionEvaluationResponse best = controller.pickBest(req);

        assertTrue(byId(evaluated, promo.getId()).eligible());
        assertNotNull(best);
        assertEquals(String.valueOf(promo.getId()), best.promotionId());
        assertEquals(quotesBefore, salesQuoteRepository.count());
        assertEquals(pendingBefore, pendingOrderRepository.count());
        assertEquals(invoicesBefore, salesInvoiceRepository.count());
        assertEquals(paymentsBefore, paymentEventRepository.count());
        assertEquals(movementsBefore, inventoryMovementRepository.count());
    }

    @Test
    void promotion_evaluate_and_pick_best_are_stateless_and_deterministic() {
        Category food = mkCategory("CAT-S7-EVAL-FOOD");
        Category other = mkCategory("CAT-S7-EVAL-OTHER");
        ProductVariant paid = mkVariant(food, "S7-EVAL-PAID", new BigDecimal("100000"), new BigDecimal("40000"));
        ProductVariant gift = mkVariant(food, "S7-EVAL-GIFT", new BigDecimal("25000"), new BigDecimal("8000"));
        ProductVariant outside = mkVariant(other, "S7-EVAL-OUT", new BigDecimal("50000"), new BigDecimal("20000"));
        mkBatch(gift, 10, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(gift.getId());

        long quotesBefore = salesQuoteRepository.count();
        long pendingBefore = pendingOrderRepository.count();
        long invoicesBefore = salesInvoiceRepository.count();
        long paymentsBefore = paymentEventRepository.count();
        long movementsBefore = inventoryMovementRepository.count();

        Promotion productPercent = mkPercent("PRODUCT-10", new BigDecimal("10"), BigDecimal.ZERO, null);
        productPercent.setAppliesTo("PRODUCT");
        productPercent.getProducts().add(paid.getProduct());
        productPercent = promotionRepository.save(productPercent);
        Promotion wrongCategoryFixed = mkFixed("OTHER-CAT-5K", new BigDecimal("5000"), BigDecimal.ZERO, null);
        wrongCategoryFixed.setAppliesTo("CATEGORY");
        wrongCategoryFixed.getCategories().add(other);
        wrongCategoryFixed = promotionRepository.save(wrongCategoryFixed);
        Promotion bxgy = mkBuyXGetY(gift.getProduct(), 2, 1, "BXGY-EVAL");
        Promotion quantityGift = mkQuantityGift(gift.getProduct(), 3, 1, "QG-EVAL");
        Promotion freeShip = mkFreeShipping("FS-EVAL", BigDecimal.ZERO, new BigDecimal("20000"));

        PromotionEvaluationRequest req = new PromotionEvaluationRequest(
                null,
                List.of(new PromotionEvaluationLineRequest("l1", paid.getProduct().getId(), paid.getId(), 2, new BigDecimal("100000"), new BigDecimal("200000"))),
                new BigDecimal("200000"),
                new BigDecimal("20000")
        );
        List<PromotionEvaluationResponse> all = promotionEvaluationService.evaluate(req);

        PromotionEvaluationResponse percent = byId(all, productPercent.getId());
        assertTrue(percent.eligible());
        assertMoney(new BigDecimal("20000"), percent.discountAmount());
        assertMoney(BigDecimal.ZERO, percent.shippingDiscountAmount());
        PromotionEvaluationResponse wrongCat = byId(all, wrongCategoryFixed.getId());
        assertTrue(!wrongCat.eligible());
        assertNotNull(wrongCat.reasonIfIneligible());
        assertTrue(byId(all, bxgy.getId()).eligible());
        assertEquals(1, byId(all, bxgy.getId()).giftLines().size());
        assertTrue(!byId(all, quantityGift.getId()).eligible());
        assertTrue(byId(all, freeShip.getId()).eligible());
        assertMoney(new BigDecimal("20000"), byId(all, freeShip.getId()).shippingDiscountAmount());

        productPercent.setActive(false);
        promotionRepository.save(productPercent);

        Promotion merchLate = mkFixed("PICK-MERCH-LATE", new BigDecimal("20000"), BigDecimal.ZERO, LocalDateTime.of(2026, 5, 10, 23, 59));
        Promotion merchEarly = mkFixed("PICK-MERCH-EARLY", new BigDecimal("20000"), BigDecimal.ZERO, LocalDateTime.of(2026, 5, 1, 23, 59));
        Promotion picked = promotionRepository.findById(Long.parseLong(promotionEvaluationService.pickBest(req).promotionId())).orElseThrow();
        assertEquals(merchEarly.getId(), picked.getId(), "merchandise tied reduction should beat shipping-only and earliest endDate wins");
        merchEarly.setActive(false);
        promotionRepository.save(merchEarly);
        merchLate.setActive(false);
        promotionRepository.save(merchLate);
        Promotion sameEndLowId = mkFixed("PICK-LOW-ID", new BigDecimal("20000"), BigDecimal.ZERO, LocalDateTime.of(2026, 5, 2, 23, 59));
        Promotion sameEndHighId = mkFixed("PICK-HIGH-ID", new BigDecimal("20000"), BigDecimal.ZERO, LocalDateTime.of(2026, 5, 2, 23, 59));
        picked = promotionRepository.findById(Long.parseLong(promotionEvaluationService.pickBest(req).promotionId())).orElseThrow();
        assertEquals(sameEndLowId.getId(), picked.getId(), "lower promotion id wins after equal total/type/endDate");

        assertEquals(quotesBefore, salesQuoteRepository.count());
        assertEquals(pendingBefore, pendingOrderRepository.count());
        assertEquals(invoicesBefore, salesInvoiceRepository.count());
        assertEquals(paymentsBefore, paymentEventRepository.count());
        assertEquals(movementsBefore, inventoryMovementRepository.count());
        assertNotNull(outside);
        assertNotNull(sameEndHighId);
    }

    @Test
    void promotion_evaluate_gift_requires_active_sellable_stocked_default_variant() {
        Category cat = mkCategory("CAT-S7-GIFTVAL");
        ProductVariant paid = mkVariant(cat, "S7-GIFTVAL-PAID", new BigDecimal("100000"), new BigDecimal("40000"));
        ProductVariant gift = mkVariant(cat, "S7-GIFTVAL-GIFT", new BigDecimal("25000"), new BigDecimal("8000"));
        Promotion promo = mkBuyXGetY(gift.getProduct(), 1, 2, "BXGY-GIFTVAL");

        PromotionEvaluationRequest req = new PromotionEvaluationRequest(
                promo.getId(),
                List.of(new PromotionEvaluationLineRequest("gv-1", paid.getProduct().getId(), paid.getId(), 1, new BigDecimal("100000"), new BigDecimal("100000"))),
                new BigDecimal("100000"),
                BigDecimal.ZERO
        );

        PromotionEvaluationResponse noStock = promotionEvaluationService.evaluate(req).getFirst();
        assertNotNull(noStock);
        assertTrue(!noStock.eligible());
        assertTrue(noStock.reasonIfIneligible().contains("Không đủ tồn quà tặng"));

        mkBatch(gift, 2, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(gift.getId());
        PromotionEvaluationResponse stocked = promotionEvaluationService.pickBest(req);
        assertNotNull(stocked);
        assertTrue(stocked.eligible());
        assertEquals(1, stocked.giftLines().size());

        gift.setIsSellable(false);
        variantRepository.save(gift);
        PromotionEvaluationResponse unsellable = promotionEvaluationService.evaluate(req).getFirst();
        assertNotNull(unsellable);
        assertTrue(!unsellable.eligible());
        assertTrue(unsellable.reasonIfIneligible().contains("không bán được"));
    }

    private Category mkCategory(String name) {
        Category cat = new Category();
        cat.setName(name);
        cat.setActive(true);
        return categoryRepository.save(cat);
    }

    private ProductVariant mkVariant(Category cat, String sku, BigDecimal sellPrice, BigDecimal costPrice) {
        Product product = new Product();
        product.setCode("P-" + sku);
        product.setName("Product " + sku);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(sku);
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(sellPrice);
        variant.setCostPrice(costPrice);
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        return variantRepository.save(variant);
    }

    private ProductBatch mkBatch(ProductVariant variant, int qty, BigDecimal costPrice) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("B-" + variant.getVariantCode() + "-" + System.nanoTime());
        batch.setExpiryDate(LocalDate.now().plusDays(30));
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(costPrice);
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        return batchRepository.save(batch);
    }

    private Promotion mkBuyXGetY(Product giftProduct, int buyQty, int giftQty, String name) {
        Promotion promo = new Promotion();
        promo.setName(name);
        promo.setType("BUY_X_GET_Y");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now().minusDays(1));
        promo.setEndDate(LocalDateTime.now().plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(buyQty);
        promo.setGetProductId(giftProduct.getId());
        promo.setGetQty(giftQty);
        return promotionRepository.save(promo);
    }

    private Promotion mkQuantityGift(Product giftProduct, int minBuyQty, int giftQty, String name) {
        Promotion promo = new Promotion();
        promo.setName(name);
        promo.setType("QUANTITY_GIFT");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.of(2026, 4, 1, 0, 0));
        promo.setEndDate(LocalDateTime.of(2026, 6, 1, 23, 59));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setMinBuyQty(minBuyQty);
        promo.setGetProductId(giftProduct.getId());
        promo.setGetQty(giftQty);
        return promotionRepository.save(promo);
    }

    private Promotion mkFreeShipping(String name, BigDecimal minOrder, BigDecimal maxDiscount) {
        Promotion promo = new Promotion();
        promo.setName(name);
        promo.setType("FREE_SHIPPING");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(minOrder);
        promo.setMaxDiscount(maxDiscount);
        promo.setStartDate(LocalDateTime.of(2026, 4, 1, 0, 0));
        promo.setEndDate(LocalDateTime.of(2026, 6, 1, 23, 59));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        return promotionRepository.save(promo);
    }

    private Promotion mkPercent(String name, BigDecimal percent, BigDecimal minOrder, LocalDateTime endDate) {
        Promotion promo = new Promotion();
        promo.setName(name);
        promo.setType("PERCENT_DISCOUNT");
        promo.setDiscountValue(percent);
        promo.setMinOrderValue(minOrder);
        promo.setStartDate(LocalDateTime.of(2026, 4, 1, 0, 0));
        promo.setEndDate(endDate != null ? endDate : LocalDateTime.of(2026, 6, 1, 23, 59));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        return promotionRepository.save(promo);
    }

    private Promotion mkFixed(String name, BigDecimal amount, BigDecimal minOrder, LocalDateTime endDate) {
        Promotion promo = new Promotion();
        promo.setName(name);
        promo.setType("FIXED_DISCOUNT");
        promo.setDiscountValue(amount);
        promo.setMinOrderValue(minOrder);
        promo.setStartDate(LocalDateTime.of(2026, 4, 1, 0, 0));
        promo.setEndDate(endDate != null ? endDate : LocalDateTime.of(2026, 6, 1, 23, 59));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        return promotionRepository.save(promo);
    }

    private static PromotionEvaluationResponse byId(List<PromotionEvaluationResponse> responses, Long id) {
        return responses.stream()
                .filter(r -> String.valueOf(id).equals(r.promotionId()))
                .findFirst()
                .orElseThrow();
    }

    private static void assertMoney(BigDecimal expected, BigDecimal actual) {
        assertNotNull(actual);
        assertEquals(0, expected.compareTo(actual), "expected " + expected + " but was " + actual);
    }

    private static void assertCommercialParity(CommercialLineSnapshotDto expected, CommercialLineSnapshotDto actual) {
        assertNotNull(expected);
        assertNotNull(actual);
        assertMoney(expected.lineGrossAmount(), actual.lineGrossAmount());
        assertMoney(expected.lineOwnDiscountAmount(), actual.lineOwnDiscountAmount());
        assertMoney(expected.lineNetBeforeInvoiceDiscount(), actual.lineNetBeforeInvoiceDiscount());
        assertMoney(expected.allocatedManualDiscount(), actual.allocatedManualDiscount());
        assertMoney(expected.allocatedPromotionDiscount(), actual.allocatedPromotionDiscount());
        assertMoney(expected.allocatedVoucherDiscount(), actual.allocatedVoucherDiscount());
        assertMoney(expected.allocatedMerchandiseDiscount(), actual.allocatedMerchandiseDiscount());
        assertMoney(expected.lineNetRevenue(), actual.lineNetRevenue());
        assertMoney(expected.lineVatBase(), actual.lineVatBase());
        assertMoney(expected.lineVatAmount(), actual.lineVatAmount());
        assertEquals(expected.commercialAllocationVersion(), actual.commercialAllocationVersion());
    }

    private static void assertPricingParity(PricingBreakdownSnapshotDto expected, PricingBreakdownSnapshotDto actual) {
        assertNotNull(expected);
        assertNotNull(actual);
        assertMoney(expected.itemNetRevenue(), actual.itemNetRevenue());
        assertMoney(expected.shippingNetRevenue(), actual.shippingNetRevenue());
        assertMoney(expected.vatBase(), actual.vatBase());
        assertMoney(expected.vatAmount(), actual.vatAmount());
        assertMoney(expected.total(), actual.total());
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

