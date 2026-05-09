package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.PendingOrderLineRequest;
import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.dto.ShippingQuoteSnapshotDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.SalesQuoteRepository;
import com.example.nhadanshop.repository.VoucherRepository;
import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "casso.webhook-secure-token=test-secure-token"
})
@Import({
        PaymentEventService.class,
        PendingOrderService.class,
        InvoiceService.class,
        SalesQuoteService.class,
        ShippingSettingsService.class,
        ShippingQuoteService.class,
        PromotionEvaluationService.class,
        GhnShippingService.class,
        ProductBatchService.class,
        StockMutationService.class,
        StockedCatalogGuardService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        Slice6cQuotePaymentIntegrationTest.TestCfg.class
})
class Slice6cQuotePaymentIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @MockBean
    private CustomerLoyaltyService customerLoyaltyService;

    @MockBean
    private AccountService accountService;

    @Autowired
    private PaymentEventService paymentEventService;
    @Autowired
    private PendingOrderService pendingOrderService;
    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private SalesQuoteService salesQuoteService;
    @Autowired
    private StockMutationService stockMutationService;
    @Autowired
    private PendingOrderRepository pendingOrderRepository;
    @Autowired
    private SalesQuoteRepository salesQuoteRepository;
    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private VoucherRepository voucherRepository;
    @Autowired
    private PromotionRepository promotionRepository;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private Clock clock;

    @BeforeEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void casso_bank_transfer_matching_amount_confirms_and_creates_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-CE-001");
        ProductVariant v = mkVariant("S6C-CE");
        ProductBatch batch = mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var quote = quoteStorefront(v, 2, batch.getId());

        PendingOrderRequest preq = poFromQuote(quote.quoteId(), "bank_transfer", "Buy", "090");
        var po = pendingOrderService.createOrder(preq);

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_CE_001","description":"CK %s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, po.code(), po.totalAmount().toPlainString()));

        var result = paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertTrue(result.markedPaidAuto() >= 1);

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.CONFIRMED, refreshed.getStatus());
        assertNotNull(refreshed.getInvoice());
    }

    @Test
    void casso_repeated_webhook_does_not_duplicate_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-RP-001");
        ProductVariant v = mkVariant("S6C-RP");
        mkBatch(v, LocalDate.now().plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var quote = quoteStorefront(v, 1, null);
        PendingOrderRequest preq = poFromQuote(quote.quoteId(), "bank_transfer", "R", "1");
        var po = pendingOrderService.createOrder(preq);
        long oid = Long.parseLong(po.id());
        PendingOrder o = pendingOrderRepository.findById(oid).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_RP","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");

        assertEquals(1L, salesInvoiceRepository.count());
        assertNotNull(pendingOrderRepository.findById(oid).orElseThrow().getInvoice());
    }

    @Test
    void casso_insufficient_amount_does_not_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-LOW-001");
        ProductVariant v = mkVariant("S6C-LOW");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "L", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        BigDecimal low = o.getTotalAmount().subtract(BigDecimal.ONE.max(BigDecimal.ZERO));
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_LOW","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), low.toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
    }

    @Test
    void casso_momo_does_not_auto_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-MM-001");
        ProductVariant v = mkVariant("S6C-MM");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "momo", "M", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_MM","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(PendingOrder.Status.PENDING_PAYMENT,
                pendingOrderRepository.findById(o.getId()).orElseThrow().getStatus());
    }

    @Test
    void casso_zalopay_does_not_auto_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-ZP-001");
        ProductVariant v = mkVariant("S6C-ZP");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "zalopay", "Z", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_ZP","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(PendingOrder.Status.PENDING_PAYMENT,
                pendingOrderRepository.findById(o.getId()).orElseThrow().getStatus());
    }

    @Test
    void casso_cod_does_not_auto_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-COD-001");
        ProductVariant v = mkVariant("S6C-COD");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "cod", "C", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_COD","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(PendingOrder.Status.PENDING_PAYMENT,
                pendingOrderRepository.findById(o.getId()).orElseThrow().getStatus());
    }

    @Test
    void confirm_after_quote_expiry_succeeds_when_reserved_by_pending_order() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-XP-001");
        ProductVariant v = mkVariant("S6C-XP");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "X", "1"));

        var sq = salesQuoteRepository.findByPublicId(quote.quoteId()).orElseThrow();
        sq.setExpiresAt(LocalDateTime.now(clock).minusHours(1));
        salesQuoteRepository.save(sq);

        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var confirmed = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin:test");
        assertNotNull(confirmed.invoice());
        Long invoiceId = confirmed.invoice().id();
        var slice = invoiceService.listInvoices(PageRequest.of(0, 50));
        assertTrue(slice.getContent().stream().anyMatch(inv -> invoiceId.equals(inv.id())));
        PendingOrder refreshedPo = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.CONFIRMED, refreshedPo.getStatus());
        assertNotNull(refreshedPo.getInvoice());
        assertEquals(invoiceId, refreshedPo.getInvoice().getId());
    }

    @Test
    void direct_quote_invoice_rejected_when_quote_reserved_for_pending_order() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-DUP-001");
        ProductVariant v = mkVariant("S6C-DUP");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "pos",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                null,
                null,
                null,
                null,
                BigDecimal.ZERO
        ));
        pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "A", "1"));
        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoiceFromQuoteRequest(
                        new SalesInvoiceRequest(null, null, null, null, null, quote.quoteId(), "cash")));
    }

    @Test
    void public_quote_rejects_client_reward_line() {
        ProductVariant v = mkVariant("S6C-PUB");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, true)),
                null,
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        )));
    }

    @Test
    void storefront_quote_applies_percent_voucher() {
        ProductVariant v = mkVariant("S6C-VPCT");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Voucher vo = new Voucher();
        vo.setCode("PCT10");
        vo.setActive(true);
        vo.setPercent(new BigDecimal("10"));
        vo.setMinSubtotal(BigDecimal.ZERO);
        voucherRepository.save(vo);

        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                "pct10",
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertTrue(q.voucherSnapshot() != null);
        assertEquals(0, q.pricingBreakdownSnapshot().voucherDiscount().compareTo(new BigDecimal("10000")));
    }

    @Test
    void storefront_quote_applies_free_shipping_voucher() {
        ProductVariant v = mkVariant("S6C-FSHP");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Voucher vo = new Voucher();
        vo.setCode("FREESHIP");
        vo.setActive(true);
        vo.setFreeShipping(true);
        vo.setMinSubtotal(BigDecimal.ZERO);
        voucherRepository.save(vo);

        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                "FREESHIP",
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertTrue(q.shippingQuoteSnapshot().fee().compareTo(BigDecimal.ZERO) > 0);
        assertTrue(q.pricingBreakdownSnapshot().shippingDiscount().compareTo(BigDecimal.ZERO) > 0);
        assertEquals(0, q.pricingBreakdownSnapshot().voucherDiscount().compareTo(BigDecimal.ZERO));
    }

    @Test
    void storefront_quote_rejects_inactive_voucher() {
        ProductVariant v = mkVariant("S6C-VINA");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Voucher vo = new Voucher();
        vo.setCode("DEAD");
        vo.setActive(false);
        vo.setPercent(new BigDecimal("50"));
        voucherRepository.save(vo);

        assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                "dead",
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        )));
    }

    @Test
    void storefront_quote_percent_voucher_respects_remaining_subtotal_cap_after_promo() {
        ProductVariant v = mkVariant("S6C-VPD");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Promotion promo = new Promotion();
        promo.setName("Half");
        promo.setType("PERCENT_DISCOUNT");
        promo.setDiscountValue(new BigDecimal("50"));
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        Long promoId = promotionRepository.save(promo).getId();

        Voucher vo = new Voucher();
        vo.setCode("BIGPCT");
        vo.setActive(true);
        vo.setPercent(new BigDecimal("90"));
        vo.setMinSubtotal(BigDecimal.ZERO);
        voucherRepository.save(vo);

        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                promo.getId(),
                "BIGPCT",
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertEquals(0, q.pricingBreakdownSnapshot().promotionDiscount().compareTo(new BigDecimal("50000")));
        assertEquals(0, q.pricingBreakdownSnapshot().voucherDiscount().compareTo(new BigDecimal("50000")));
    }

    @Test
    void buy_x_get_y_quote_adds_reward_line() {
        Category cat = new Category();
        cat.setName("CAT-BXG");
        cat.setActive(true);
        cat = categoryRepository.save(cat);
        Product buyP = new Product();
        buyP.setCode("P-BUY");
        buyP.setName("Buy P");
        buyP.setCategory(cat);
        buyP.setActive(true);
        buyP.setProductType(Product.ProductType.SINGLE);
        buyP = productRepository.save(buyP);
        Product giftP = new Product();
        giftP.setCode("P-GIFT");
        giftP.setName("Gift P");
        giftP.setCategory(cat);
        giftP.setActive(true);
        giftP.setProductType(Product.ProductType.SINGLE);
        giftP = productRepository.save(giftP);

        ProductVariant buyV = new ProductVariant();
        buyV.setProduct(buyP);
        buyV.setVariantCode("BUYV");
        buyV.setVariantName("V");
        buyV.setSellUnit("cai");
        buyV.setPiecesPerUnit(1);
        buyV.setSellPrice(new BigDecimal("50000"));
        buyV.setCostPrice(new BigDecimal("20000"));
        buyV.setStockQty(0);
        buyV.setMinStockQty(0);
        buyV.setActive(true);
        buyV.setIsDefault(true);
        buyV.setIsSellable(true);
        buyV = variantRepository.save(buyV);

        ProductVariant giftV = new ProductVariant();
        giftV.setProduct(giftP);
        giftV.setVariantCode("GIFTV");
        giftV.setVariantName("V");
        giftV.setSellUnit("cai");
        giftV.setPiecesPerUnit(1);
        giftV.setSellPrice(new BigDecimal("30000"));
        giftV.setCostPrice(new BigDecimal("10000"));
        giftV.setStockQty(0);
        giftV.setMinStockQty(0);
        giftV.setActive(true);
        giftV.setIsDefault(true);
        giftV.setIsSellable(true);
        giftV = variantRepository.save(giftV);

        mkBatch(buyV, LocalDate.now().plusDays(30), 20);
        mkBatch(giftV, LocalDate.now().plusDays(30), 10);
        stockMutationService.syncVariantStockWithBatches(buyV.getId());
        stockMutationService.syncVariantStockWithBatches(giftV.getId());

        Promotion promo = new Promotion();
        promo.setName("BXGY");
        promo.setType("BUY_X_GET_Y");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(2);
        promo.setGetProductId(giftP.getId());
        promo.setGetQty(1);
        Long promoId = promotionRepository.save(promo).getId();

        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(buyP.getId(), buyV.getId(), 3, BigDecimal.ZERO, null, false)),
                promo.getId(),
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertEquals(1, q.rewardLines().size());
        assertTrue(q.rewardLines().getFirst().rewardLine());
        assertEquals(0, q.rewardLines().getFirst().unitPrice().compareTo(BigDecimal.ZERO));
        assertEquals(1, q.rewardLines().getFirst().quantity());
    }

    @Test
    void quote_pending_order_invoice_deducts_reward_stock() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-RWD-001");
        Category cat = new Category();
        cat.setName("CAT-RWD");
        cat.setActive(true);
        cat = categoryRepository.save(cat);
        Product buyP = new Product();
        buyP.setCode("P-BUY-R");
        buyP.setName("Buy R");
        buyP.setCategory(cat);
        buyP.setActive(true);
        buyP.setProductType(Product.ProductType.SINGLE);
        buyP = productRepository.save(buyP);
        Product giftP = new Product();
        giftP.setCode("P-GIFT-R");
        giftP.setName("Gift R");
        giftP.setCategory(cat);
        giftP.setActive(true);
        giftP.setProductType(Product.ProductType.SINGLE);
        giftP = productRepository.save(giftP);

        ProductVariant buyV = new ProductVariant();
        buyV.setProduct(buyP);
        buyV.setVariantCode("BRV");
        buyV.setVariantName("V");
        buyV.setSellUnit("cai");
        buyV.setPiecesPerUnit(1);
        buyV.setSellPrice(new BigDecimal("40000"));
        buyV.setCostPrice(new BigDecimal("15000"));
        buyV.setStockQty(0);
        buyV.setMinStockQty(0);
        buyV.setActive(true);
        buyV.setIsDefault(true);
        buyV.setIsSellable(true);
        buyV = variantRepository.save(buyV);

        ProductVariant giftV = new ProductVariant();
        giftV.setProduct(giftP);
        giftV.setVariantCode("GRV");
        giftV.setVariantName("V");
        giftV.setSellUnit("cai");
        giftV.setPiecesPerUnit(1);
        giftV.setSellPrice(new BigDecimal("25000"));
        giftV.setCostPrice(new BigDecimal("8000"));
        giftV.setStockQty(0);
        giftV.setMinStockQty(0);
        giftV.setActive(true);
        giftV.setIsDefault(true);
        giftV.setIsSellable(true);
        giftV = variantRepository.save(giftV);

        mkBatch(buyV, LocalDate.now().plusDays(30), 20);
        mkBatch(giftV, LocalDate.now().plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(buyV.getId());
        stockMutationService.syncVariantStockWithBatches(giftV.getId());

        Promotion promo = new Promotion();
        promo.setName("BXGY2");
        promo.setType("BUY_X_GET_Y");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(2);
        promo.setGetProductId(giftP.getId());
        promo.setGetQty(1);
        Long promoId = promotionRepository.save(promo).getId();

        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(buyP.getId(), buyV.getId(), 2, BigDecimal.ZERO, null, false)),
                promo.getId(),
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertEquals(1, quote.rewardLines().size());

        PendingOrderRequest preq = poFromQuote(quote.quoteId(), "bank_transfer", "Rwd", "090");
        var po = pendingOrderService.createOrder(preq);
        PendingOrder ord = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(2, ord.getItems().size());

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"S6C_RW","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, ord.getOrderNo(), ord.getTotalAmount().toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");

        PendingOrder refreshed = pendingOrderRepository.findById(ord.getId()).orElseThrow();
        assertNotNull(refreshed.getInvoice());
        SalesInvoice inv = salesInvoiceRepository.findById(refreshed.getInvoice().getId()).orElseThrow();
        assertTrue(inv.getItems().stream().anyMatch(i -> Boolean.TRUE.equals(i.isRewardLine())
                && i.getUnitPrice().compareTo(BigDecimal.ZERO) == 0));
        giftV = variantRepository.findById(giftV.getId()).orElseThrow();
        assertEquals(4, giftV.getStockQty());
    }

    @Test
    void quote_fails_when_sellable_less_than_paid_plus_gift_demand() {
        ProductVariant v = mkVariant("S6C-SLG-FAIL");
        mkBatch(v, LocalDate.now(clock).minusDays(1), 5);
        mkBatch(v, LocalDate.now(clock).plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        Promotion promo = new Promotion();
        promo.setName("QG-SAME-FAIL");
        promo.setType("QUANTITY_GIFT");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(1);
        promo.setGetProductId(v.getProduct().getId());
        promo.setGetQty(3);
        Long promoId = promotionRepository.save(promo).getId();

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(
                new SalesQuoteRequest(
                        "storefront",
                        null,
                        List.of(new SalesQuoteLineRequest(
                                v.getProduct().getId(), v.getId(), 3, BigDecimal.ZERO, null, false)),
                        promoId,
                        null,
                        null,
                        storefrontShipAddr(),
                        null,
                        BigDecimal.ZERO
                )));
        assertTrue(ex.getMessage().contains("Không đủ tồn bán được cho đơn hàng và quà tặng"));
        assertTrue(ex.getMessage().contains("[" + v.getVariantCode() + "]"));
        assertTrue(ex.getMessage().contains("Cần 6, còn 5."));
    }

    @Test
    void quote_passes_when_sellable_equals_paid_plus_gift_demand() {
        ProductVariant v = mkVariant("S6C-SLG-PASS");
        mkBatch(v, LocalDate.now(clock).minusDays(1), 4);
        mkBatch(v, LocalDate.now(clock).plusDays(30), 6);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        Promotion promo = new Promotion();
        promo.setName("QG-SAME-PASS");
        promo.setType("QUANTITY_GIFT");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(1);
        promo.setGetProductId(v.getProduct().getId());
        promo.setGetQty(3);
        promo = promotionRepository.save(promo);

        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 3, BigDecimal.ZERO, null, false)),
                promo.getId(),
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertEquals(1, quote.rewardLines().size());
        assertEquals(3, quote.rewardLines().getFirst().quantity());
    }

    @Test
    void pending_order_creation_fails_when_sellable_less_than_paid_plus_reward_demand() {
        ProductVariant v = mkVariant("S6C-PEND-SLG");
        mkBatch(v, LocalDate.now(clock).minusDays(1), 5);
        mkBatch(v, LocalDate.now(clock).plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var billable = new PendingOrderLineRequest(
                "l1",
                String.valueOf(v.getProduct().getId()),
                String.valueOf(v.getId()),
                v.getProduct().getName(),
                v.getVariantName(),
                3,
                v.getSellPrice(),
                v.getSellPrice().multiply(BigDecimal.valueOf(3)),
                null,
                false,
                null);
        var reward = new PendingOrderLineRequest(
                "l2",
                String.valueOf(v.getProduct().getId()),
                String.valueOf(v.getId()),
                v.getProduct().getName(),
                v.getVariantName(),
                3,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null,
                true,
                v.getSellPrice());
        var pricing = new PricingBreakdownSnapshotDto(
                v.getSellPrice().multiply(BigDecimal.valueOf(3)),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice().multiply(BigDecimal.valueOf(3)),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice().multiply(BigDecimal.valueOf(3)),
                null,
                null,
                null);
        var req = new PendingOrderRequest(
                null, "Sellable Guard", "0900000000", storefrontShipAddr(), null, "cod",
                List.of(billable, reward), null, null, null, pricing, null, null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> pendingOrderService.createOrder(req));
        assertTrue(ex.getMessage().contains("Không đủ tồn bán được cho đơn hàng và quà tặng"));
        assertTrue(ex.getMessage().contains("[" + v.getVariantCode() + "]"));
        assertTrue(ex.getMessage().contains("Cần 6, còn 5."));
    }

    @Test
    void quote_with_different_variant_gift_passes_when_each_variant_has_enough_sellable() {
        Category cat = new Category();
        cat.setName("CAT-S6C-SPLIT");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product buyP = new Product();
        buyP.setCode("P-S6C-BUY");
        buyP.setName("Buy S6C");
        buyP.setCategory(cat);
        buyP.setActive(true);
        buyP.setProductType(Product.ProductType.SINGLE);
        buyP = productRepository.save(buyP);

        Product giftP = new Product();
        giftP.setCode("P-S6C-GIFT");
        giftP.setName("Gift S6C");
        giftP.setCategory(cat);
        giftP.setActive(true);
        giftP.setProductType(Product.ProductType.SINGLE);
        giftP = productRepository.save(giftP);

        ProductVariant buyV = new ProductVariant();
        buyV.setProduct(buyP);
        buyV.setVariantCode("S6C-BUYV");
        buyV.setVariantName("V");
        buyV.setSellUnit("cai");
        buyV.setPiecesPerUnit(1);
        buyV.setSellPrice(new BigDecimal("70000"));
        buyV.setCostPrice(new BigDecimal("25000"));
        buyV.setStockQty(0);
        buyV.setMinStockQty(0);
        buyV.setActive(true);
        buyV.setIsDefault(true);
        buyV.setIsSellable(true);
        buyV = variantRepository.save(buyV);

        ProductVariant giftV = new ProductVariant();
        giftV.setProduct(giftP);
        giftV.setVariantCode("S6C-GIFTV");
        giftV.setVariantName("V");
        giftV.setSellUnit("cai");
        giftV.setPiecesPerUnit(1);
        giftV.setSellPrice(new BigDecimal("20000"));
        giftV.setCostPrice(new BigDecimal("7000"));
        giftV.setStockQty(0);
        giftV.setMinStockQty(0);
        giftV.setActive(true);
        giftV.setIsDefault(true);
        giftV.setIsSellable(true);
        giftV = variantRepository.save(giftV);

        mkBatch(buyV, LocalDate.now(clock).plusDays(30), 3);
        mkBatch(giftV, LocalDate.now(clock).plusDays(30), 3);
        stockMutationService.syncVariantStockWithBatches(buyV.getId());
        stockMutationService.syncVariantStockWithBatches(giftV.getId());

        Promotion promo = new Promotion();
        promo.setName("QG-SPLIT");
        promo.setType("QUANTITY_GIFT");
        promo.setDiscountValue(BigDecimal.ZERO);
        promo.setMinOrderValue(BigDecimal.ZERO);
        promo.setStartDate(LocalDateTime.now(clock).minusDays(1));
        promo.setEndDate(LocalDateTime.now(clock).plusDays(30));
        promo.setActive(true);
        promo.setAppliesTo("ALL");
        promo.setBuyQty(1);
        promo.setGetProductId(giftP.getId());
        promo.setGetQty(3);
        promo = promotionRepository.save(promo);

        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(buyP.getId(), buyV.getId(), 3, BigDecimal.ZERO, null, false)),
                promo.getId(),
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertEquals(1, quote.rewardLines().size());
        assertEquals(giftV.getId(), quote.rewardLines().getFirst().variantId());
        assertEquals(3, quote.rewardLines().getFirst().quantity());
    }

    @Test
    void expired_only_stock_is_treated_as_zero_for_quote_guard() {
        ProductVariant v = mkVariant("S6C-EXP-0");
        mkBatch(v, LocalDate.now(clock).minusDays(1), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(
                new SalesQuoteRequest(
                        "storefront",
                        null,
                        List.of(new SalesQuoteLineRequest(
                                v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                        null,
                        null,
                        null,
                        storefrontShipAddr(),
                        null,
                        BigDecimal.ZERO
                )));
        assertTrue(ex.getMessage().contains("Không đủ tồn bán được cho đơn hàng và quà tặng"));
        assertTrue(ex.getMessage().contains("[" + v.getVariantCode() + "]"));
        assertTrue(ex.getMessage().contains("Cần 1, còn 0."));
    }

    @Test
    void pos_quote_with_voucher_and_manual_discount_allowed() {
        ProductVariant v = mkVariant("S6C-POSV");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        Voucher vo = new Voucher();
        vo.setCode("POS5K");
        vo.setActive(true);
        vo.setFixedAmount(new BigDecimal("5000"));
        vo.setMinSubtotal(BigDecimal.ZERO);
        voucherRepository.save(vo);

        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "pos",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 2, new BigDecimal("5"), null, false)),
                null,
                "pos5k",
                new ShippingQuoteSnapshotDto("z", "1", new BigDecimal("15000"), null),
                null,
                new BigDecimal("10000"),
                BigDecimal.ZERO
        ));
        assertTrue(q.pricingBreakdownSnapshot().voucherDiscount().compareTo(BigDecimal.ZERO) > 0);
        assertTrue(q.pricingBreakdownSnapshot().manualDiscount().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void quote_mode_invoice_maps_source_and_payment_method() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6C-SRC-001");
        ProductVariant v = mkVariant("S6C-SRC");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "admin",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                null,
                null,
                null,
                null,
                BigDecimal.ZERO
        ));
        SalesInvoiceResponse inv = invoiceService.createInvoiceFromQuoteRequest(
                new SalesInvoiceRequest(null, null, null, null, null, quote.quoteId(), "card"));
        assertEquals("manual", inv.sourceType());
        assertEquals("card", inv.paymentMethod());
    }

    @Test
    void storefront_quote_rejects_line_discount_percent() {
        ProductVariant v = mkVariant("S6C-LDISC");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(
                        v.getProduct().getId(), v.getId(), 1, new BigDecimal("15"), null, false)),
                null,
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        )));
    }

    @Test
    void storefront_shipping_fee_backend_not_spoofed_by_client_snapshot() {
        ProductVariant v = mkVariant("S6C-SHIP0");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var q = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null,
                null,
                new ShippingQuoteSnapshotDto("fake", "ZZ", BigDecimal.ZERO, null),
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
        assertTrue(q.shippingQuoteSnapshot().fee().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void anonymous_pending_order_without_quote_rejected() {
        ProductVariant v = mkVariant("S6C-NOQ");
        mkBatch(v, LocalDate.now().plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var line = new PendingOrderLineRequest(
                "l1",
                String.valueOf(v.getProduct().getId()),
                String.valueOf(v.getId()),
                "P",
                "V",
                1,
                v.getSellPrice(),
                v.getSellPrice(),
                null,
                null,
                null);
        var pricing = new PricingBreakdownSnapshotDto(
                v.getSellPrice(),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice(),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice(),
                null,
                null,
                null);
        var req = new PendingOrderRequest(
                null, "N", "1", storefrontShipAddr(), null, "cod",
                List.of(line), null, null, null, pricing, null, null);
        assertThrows(IllegalArgumentException.class, () -> pendingOrderService.createOrder(req));
    }

    @Test
    void authenticated_admin_legacy_pending_order_without_quote_succeeds() {
        ProductVariant v = mkVariant("S6C-LEG");
        mkBatch(v, LocalDate.now().plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        SecurityContextHolder.getContext().setAuthentication(adminAuth());
        var line = new PendingOrderLineRequest(
                "l1",
                String.valueOf(v.getProduct().getId()),
                String.valueOf(v.getId()),
                "P",
                "V",
                1,
                v.getSellPrice(),
                v.getSellPrice(),
                null,
                null,
                null);
        var pricing = new PricingBreakdownSnapshotDto(
                v.getSellPrice(),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice(),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                v.getSellPrice(),
                null,
                null,
                null);
        var req = new PendingOrderRequest(
                null, "N", "1", storefrontShipAddr(), null, "cod",
                List.of(line), null, null, null, pricing, null, null);
        var po = pendingOrderService.createOrder(req);
        assertNotNull(po);
        assertTrue(Long.parseLong(po.id()) > 0);
    }

    @Test
    void storefront_quote_missing_street_rejected_even_when_raw_address_present() {
        ProductVariant v = mkVariant("S6C-STREET");
        mkBatch(v, LocalDate.now().plusDays(10), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        ShippingAddressDto missingStreet = new ShippingAddressDto(
                "A", "0909", "79", "Ho Chi Minh", "1442", "Quan 1", "21211", "Ben Nghe",
                "   ", "12 Le Loi, Ben Nghe, Quan 1", null);
        var req = new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, null, false)),
                null, null, null, missingStreet, null, BigDecimal.ZERO);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> salesQuoteService.quote(req));
        assertTrue(ex.getMessage().contains("Vui lòng nhập số nhà/tên đường."));
    }

    @Test
    void pending_order_direct_missing_street_rejected() {
        ProductVariant v = mkVariant("S6C-PO-STREET");
        mkBatch(v, LocalDate.now().plusDays(20), 3);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        SecurityContextHolder.getContext().setAuthentication(adminAuth());

        var line = new PendingOrderLineRequest(
                "l1",
                String.valueOf(v.getProduct().getId()),
                String.valueOf(v.getId()),
                "P",
                "V",
                1,
                v.getSellPrice(),
                v.getSellPrice(),
                null,
                null,
                null);
        var pricing = new PricingBreakdownSnapshotDto(
                v.getSellPrice(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, v.getSellPrice(), BigDecimal.ZERO,
                BigDecimal.ZERO, v.getSellPrice(), null, null, null);
        ShippingAddressDto badAddress = new ShippingAddressDto(
                "A", "0909", "79", "Ho Chi Minh", "1442", "Quan 1", "21211", "Ben Nghe",
                "", "12 Le Loi, Ben Nghe, Quan 1", null);
        var req = new PendingOrderRequest(
                null, "N", "1", badAddress, null, "cod",
                List.of(line), null, null, null, pricing, null, null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> pendingOrderService.createOrder(req));
        assertTrue(ex.getMessage().contains("Vui lòng nhập số nhà/tên đường."));
    }

    private static PendingOrderRequest poFromQuote(String quotePublicId, String payment, String name, String phone) {
        return new PendingOrderRequest(
                null,
                name,
                phone,
                storefrontShipAddr(),
                null,
                payment,
                null,
                null,
                null,
                null,
                null,
                null,
                quotePublicId);
    }

    private com.example.nhadanshop.dto.SalesQuoteResponse quoteStorefront(ProductVariant v, int qty, Long batchId) {
        return salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(v.getProduct().getId(), v.getId(), qty, BigDecimal.ZERO, batchId, false)),
                null,
                null,
                null,
                storefrontShipAddr(),
                null,
                BigDecimal.ZERO
        ));
    }

    private static ShippingAddressDto storefrontShipAddr() {
        return new ShippingAddressDto(
                "Nguyen Van A", "0909123456",
                "79", "Ho Chi Minh", "1442", "Quan 1", "21211", "Ben Nghe", "12 Le Loi", null, null);
    }

    private UsernamePasswordAuthenticationToken adminAuth() {
        return new UsernamePasswordAuthenticationToken("admin", "n/a", List.of());
    }

    private ProductVariant mkVariant(String sku) {
        Category cat = new Category();
        cat.setName("CAT-" + sku);
        cat.setActive(true);
        cat = categoryRepository.save(cat);
        Product p = new Product();
        p.setCode("P-" + sku);
        p.setName("Product " + sku);
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
        v.setCostPrice(new BigDecimal("40000"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private ProductBatch mkBatch(ProductVariant variant, LocalDate expiry, int qty) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("B-" + variant.getVariantCode() + "-" + System.nanoTime());
        batch.setExpiryDate(expiry);
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(new BigDecimal("50000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        return batchRepository.save(batch);
    }

    @TestConfiguration
    static class TestCfg {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-04-14T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
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
