package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.PaymentEvent;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.InventoryMovementRepository;
import com.example.nhadanshop.repository.PaymentEventRepository;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
        SellableStockService.class,
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
    @MockBean
    private StockedCatalogGuardService stockedCatalogGuardService;
    @MockBean
    private PromotionEvaluationService promotionEvaluationService;

    @Autowired
    private PaymentEventService paymentEventService;
    @Autowired
    private PendingOrderService pendingOrderService;
    @Autowired
    private StockMutationService stockMutationService;
    @Autowired
    private PendingOrderRepository pendingOrderRepository;
    @Autowired
    private PaymentEventRepository paymentEventRepository;
    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
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
    private SalesQuoteService salesQuoteService;
    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void webhook_hyphenated_order_code_exact_amount_auto_confirms() throws Exception {
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
        assertTrue(inventoryMovementRepository.count() > 0);
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_CE").orElseThrow();
        assertEquals(PaymentEvent.Status.LINKED, event.getStatus());
        assertEquals("casso:webhook", event.getLinkedBy());
    }

    @Test
    void webhook_retry_idempotent_no_duplicate_invoice() throws Exception {
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
    void webhook_compact_order_code_underpaid_review() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-LOW");
        ProductVariant v = mkVariant("PAYEVT-LOW");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "L", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        BigDecimal low = o.getTotalAmount().subtract(BigDecimal.ONE.max(BigDecimal.ZERO));
        String compact = o.getOrderNo().replace("-", "");
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_LOW","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, compact, low.toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_LOW").orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
    }

    @Test
    void webhook_compact_order_code_overpaid_review() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-HIGH");
        ProductVariant v = mkVariant("PAYEVT-HIGH");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "H", "1"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        BigDecimal high = o.getTotalAmount().add(BigDecimal.ONE);
        String compact = o.getOrderNo().replace("-", "");
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_HIGH","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, compact, high.toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(0L, salesInvoiceRepository.count());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_HIGH").orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
    }

    @Test
    void webhook_multiple_distinct_codes_stays_unmatched() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-MULTI");
        ProductVariant v = mkVariant("PAYEVT-MULTI");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quoteA = quoteStorefront(v, 1, null);
        var quoteB = quoteStorefront(v, 1, null);
        var poA = pendingOrderService.createOrder(poFromQuote(quoteA.quoteId(), "bank_transfer", "A", "1"));
        var poB = pendingOrderService.createOrder(poFromQuote(quoteB.quoteId(), "bank_transfer", "B", "2"));
        PendingOrder a = pendingOrderRepository.findById(Long.parseLong(poA.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_MULTI","description":"CK %s %s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, poA.code(), poB.code(), a.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(0L, salesInvoiceRepository.count());
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, pendingOrderRepository.findById(Long.parseLong(poA.id())).orElseThrow().getStatus());
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, pendingOrderRepository.findById(Long.parseLong(poB.id())).orElseThrow().getStatus());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_MULTI").orElseThrow();
        assertNull(event.getMatchedCode());
        assertEquals(PaymentEvent.Status.UNMATCHED, event.getStatus());
    }

    @Test
    void webhook_cancelled_order_does_not_confirm_or_link() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-CANCEL");
        ProductVariant v = mkVariant("PAYEVT-CANCEL");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "X", "1"));
        pendingOrderService.cancelOrder(Long.parseLong(po.id()), "cancel");
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_CANCEL","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.CANCELLED, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_CANCEL").orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
    }

    @Test
    void webhook_confirmed_order_does_not_create_second_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-DONE");
        ProductVariant v = mkVariant("PAYEVT-DONE");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        // cod path skips the new bank-link confirm guard so the test focuses solely on idempotency
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "cod", "Y", "1"));
        pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        long invoiceBefore = salesInvoiceRepository.count();
        long movementBefore = inventoryMovementRepository.count();

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_DONE","description":"%s","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getOrderNo(), o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        assertEquals(invoiceBefore, salesInvoiceRepository.count());
        assertEquals(movementBefore, inventoryMovementRepository.count());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_DONE").orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
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

    @Test
    void manual_link_marks_event_linked_without_auto_confirm_or_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML1");
        ProductVariant v = mkVariant("PAYEVT-ML1");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "090"));

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[{"tid":"PAY_EVT_ML1","description":"manual-link test","amount":200000,"when":"2026-04-24 10:15:30"}]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML1").orElseThrow();

        long invoiceBefore = salesInvoiceRepository.count();
        long movementBefore = inventoryMovementRepository.count();
        var linked = paymentEventService.linkToOrder(event.getId(), po.code(), "admin");

        assertFalse(linked.autoConfirmed());
        assertEquals("linked", linked.paymentEvent().status());
        assertEquals("admin", linked.paymentEvent().linkedBy());
        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invoiceBefore, salesInvoiceRepository.count());
        assertEquals(movementBefore, inventoryMovementRepository.count());
    }

    @Test
    void webhook_retry_after_manual_link_still_does_not_confirm() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-MLR");
        ProductVariant v = mkVariant("PAYEVT-MLR");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "098"));

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_MLR","description":"retry manual ingest","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, po.totalAmount().toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_MLR").orElseThrow();
        paymentEventService.linkToOrder(event.getId(), po.code(), "admin");

        long invoiceBeforeRetry = salesInvoiceRepository.count();
        long movementBeforeRetry = inventoryMovementRepository.count();
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PAID_AUTO, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invoiceBeforeRetry, salesInvoiceRepository.count());
        assertEquals(movementBeforeRetry, inventoryMovementRepository.count());
        var persisted = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_MLR").orElseThrow();
        assertEquals(PaymentEvent.Status.LINKED, persisted.getStatus());
        assertEquals("admin", persisted.getLinkedBy());
    }

    @Test
    void manual_link_request_cannot_mark_event_as_auto_source() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML-AUTO");
        ProductVariant v = mkVariant("PAYEVT-ML-AUTO");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "097"));

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[{"tid":"PAY_EVT_ML_AUTO","description":"manual-link auto attempt","amount":200000,"when":"2026-04-24 10:15:30"}]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML_AUTO").orElseThrow();
        long invoiceBefore = salesInvoiceRepository.count();
        long movementBefore = inventoryMovementRepository.count();

        var linked = paymentEventService.linkToOrder(event.getId(), po.code(), "auto");
        assertEquals("admin", linked.paymentEvent().linkedBy());
        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invoiceBefore, salesInvoiceRepository.count());
        assertEquals(movementBefore, inventoryMovementRepository.count());

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invoiceBefore, salesInvoiceRepository.count());
        assertEquals(movementBefore, inventoryMovementRepository.count());
    }

    @Test
    void manual_link_same_order_is_idempotent_no_side_effect() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML2");
        ProductVariant v = mkVariant("PAYEVT-ML2");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "091"));

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[{"tid":"PAY_EVT_ML2","description":"manual-link test","amount":200000,"when":"2026-04-24 10:15:30"}]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML2").orElseThrow();

        var first = paymentEventService.linkToOrder(event.getId(), po.code(), "admin");
        var second = paymentEventService.linkToOrder(event.getId(), po.code(), "admin");

        assertEquals(first.paymentEvent().id(), second.paymentEvent().id());
        assertFalse(second.autoConfirmed());
        assertEquals(0L, salesInvoiceRepository.count());
    }

    @Test
    void manual_link_to_different_order_conflicts() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML3");
        ProductVariant v = mkVariant("PAYEVT-ML3");
        mkBatch(v, LocalDate.now().plusDays(30), 30);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quoteA = quoteStorefront(v, 1, null);
        var quoteB = quoteStorefront(v, 1, null);
        var orderA = pendingOrderService.createOrder(poFromQuote(quoteA.quoteId(), "bank_transfer", "A", "090"));
        var orderB = pendingOrderService.createOrder(poFromQuote(quoteB.quoteId(), "bank_transfer", "B", "091"));

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[{"tid":"PAY_EVT_ML3","description":"manual-link conflict","amount":200000,"when":"2026-04-24 10:15:30"}]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML3").orElseThrow();

        paymentEventService.linkToOrder(event.getId(), orderA.code(), "admin");
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> paymentEventService.linkToOrder(event.getId(), orderB.code(), "admin"));
        assertTrue(ex.getMessage().contains("đơn hàng khác"));
    }

    @Test
    void manual_link_cancelled_confirmed_rejected() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML4", "INV-PAYEVT-ML5");
        ProductVariant v = mkVariant("PAYEVT-ML4");
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var quoteConfirmed = quoteStorefront(v, 1, null);
        // cod sidesteps the bank-link confirm guard; this test only cares about post-terminal manual-link rejection
        var poConfirmed = pendingOrderService.createOrder(poFromQuote(quoteConfirmed.quoteId(), "cod", "C", "090"));
        pendingOrderService.confirmOrder(Long.parseLong(poConfirmed.id()), null, "test");

        var quoteCancelled = quoteStorefront(v, 1, null);
        var poCancelled = pendingOrderService.createOrder(poFromQuote(quoteCancelled.quoteId(), "bank_transfer", "D", "091"));
        pendingOrderService.cancelOrder(Long.parseLong(poCancelled.id()), "cancel");

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[
                  {"tid":"PAY_EVT_ML4A","description":"manual-link confirmed","amount":200000,"when":"2026-04-24 10:15:30"},
                  {"tid":"PAY_EVT_ML4B","description":"manual-link cancelled","amount":200000,"when":"2026-04-24 10:15:30"}
                ]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var eventA = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML4A").orElseThrow();
        var eventB = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML4B").orElseThrow();

        assertThrows(IllegalStateException.class,
                () -> paymentEventService.linkToOrder(eventA.getId(), poConfirmed.code(), "admin"));
        assertThrows(IllegalStateException.class,
                () -> paymentEventService.linkToOrder(eventB.getId(), poCancelled.code(), "admin"));
    }

    @Test
    void confirm_after_manual_link_creates_invoice_once() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-ML6");
        ProductVariant v = mkVariant("PAYEVT-ML6");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "093"));

        JsonNode payload = objectMapper.readTree("""
                {"error":0,"data":[{"tid":"PAY_EVT_ML6","description":"manual-link then confirm","amount":200000,"when":"2026-04-24 10:15:30"}]}
                """);
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_ML6").orElseThrow();
        paymentEventService.linkToOrder(event.getId(), po.code(), "admin");

        pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");

        assertEquals(1L, salesInvoiceRepository.count());
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
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", cassoTid).orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
    }

    @Test
    void linkable_candidates_include_only_eligible_pending_orders() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-CAND");
        ProductVariant v = mkVariant("PAYEVT-CAND");
        mkBatch(v, LocalDate.now().plusDays(30), 80);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var pending = pendingOrderService.createOrder(poFromQuote(quoteStorefront(v, 1, null).quoteId(), "bank_transfer", "HOTFIX-CAND", "100"));
        var waiting = pendingOrderService.createOrder(poFromQuote(quoteStorefront(v, 1, null).quoteId(), "bank_transfer", "HOTFIX-CAND", "101"));
        pendingOrderService.markWaitingConfirm(Long.parseLong(waiting.id()), null);
        var cancelled = pendingOrderService.createOrder(poFromQuote(quoteStorefront(v, 1, null).quoteId(), "bank_transfer", "HOTFIX-CAND", "102"));
        pendingOrderService.cancelOrder(Long.parseLong(cancelled.id()), "cancel");
        // cod sidesteps the bank-link guard; this test only verifies linkable filtering by status, not confirm pathway
        var confirmed = pendingOrderService.createOrder(poFromQuote(quoteStorefront(v, 1, null).quoteId(), "cod", "HOTFIX-CAND", "103"));
        pendingOrderService.confirmOrder(Long.parseLong(confirmed.id()), null, "admin");

        var page = pendingOrderService.listLinkableCandidates(0, 20, "HOTFIX-CAND", PageRequest.of(0, 20));
        List<String> codes = page.getContent().stream().map(com.example.nhadanshop.dto.PendingOrderResponse::code).toList();

        assertEquals(2L, page.getTotalElements());
        assertTrue(codes.contains(pending.code()));
        assertTrue(codes.contains(waiting.code()));
        assertFalse(codes.contains(cancelled.code()));
        assertFalse(codes.contains(confirmed.code()));
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
                "79", "Ho Chi Minh", "1442", "Quan 1", "21211", "Ben Nghe", "12 Le Loi", null, null);
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

    @Test
    void webhook_compact_order_code_exact_amount_auto_confirms() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-CMP");
        ProductVariant v = mkVariant("PAYEVT-CMP");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "C", "090"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        String compact = o.getOrderNo().replace("-", "");

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_CMP","description":"CK %s khach","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, compact, o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.CONFIRMED, refreshed.getStatus());
        assertNotNull(refreshed.getInvoice());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_CMP").orElseThrow();
        assertEquals(PaymentEvent.Status.LINKED, event.getStatus());
    }

    @Test
    void webhook_multiple_distinct_codes_in_content_stays_unmatched() throws Exception {
        ProductVariant v = mkVariant("PAYEVT-MULTI");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "M", "091"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        String compact = o.getOrderNo().replace("-", "");
        String other = "DH20991231001";

        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_MULTI","description":"mix %s %s end","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, compact, other, o.getTotalAmount().toPlainString()));

        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_MULTI").orElseThrow();
        assertNull(event.getMatchedCode());
        assertEquals(PaymentEvent.Status.UNMATCHED, event.getStatus());
        assertNull(event.getLinkedPendingOrder());
    }

    @Test
    void manual_link_exact_sets_paid_auto_no_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-EX");
        ProductVariant v = mkVariant("PAYEVT-EXACT");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "E", "092"));

        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_EX","description":"no code here","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, o.getTotalAmount().toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_EX").orElseThrow();

        long inv0 = salesInvoiceRepository.count();
        var linked = paymentEventService.linkToOrder(event.getId(), o.getOrderNo(), "admin");
        assertFalse(linked.autoConfirmed());

        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PAID_AUTO, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(inv0, salesInvoiceRepository.count());
        assertEquals(PaymentEvent.Status.LINKED, paymentEventRepository.findById(event.getId()).orElseThrow().getStatus());
        assertEquals("EXACT_PAID", linked.pendingOrder().paymentLinkStatus());
    }

    @Test
    void manual_link_overpaid_links_review_not_paid_auto() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-OVR");
        ProductVariant v = mkVariant("PAYEVT-OVR");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "O", "093"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        BigDecimal over = o.getTotalAmount().add(new BigDecimal("1"));
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_OVR","description":"over","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, over.toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_OVR").orElseThrow();
        var linked = paymentEventService.linkToOrder(event.getId(), o.getOrderNo(), "admin");
        assertEquals("OVERPAID_LINKED", linked.pendingOrder().paymentLinkStatus());
        assertEquals(0, linked.pendingOrder().paymentDelta().compareTo(new BigDecimal("1")));
        PendingOrder refreshed = pendingOrderRepository.findById(o.getId()).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
    }

    @Test
    void manual_link_underpaid_links_review_not_paid_auto() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-UND");
        ProductVariant v = mkVariant("PAYEVT-UND");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        var po = pendingOrderService.createOrder(poFromQuote(quote.quoteId(), "bank_transfer", "U", "094"));
        PendingOrder o = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        BigDecimal under = o.getTotalAmount().subtract(new BigDecimal("5000"));
        JsonNode payload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_UND","description":"under","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, under.toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_UND").orElseThrow();
        var linked = paymentEventService.linkToOrder(event.getId(), o.getOrderNo(), "admin");
        assertEquals("UNDERPAID_LINKED", linked.pendingOrder().paymentLinkStatus());
        assertEquals(0, linked.pendingOrder().paymentDelta().compareTo(new BigDecimal("-5000")));
        assertEquals(PendingOrder.Status.PENDING_PAYMENT,
                pendingOrderRepository.findById(o.getId()).orElseThrow().getStatus());
    }

    @Test
    void manual_link_over_under_visible_in_pending_response() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAYEVT-VIS");
        ProductVariant v = mkVariant("PAYEVT-VIS");
        mkBatch(v, LocalDate.now().plusDays(30), 20);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var overQuote = quoteStorefront(v, 1, null);
        var overPo = pendingOrderService.createOrder(poFromQuote(overQuote.quoteId(), "bank_transfer", "VO", "095"));
        PendingOrder overOrder = pendingOrderRepository.findById(Long.parseLong(overPo.id())).orElseThrow();
        JsonNode overPayload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_VIS_OVR","description":"visible over","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, overOrder.getTotalAmount().add(new BigDecimal("7")).toPlainString()));
        paymentEventService.ingestCassoPayload(overPayload, null, "test-secure-token");
        var overEvent = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_VIS_OVR").orElseThrow();
        paymentEventService.linkToOrder(overEvent.getId(), overOrder.getOrderNo(), "admin");
        var overResponse = pendingOrderService.getById(overOrder.getId());
        assertEquals("OVERPAID_LINKED", overResponse.paymentLinkStatus());
        assertEquals(0, overResponse.paymentDelta().compareTo(new BigDecimal("7")));
        assertEquals(overEvent.getId(), overResponse.linkedPaymentEventId());
        assertEquals(0, overResponse.linkedPaymentAmount().compareTo(overEvent.getAmount()));

        var underQuote = quoteStorefront(v, 1, null);
        var underPo = pendingOrderService.createOrder(poFromQuote(underQuote.quoteId(), "bank_transfer", "VU", "096"));
        PendingOrder underOrder = pendingOrderRepository.findById(Long.parseLong(underPo.id())).orElseThrow();
        JsonNode underPayload = objectMapper.readTree(String.format("""
                {"error":0,"data":[{"tid":"PAY_EVT_VIS_UND","description":"visible under","amount":%s,"when":"2026-04-24 10:15:30"}]}
                """, underOrder.getTotalAmount().subtract(new BigDecimal("9")).toPlainString()));
        paymentEventService.ingestCassoPayload(underPayload, null, "test-secure-token");
        var underEvent = paymentEventRepository.findByProviderAndProviderTxId("casso", "PAY_EVT_VIS_UND").orElseThrow();
        paymentEventService.linkToOrder(underEvent.getId(), underOrder.getOrderNo(), "admin");
        var underResponse = pendingOrderService.getById(underOrder.getId());
        assertEquals("UNDERPAID_LINKED", underResponse.paymentLinkStatus());
        assertEquals(0, underResponse.paymentDelta().compareTo(new BigDecimal("-9")));
        assertEquals(underEvent.getId(), underResponse.linkedPaymentEventId());
        assertEquals(0, underResponse.linkedPaymentAmount().compareTo(underEvent.getAmount()));
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
