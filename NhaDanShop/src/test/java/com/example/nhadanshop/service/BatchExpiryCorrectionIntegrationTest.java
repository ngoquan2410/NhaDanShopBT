package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.dto.StockAdjustmentResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Coverage for wrong-batch-expiry correction flow:
 * - Guard blocks date edits when lot already touched (including cancelled-invoice case).
 * - sourceBatchId deduction drains only selected batch.
 * - Legacy FEFO behavior remains unchanged without sourceBatchId.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        InvoiceService.class,
        ProductBatchService.class,
        StockAdjustmentService.class,
        StockMutationService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        BatchExpiryCorrectionIntegrationTest.TestConfig.class
})
class BatchExpiryCorrectionIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @MockBean
    private CustomerLoyaltyService customerLoyaltyService;

    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private ProductBatchService productBatchService;
    @Autowired
    private StockAdjustmentService stockAdjustmentService;
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

    @BeforeEach
    void setUpSecurity() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test-user", "n/a", List.of()));
    }

    @Test
    void guard_blocks_when_batch_was_sold_then_invoice_cancelled() {
        when(invoiceNumberGenerator.nextInvoiceNo()).thenReturn("INV-GUARD-CANCEL-01");

        ProductVariant variant = createVariant("SKU-GUARD-CANCEL");
        ProductBatch batch = createBatch(variant, "B-GUARD-CANCEL", LocalDate.now().plusDays(50), 10, 10, new BigDecimal("10000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        SalesInvoiceRequest request = new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(variant.getProduct().getId(), 3, null, null, null)), null);
        SalesInvoiceResponse created = invoiceService.createInvoice(request);
        invoiceService.cancelInvoice(created.id(), "test cancel", "tester");

        ProductBatch reloaded = batchRepository.findById(batch.getId()).orElseThrow();
        assertEquals(10, reloaded.getImportQty());
        assertEquals(10, reloaded.getRemainingQty());

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> productBatchService.assertBatchDatesMutable(batch.getId()));
        assertTrue(ex.getMessage().contains("Không được sửa HSD/NSX"));
    }

    @Test
    void guard_blocks_when_import_qty_is_greater_than_remaining_qty() {
        ProductVariant variant = createVariant("SKU-GUARD-TOUCHED");
        ProductBatch touchedBatch = createBatch(
                variant, "B-GUARD-TOUCHED", LocalDate.now().plusDays(45), 10, 7, new BigDecimal("10000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> productBatchService.assertBatchDatesMutable(touchedBatch.getId()));
        assertTrue(ex.getMessage().contains("Không được sửa HSD/NSX"));
    }

    @Test
    void confirm_with_source_batch_id_deducts_only_target_batch() {
        ProductVariant variant = createVariant("SKU-ADJ-SOURCE");
        ProductBatch wrongBatch = createBatch(variant, "B-WRONG", LocalDate.now().plusDays(10), 6, 6, new BigDecimal("10000"));
        ProductBatch goodBatch = createBatch(variant, "B-GOOD", LocalDate.now().plusDays(40), 9, 9, new BigDecimal("10500"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER",
                "Sai HSD lô",
                List.of(new StockAdjustmentRequest.ItemRequest(
                        variant.getId(),
                        9, // system(15) - 6 from wrongBatch
                        wrongBatch.getId(),
                        "drain wrong batch only"))
        );
        StockAdjustmentResponse created = stockAdjustmentService.create(req);
        StockAdjustmentResponse confirmed = stockAdjustmentService.confirm(created.id());

        ProductBatch wrongReloaded = batchRepository.findById(wrongBatch.getId()).orElseThrow();
        ProductBatch goodReloaded = batchRepository.findById(goodBatch.getId()).orElseThrow();
        ProductVariant variantReloaded = variantRepository.findById(variant.getId()).orElseThrow();

        assertEquals(0, wrongReloaded.getRemainingQty());
        assertEquals(9, goodReloaded.getRemainingQty());
        assertEquals(9, variantReloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), variantReloaded.getStockQty());
        assertEquals(wrongBatch.getId(), confirmed.items().get(0).sourceBatchId());
    }

    @Test
    void confirm_without_source_batch_uses_current_adjustable_fefo_order_for_active_lots() {
        ProductVariant variant = createVariant("SKU-ADJ-FEFO");
        ProductBatch earlyBatch = createBatch(variant, "B-EARLY", LocalDate.now().plusDays(8), 5, 5, new BigDecimal("10000"));
        ProductBatch laterBatch = createBatch(variant, "B-LATER", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("10500"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER",
                "fefo default path",
                List.of(new StockAdjustmentRequest.ItemRequest(
                        variant.getId(),
                        8, // system(15) - 7; expected 5 from early + 2 from later
                        null,
                        "no source batch"))
        );
        StockAdjustmentResponse created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());

        ProductBatch earlyReloaded = batchRepository.findById(earlyBatch.getId()).orElseThrow();
        ProductBatch laterReloaded = batchRepository.findById(laterBatch.getId()).orElseThrow();
        ProductVariant variantReloaded = variantRepository.findById(variant.getId()).orElseThrow();

        assertEquals(0, earlyReloaded.getRemainingQty());
        assertEquals(8, laterReloaded.getRemainingQty());
        assertEquals(8, variantReloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), variantReloaded.getStockQty());
    }

    private ProductVariant createVariant(String code) {
        Category category = new Category();
        category.setName("CAT-" + code);
        category.setDescription("test");
        category.setActive(true);
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + code);
        product.setName("Product " + code);
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(code);
        variant.setVariantName("Variant " + code);
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
