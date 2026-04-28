package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.PosScanResponse;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.SalesInvoiceItemBatchAllocation;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        InvoiceService.class,
        ProductBatchService.class,
        StockMutationService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        PosScanService.class,
        Slice6bPosTraceabilityIntegrationTest.TestCfg.class
})
class Slice6bPosTraceabilityIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private PosScanService posScanService;
    @Autowired
    private StockMutationService stockMutationService;

    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private Clock businessClock;

    @BeforeEach
    void auth() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("slice6b", "n/a", List.of()));
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-NS-" + System.nanoTime());
    }

    @Test
    void scan_batch_payload_maps_metadata() {
        ProductVariant v = variantSku("SCAN-BATCH");
        ProductBatch later = mkBatch(v, "LATER", plusDays(30), 10, new BigDecimal("9000"));
        mkBatch(v, "EARLY", plusDays(5), 10, new BigDecimal("7000"));

        PosScanResponse scan = posScanService.scan("BATCH:" + later.getId());
        assertEquals("batch", scan.kind());
        assertEquals(later.getId(), scan.batchId());
        assertTrue(scan.sellable());
    }

    @Test
    void exact_batch_beats_fefo_and_restores_on_cancel() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00001");

        ProductVariant v = variantSku("S6B-FEFO");
        ProductBatch early = mkBatch(v, "EARLY", plusDays(5), 10, new BigDecimal("7000"));
        ProductBatch later = mkBatch(v, "LATER", plusDays(30), 10, new BigDecimal("9000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        SalesInvoiceResponse created = invoiceService.createInvoice(new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(v.getProduct().getId(), 3, null, v.getId(), null, later.getId())), null));

        assertEquals(10, batchRepository.findById(early.getId()).orElseThrow().getRemainingQty());
        assertEquals(7, batchRepository.findById(later.getId()).orElseThrow().getRemainingQty());

        SalesInvoice persisted = salesInvoiceRepository.findById(created.id()).orElseThrow();
        SalesInvoiceItem line = persisted.getItems().getFirst();
        assertEquals(0, later.getCostPrice().compareTo(line.getUnitCostSnapshot()));

        Map<Long, Integer> alloc = line.getBatchAllocations().stream().collect(Collectors.toMap(
                a -> a.getBatch().getId(),
                SalesInvoiceItemBatchAllocation::getDeductedQty));
        assertEquals(Map.of(later.getId(), 3), alloc);

        invoiceService.cancelInvoice(created.id(), "reset", "tester");

        assertEquals(10, batchRepository.findById(later.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void legacy_without_batch_id_still_uses_fefo() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00007");

        ProductVariant v = variantSku("S6B-LEG");
        ProductBatch early = mkBatch(v, "EARLY", plusDays(5), 10, new BigDecimal("7000"));
        ProductBatch later = mkBatch(v, "LATER", plusDays(30), 10, new BigDecimal("9000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        invoiceService.createInvoice(new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(v.getProduct().getId(), 3, null, v.getId(), null, null)), null));

        assertEquals(7, batchRepository.findById(early.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(later.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void rejects_mismatched_product_for_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00002");

        ProductVariant v1 = variantSku("S6B-MIS-P1");
        ProductVariant v2 = variantSku("S6B-MIS-P2");
        ProductBatch b = mkBatch(v1, "MISP", plusDays(20), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v1.getId());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v2.getProduct().getId(), 1, null, v1.getId(), null, b.getId())), null)));
        assertTrue(ex.getMessage().contains("không thuộc SP ID"));
    }

    @Test
    void rejects_mismatched_variant_for_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00003");

        ProductVariant v1 = variantSku("S6B-MIS-V1");
        ProductVariant v2 = variantSkuSameProduct("S6B-MIS-V2", v1.getProduct());
        ProductBatch b = mkBatch(v1, "MISV", plusDays(20), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v1.getId());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v1.getProduct().getId(), 1, null, v2.getId(), null, b.getId())), null)));
        assertTrue(ex.getMessage().contains("batchId"));
    }

    @Test
    void rejects_inactive_product_for_exact_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00008");

        ProductVariant v = variantSku("S6B-INA-P");
        ProductBatch b = mkBatch(v, "INA", plusDays(20), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        Product p = productRepository.findById(v.getProduct().getId()).orElseThrow();
        p.setActive(false);
        productRepository.save(p);

        assertThrows(IllegalArgumentException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 1, null, v.getId(), null, b.getId())), null)));
    }

    @Test
    void rejects_inactive_variant_for_exact_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00009");

        ProductVariant v = variantSku("S6B-INA-V");
        ProductBatch b = mkBatch(v, "INAV", plusDays(20), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        v.setActive(false);
        variantRepository.save(v);

        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 1, null, v.getId(), null, b.getId())), null)));
    }

    @Test
    void rejects_non_sellable_variant_on_exact_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00004");

        ProductVariant v = variantSkuNs("S6B-NS");
        ProductBatch b = mkBatch(v, "NSB", plusDays(20), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 1, null, v.getId(), null, b.getId())), null)));
    }

    @Test
    void rejects_expired_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00005");

        ProductVariant v = variantSku("S6B-EXP");
        ProductBatch b = mkBatch(v, "EXP", LocalDate.now(businessClock).minusDays(1), 5, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 1, null, v.getId(), null, b.getId())), null)));
    }

    @Test
    void rejects_inactive_batch_status() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00006");

        ProductVariant v = variantSku("S6B-ST");
        ProductBatch b = mkBatch(v, "BLK", plusDays(30), 5, new BigDecimal("8000"));
        b.setStatus(ProductBatch.STATUS_BLOCKED);
        batchRepository.save(b);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 1, null, v.getId(), null, b.getId())), null)));
    }

    @Test
    void rejects_insufficient_qty_in_exact_batch() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-S6B-00010");

        ProductVariant v = variantSku("S6B-QTY");
        ProductBatch b = mkBatch(v, "LOW", plusDays(30), 2, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(v.getId());

        assertThrows(IllegalStateException.class, () ->
                invoiceService.createInvoice(new SalesInvoiceRequest(
                        null, null, null, null,
                        List.of(new InvoiceItemRequest(v.getProduct().getId(), 5, null, v.getId(), null, b.getId())), null)));
    }

    private LocalDate plusDays(int days) {
        return LocalDate.now(businessClock).plusDays(days);
    }

    private ProductVariant variantSku(String sku) {
        Category category = new Category();
        category.setName("CAT-" + sku);
        category.setDescription("s6b");
        category.setActive(true);
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + sku);
        product.setName("Product " + sku);
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(sku);
        v.setVariantName("Variant " + sku);
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(new BigDecimal("15000"));
        v.setCostPrice(new BigDecimal("9000"));
        v.setStockQty(0);
        v.setMinStockQty(1);
        v.setActive(true);
        v.setIsDefault(true);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private ProductVariant variantSkuSameProduct(String sku, Product product) {
        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(sku);
        v.setVariantName("Variant " + sku);
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(new BigDecimal("15000"));
        v.setCostPrice(new BigDecimal("9000"));
        v.setStockQty(0);
        v.setMinStockQty(1);
        v.setActive(true);
        v.setIsDefault(false);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private ProductVariant variantSkuNs(String sku) {
        ProductVariant v = variantSku(sku);
        v.setIsSellable(false);
        return variantRepository.save(v);
    }

    private ProductBatch mkBatch(ProductVariant variant, String codeSuffix, LocalDate expiry, int qty, BigDecimal cost) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode(codeSuffix + "-" + variant.getVariantCode());
        batch.setExpiryDate(expiry);
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(cost);
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
            return new ObjectMapper();
        }
    }
}
