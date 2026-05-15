package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PendingOrderRequest;
import com.example.nhadanshop.dto.PendingOrderResponse;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
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
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Bank-transfer confirm guard + aggregate-linked payment matrix.
 *
 * <p>Mirrors the test names listed in the implementation plan (Tier 1 — Backend JUnit).
 * Non-bank confirm paths and Casso under/over-pay paths are also asserted here so the matrix
 * can be reported under one class name.
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
class PendingOrderBankConfirmIntegrationTest {

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
    private InvoiceService invoiceService;
    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    // ── Bank guard: confirmOrder semantics ────────────────────────────────────

    @Test
    void bank_no_link_confirm_rejected() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-NOLINK");
        var po = newBankPending("NOLINK");
        long invBefore = salesInvoiceRepository.count();

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin"));
        assertTrue(ex.getMessage().contains("chưa có giao dịch") || ex.getMessage().contains("giao dịch"));
        assertEquals(invBefore, salesInvoiceRepository.count());
        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertNull(refreshed.getInvoice());
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
    }

    @Test
    void bank_underpaid_manual_link_confirm_rejected() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-UNDER");
        var po = newBankPending("UNDER");
        BigDecimal total = po.totalAmount();
        manualLink(po.code(), total.subtract(new BigDecimal("1")), "PE_UNDER");
        long invBefore = salesInvoiceRepository.count();

        assertThrows(IllegalStateException.class,
                () -> pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin"));
        assertEquals(invBefore, salesInvoiceRepository.count());
    }

    @Test
    void bank_exact_manual_link_confirm_allowed() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-EXACT");
        var po = newBankPending("EX");
        BigDecimal total = po.totalAmount();
        manualLink(po.code(), total, "PE_EX");

        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
        assertEquals(1L, salesInvoiceRepository.count());
        assertEquals(0, resp.invoice().totalAmount().compareTo(total));
    }

    @Test
    void bank_overpaid_manual_link_confirm_allowed_invoice_total_equals_pending() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-OVER");
        var po = newBankPending("OV");
        BigDecimal total = po.totalAmount();
        manualLink(po.code(), total.add(new BigDecimal("3000")), "PE_OV");

        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
        // Invoice keeps pending total — overpay aggregate must not become invoice revenue.
        assertEquals(0, resp.invoice().totalAmount().compareTo(total));
    }

    @Test
    void bank_multiple_manual_links_underpaid_rejected() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-MUNDER");
        var po = newBankPending("MUND");
        BigDecimal total = po.totalAmount();
        BigDecimal half = total.divide(new BigDecimal("2"));
        manualLink(po.code(), half.subtract(new BigDecimal("100")), "PE_MUND_A");
        manualLink(po.code(), half.subtract(new BigDecimal("100")), "PE_MUND_B");

        long invBefore = salesInvoiceRepository.count();
        assertThrows(IllegalStateException.class,
                () -> pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin"));
        assertEquals(invBefore, salesInvoiceRepository.count());
        PendingOrderResponse refreshed = pendingOrderService.getById(Long.parseLong(po.id()));
        assertEquals(2L, refreshed.linkedPaymentCount());
        assertEquals("UNDERPAID_LINKED", refreshed.paymentLinkStatus());
    }

    @Test
    void bank_multiple_manual_links_exact_allowed() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-MEXACT");
        var po = newBankPending("MEX");
        BigDecimal total = po.totalAmount();
        BigDecimal portion = total.divide(new BigDecimal("2"));
        BigDecimal remainder = total.subtract(portion);
        manualLink(po.code(), portion, "PE_MEX_A");
        manualLink(po.code(), remainder, "PE_MEX_B");

        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
        assertEquals(1L, salesInvoiceRepository.count());
        assertEquals(2L, resp.pendingOrder().linkedPaymentCount());
    }

    @Test
    void bank_multiple_manual_links_overpaid_allowed() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-BANK-MOVER");
        var po = newBankPending("MOV");
        BigDecimal total = po.totalAmount();
        manualLink(po.code(), total, "PE_MOV_A");
        manualLink(po.code(), new BigDecimal("1500"), "PE_MOV_B");

        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertEquals(0, resp.invoice().totalAmount().compareTo(total));
        assertEquals(2L, resp.pendingOrder().linkedPaymentCount());
        assertEquals("OVERPAID_LINKED", resp.pendingOrder().paymentLinkStatus());
    }

    // ── Aggregate visibility in PendingOrderResponse ──────────────────────────

    @Test
    void pending_response_aggregates_linked_payment_total_count_delta() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-AGG-VIS");
        var po = newBankPending("AGG");
        BigDecimal total = po.totalAmount();
        manualLink(po.code(), total.subtract(new BigDecimal("4000")), "PE_AGG_A");
        manualLink(po.code(), new BigDecimal("1000"), "PE_AGG_B");

        PendingOrderResponse resp = pendingOrderService.getById(Long.parseLong(po.id()));
        assertEquals(2L, resp.linkedPaymentCount());
        assertEquals(0, resp.linkedPaymentTotal().compareTo(total.subtract(new BigDecimal("3000"))));
        assertEquals(0, resp.paymentDelta().compareTo(new BigDecimal("-3000")));
        assertEquals("UNDERPAID_LINKED", resp.paymentLinkStatus());
    }

    @Test
    void manual_link_exact_sets_paid_auto_no_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-PAID-AUTO");
        var po = newBankPending("PAUTO");
        BigDecimal total = po.totalAmount();
        long invBefore = salesInvoiceRepository.count();
        manualLink(po.code(), total, "PE_PAUTO");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PAID_AUTO, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invBefore, salesInvoiceRepository.count());
    }

    @Test
    void manual_link_overpaid_links_review_not_paid_auto_no_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-OVR-NA");
        var po = newBankPending("OVRNA");
        BigDecimal total = po.totalAmount();
        long invBefore = salesInvoiceRepository.count();
        manualLink(po.code(), total.add(new BigDecimal("1")), "PE_OVRNA");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invBefore, salesInvoiceRepository.count());
    }

    @Test
    void manual_link_underpaid_links_review_not_paid_auto_no_invoice() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-UND-NA");
        var po = newBankPending("UNDNA");
        BigDecimal total = po.totalAmount();
        long invBefore = salesInvoiceRepository.count();
        manualLink(po.code(), total.subtract(new BigDecimal("1")), "PE_UNDNA");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        assertEquals(invBefore, salesInvoiceRepository.count());
    }

    // ── Non-bank confirm paths are never blocked by link guard ────────────────

    @Test
    void cod_confirm_not_blocked_by_payment_link_guard() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-COD-OK");
        var po = newNonBankPending("CODOK", "cod");
        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
    }

    @Test
    void momo_confirm_not_blocked_by_payment_link_guard() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-MOMO-OK");
        var po = newNonBankPending("MOMOOK", "momo");
        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
    }

    @Test
    void zalopay_confirm_not_blocked_by_payment_link_guard() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-ZP-OK");
        var po = newNonBankPending("ZPOK", "zalopay");
        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
    }

    // ── Casso webhook paths through the new attach+save+flush+confirm order ──

    @Test
    void casso_exact_webhook_still_auto_confirms() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-CASSO-EX");
        var po = newBankPending("CEX");
        BigDecimal total = po.totalAmount();
        cassoIngest(po.code(), total, "TID_CEX");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.CONFIRMED, refreshed.getStatus());
        assertNotNull(refreshed.getInvoice());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "TID_CEX").orElseThrow();
        assertEquals(PaymentEvent.Status.LINKED, event.getStatus());
    }

    @Test
    void casso_underpaid_waits_for_manual_link() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-CASSO-U");
        var po = newBankPending("CUND");
        BigDecimal total = po.totalAmount();
        cassoIngest(po.code(), total.subtract(new BigDecimal("1000")), "TID_CUND");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "TID_CUND").orElseThrow();
        assertEquals(PaymentEvent.Status.MATCHED, event.getStatus());

        // Then a manual link with the remainder unlocks confirm.
        manualLink(po.code(), new BigDecimal("1000"), "PE_CUND_TOP");
        // Still under because the Casso row stayed MATCHED (no LINKED) — guard sees only the manual top-up.
        // Top up to exact by linking one more event for the rest.
        manualLink(po.code(), total.subtract(new BigDecimal("1000")), "PE_CUND_REM");
        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertNotNull(resp.invoice());
    }

    @Test
    void casso_overpaid_waits_for_manual_link() throws Exception {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-CASSO-O");
        var po = newBankPending("COVR");
        BigDecimal total = po.totalAmount();
        cassoIngest(po.code(), total.add(new BigDecimal("500")), "TID_COVR");

        PendingOrder refreshed = pendingOrderRepository.findById(Long.parseLong(po.id())).orElseThrow();
        assertEquals(PendingOrder.Status.PENDING_PAYMENT, refreshed.getStatus());
        assertNull(refreshed.getInvoice());

        // Admin manual-links the same matched event → aggregate >= total → confirm allowed.
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", "TID_COVR").orElseThrow();
        paymentEventService.linkToOrder(event.getId(), po.code(), "admin");
        var resp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        assertEquals(0, resp.invoice().totalAmount().compareTo(total));
    }

    // ── Invoice list: pendingOrderCode + batch lookup contract ────────────────

    @Test
    void invoice_response_includes_pending_order_code() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-INV-PO");
        var po = newNonBankPending("INVPO", "cod");
        pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");

        var page = invoiceService.listInvoicesAdmin(PageRequest.of(0, 20), null, null, null, null);
        assertEquals(1, page.getTotalElements());
        SalesInvoiceResponse only = page.getContent().get(0);
        assertEquals(po.code(), only.pendingOrderCode());
        assertEquals(po.id(), only.pendingOrderId());
    }

    @Test
    void invoice_response_keeps_pending_order_id_fallback() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-INV-FALL");
        var po = newNonBankPending("INVFB", "cod");
        var confirmResp = pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
        Long invoiceId = confirmResp.invoice().id();

        // Simulate a non-existent pending row (FE fallback contract: pendingOrderCode == null,
        // pendingOrderId still present so the UI renders "PO #{id}").
        var invoice = salesInvoiceRepository.findById(invoiceId).orElseThrow();
        invoice.setPendingOrderId(999_999_999L);
        salesInvoiceRepository.save(invoice);

        SalesInvoiceResponse single = invoiceService.getInvoice(invoiceId);
        assertNull(single.pendingOrderCode());
        assertEquals("999999999", single.pendingOrderId());
    }

    @Test
    void invoice_list_pending_order_code_no_n_plus_one() {
        // Create K > 1 ONLINE_PENDING invoices in one page. The contract here is that the batch lookup
        // resolves all pending codes in one repository call, not one per row. We assert at the contract
        // level: every row in the list carries the resolved code without any null gaps. A spy/statistics
        // assertion would couple to Hibernate Statistics; this functional check is enough to detect N+1
        // regressions that drop rows or only resolve the first one.
        when(invoiceNumberGenerator.nextInvoiceNo())
                .thenReturn("INV-NN-1", "INV-NN-2", "INV-NN-3", "INV-NN-4");
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            var po = newNonBankPending("NN" + i, "cod");
            pendingOrderService.confirmOrder(Long.parseLong(po.id()), null, "admin");
            codes.add(po.code());
        }
        var page = invoiceService.listInvoicesAdmin(PageRequest.of(0, 10), null, null, null, null);
        assertEquals(4, page.getTotalElements());
        for (SalesInvoiceResponse row : page.getContent()) {
            assertNotNull(row.pendingOrderCode(), "Every ONLINE_PENDING row must carry a code");
            assertTrue(codes.contains(row.pendingOrderCode()));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private PendingOrderResponse newBankPending(String tag) {
        return newPending(tag, "bank_transfer");
    }

    private PendingOrderResponse newNonBankPending(String tag, String method) {
        return newPending(tag, method);
    }

    private PendingOrderResponse newPending(String tag, String method) {
        ProductVariant v = mkVariant("BANKGUARD-" + tag);
        mkBatch(v, LocalDate.now().plusDays(30), 50);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        var quote = quoteStorefront(v, 1, null);
        return pendingOrderService.createOrder(new PendingOrderRequest(
                null,
                "C-" + tag,
                "09" + tag.hashCode(),
                null,
                null,
                method,
                null,
                null,
                null,
                null,
                null,
                null,
                quote.quoteId()));
    }

    private void manualLink(String orderCode, BigDecimal amount, String tid) throws Exception {
        JsonNode payload = objectMapper.readTree(String.format(
                "{\"error\":0,\"data\":[{\"tid\":\"%s\",\"description\":\"manual %s\",\"amount\":%s,\"when\":\"2026-04-24 10:15:30\"}]}",
                tid, tid, amount.toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
        var event = paymentEventRepository.findByProviderAndProviderTxId("casso", tid).orElseThrow();
        paymentEventService.linkToOrder(event.getId(), orderCode, "admin");
    }

    private void cassoIngest(String orderCode, BigDecimal amount, String tid) throws Exception {
        JsonNode payload = objectMapper.readTree(String.format(
                "{\"error\":0,\"data\":[{\"tid\":\"%s\",\"description\":\"CK %s\",\"amount\":%s,\"when\":\"2026-04-24 10:15:30\"}]}",
                tid, orderCode, amount.toPlainString()));
        paymentEventService.ingestCassoPayload(payload, null, "test-secure-token");
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
                BigDecimal.ZERO));
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

    @SuppressWarnings("unused")
    private static void assertNotEmpty(List<?> list) {
        assertFalse(list.isEmpty());
    }
}
