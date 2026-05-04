package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Focused regressions around {@link PaymentEventService}: Casso webhook ingest,
 * auto-link, and transactional confirm→invoice semantics. Mirrors the payment-event
 * slice of {@link Slice6cQuotePaymentIntegrationTest} without replacing it.
 */
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
        GhnShippingService.class,
        ProductBatchService.class,
        StockMutationService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        Slice6cQuotePaymentIntegrationTest.TestCfg.class
})
class PaymentEventIntegrationTest {

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
    private StockMutationService stockMutationService;
    @Autowired
    private PendingOrderRepository pendingOrderRepository;
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
    private SalesQuoteService salesQuoteService;
    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void webhook_bank_transfer_matching_amount_confirms_and_creates_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-001");
        ProductVariant v = mkVariant("PAYEVT-CE");
        ProductBatch batch = mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 2, batch.getId());
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "P", "090"));

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_CE","description":"CK %s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, po.code(), po.totalAmount().toPlainString()));

        var result = paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertTrue(result.markedPaidAuto() >= 1);

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.CONFIRMED, refreshed.getStatus());
        assertNotNull(refreshed.getInvoice());
    }

    @Test
    void webhook_retry_does_not_duplicate_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-RP");
        ProductVariant v = mkVariant("PAYEVT-RP");
        mkBatch(v, LocalDate.now().plusDays(30), 5);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "R", "1"));
        long oid = Long.parseLong(po.id());
        PendingOrder o = pendingOrderRepository.findById(oid).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_RP","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");

        assertEquals(1L, salesInvoiceRepository.count());
        assertNotNull(pendingOrderRepository.findById(oid).orElseThrow().getInvoice());
    }

    @Test
    void webhook_insufficient_amount_does_not_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-LOW");
        ProductVariant v = mkVariant("PAYEVT-LOW");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "L", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        BigDecimal low = o.getTotalAmount().subtract(BigDecimal.ONE.max(BigDecimal.ZERO));
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_LOW","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), low.toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
    }

    @Test
    void webhook_zalopay_does_not_auto_confirm() throws Exception {
        webhook_non_bank_does_not_auto_confirm("zalopay", "PAYEVT-ZP", "PAY_EVT_ZP", "INV-PAYEVT-ZP");
    }

    @Test
    void webhook_momo_does_not_auto_confirm() throws Exception {
        webhook_non_bank_does_not_auto_confirm("momo", "PAYEVT-MM", "PAY_EVT_MM", "INV-PAYEVT-MM");
    }

    @Test
    void webhook_cod_does_not_auto_confirm() throws Exception {
        webhook_non_bank_does_not_auto_confirm("cod", "PAYEVT-COD", "PAY_EVT_COD", "INV-PAYEVT-COD");
    }

    private void webhook_non_bank_does_not_auto_confirm(
            String paymentMethod,
            String variantSku,
            String cassoTid,
            String invoiceStub
    ) throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn(invoiceStub);
        ProductVariant v = mkVariant(variantSku);
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), paymentMethod, "X", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"%s","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, cassoTid, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(PendingOrder.Status.PENDING_PAYMENT,
                pendingOrderRepository.findById(o.getId()).orElseThrow().getStatus());
    }

    private static PendingOrderRequest poFromQuote(String quotePublicId, String payment, String name, String phone) {
        return new PendingOrderRequest(
                null,
                name,
                phone,
                null,
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
                "79", "Ho Chi Minh", "1442", "Quan 1", "21211", "Ben Nghe", "12 Le Loi", null);
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
}
