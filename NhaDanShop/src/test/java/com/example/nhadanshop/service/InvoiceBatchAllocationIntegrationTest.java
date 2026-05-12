package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.SalesInvoiceItemBatchAllocation;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.context.TestConfiguration;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * CRIT-002: persisted batch allocations on sell; cancel/delete restores exact batches/qty.
 */
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
        InvoiceBatchAllocationIntegrationTest.TestConfig.class
})
class InvoiceBatchAllocationIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @MockBean
    private CustomerLoyaltyService customerLoyaltyService;

    @MockBean
    private StockedCatalogGuardService stockedCatalogGuardService;

    @Autowired
    private InvoiceService invoiceService;
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

    @BeforeEach
    void setUpSecurity() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test-user", "n/a", List.of()));
    }

    @Test
    void cancel_restores_exact_batches_from_ledger_when_fefo_spans_multiple_lots() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-CRIT002-00001");

        ProductVariant variant = createVariantWithStock("SKU-LEDGER-01");
        ProductBatch batchEarly = createBatch(variant, "B-EARLY", LocalDate.now().plusDays(10), 5, 5, new BigDecimal("10000"));
        ProductBatch batchLater = createBatch(variant, "B-LATER", LocalDate.now().plusDays(30), 10, 10, new BigDecimal("12000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        int sellQty = 7;
        SalesInvoiceRequest req = new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(variant.getProduct().getId(), sellQty, null, null, null)), null);

        SalesInvoiceResponse created = invoiceService.createInvoice(req);
        assertEquals(0, batchRepository.findById(batchEarly.getId()).orElseThrow().getRemainingQty());
        assertEquals(8, batchRepository.findById(batchLater.getId()).orElseThrow().getRemainingQty());
        assertEquals(8, variantRepository.findById(variant.getId()).orElseThrow().getStockQty());

        SalesInvoice persisted = salesInvoiceRepository.findById(created.id()).orElseThrow();
        SalesInvoiceItem line = persisted.getItems().get(0);
        assertEquals(sellQty, line.getBatchAllocations().stream()
                .mapToInt(a -> a.getDeductedQty())
                .sum());

        Map<Long, Integer> expectedDeductions = Map.of(
                batchEarly.getId(), 5,
                batchLater.getId(), 2);
        Map<Long, Integer> actual = line.getBatchAllocations().stream()
                .collect(Collectors.toMap(
                        a -> a.getBatch().getId(),
                        SalesInvoiceItemBatchAllocation::getDeductedQty));
        assertEquals(expectedDeductions, actual);

        invoiceService.cancelInvoice(created.id(), "test cancel", "tester");

        assertEquals(5, batchRepository.findById(batchEarly.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(batchLater.getId()).orElseThrow().getRemainingQty());
        assertEquals(15, variantRepository.findById(variant.getId()).orElseThrow().getStockQty());
        assertTrue(salesInvoiceRepository.findById(created.id()).orElseThrow().isCancelled());
    }

    @Test
    void delete_completed_rejected_cancel_restores_ledger() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-CRIT002-00002");

        ProductVariant variant = createVariantWithStock("SKU-LEDGER-02");
        ProductBatch batch = createBatch(variant, "B-SINGLE", LocalDate.now().plusDays(20), 20, 20, new BigDecimal("9000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        SalesInvoiceRequest req = new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(variant.getProduct().getId(), 3, null, null, null)), null);

        SalesInvoiceResponse created = invoiceService.createInvoice(req);
        assertEquals(17, batchRepository.findById(batch.getId()).orElseThrow().getRemainingQty());

        assertThrows(IllegalStateException.class, () -> invoiceService.deleteInvoice(created.id()));

        assertEquals(17, batchRepository.findById(batch.getId()).orElseThrow().getRemainingQty());
        assertTrue(salesInvoiceRepository.findById(created.id()).isPresent());

        invoiceService.cancelInvoice(created.id(), "test cancel after delete reject", "tester");
        assertEquals(20, batchRepository.findById(batch.getId()).orElseThrow().getRemainingQty());
        assertEquals(20, variantRepository.findById(variant.getId()).orElseThrow().getStockQty());
        assertTrue(salesInvoiceRepository.findById(created.id()).orElseThrow().isCancelled());
    }

    private ProductVariant createVariantWithStock(String sku) {
        Category category = new Category();
        category.setName("CAT-" + sku);
        category.setDescription("test");
        category.setActive(true);
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + sku);
        product.setName("Product " + sku);
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(sku);
        variant.setVariantName("Variant " + sku);
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("15000"));
        variant.setCostPrice(new BigDecimal("10000"));
        variant.setStockQty(0);
        variant.setMinStockQty(1);
        variant.setActive(true);
        variant.setIsDefault(true);
        return variantRepository.save(variant);
    }

    private ProductBatch createBatch(
            ProductVariant variant,
            String batchCode,
            LocalDate expiryDate,
            int importQty,
            int remainingQty,
            BigDecimal costPrice
    ) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode(batchCode + "-" + variant.getVariantCode());
        batch.setExpiryDate(expiryDate);
        batch.setImportQty(importQty);
        batch.setRemainingQty(remainingQty);
        batch.setCostPrice(costPrice);
        return batchRepository.save(batch);
    }

    @TestConfiguration
    static class TestConfig {
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
