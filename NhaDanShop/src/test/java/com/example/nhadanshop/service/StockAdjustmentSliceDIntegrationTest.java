package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.dto.StockAdjustmentReverseRequest;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.boot.test.context.TestConfiguration;
import com.example.nhadanshop.repository.InventoryMovementRepository;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Slice D — sourceBatchId enforcement for stock adjustments (admin).
 * Test data prefix: {@code SLICE_D_}
 */
@DataJpaTest(
        showSql = false,
        properties = {
                "spring.flyway.enabled=false",
                "spring.jpa.hibernate.ddl-auto=create-drop"
        }
)
@Import({
        StockMutationService.class,
        ProductComboService.class,
        StockAdjustmentService.class,
        StockAdjustmentSliceDIntegrationTest.TestConfig.class
})
class StockAdjustmentSliceDIntegrationTest {

    private static final String PREFIX = "SLICE_D_1730000000_";

    @MockBean
    private StockedCatalogGuardService stockedCatalogGuardService;

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
    @Autowired
    private InventoryMovementRepository inventoryMovementRepository;

    @BeforeEach
    void security() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("slice-d-user", "n/a", List.of()));
    }

    @Test
    void test1_exact_selected_batch_deducted() {
        ProductVariant v = createVariant(PREFIX + "V1");
        ProductBatch a = createBatch(
                v, PREFIX + "BA", LocalDate.now().plusDays(30), 10, 10, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        ProductBatch b = createBatch(
                v, PREFIX + "BB", LocalDate.now().plusDays(40), 20, 20, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        assertEquals(30, nz(variantRepository.findById(v.getId()).orElseThrow().getStockQty()));

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "DAMAGED",
                "slice d t1",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 27, a.getId(), "from A")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());

        assertEquals(7, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(20, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
        assertEquals(27, variantRepository.findById(v.getId()).orElseThrow().getStockQty());
        assertStockInvariant(v.getId());
    }

    @Test
    void test2_wrong_variant_batch_rejected_no_mutation() {
        ProductVariant vx = createVariant(PREFIX + "VX");
        ProductVariant vv = createVariant(PREFIX + "VV");
        ProductBatch bx = createBatch(
                vx, PREFIX + "BX", LocalDate.now().plusDays(10), 5, 5, new BigDecimal("9000"), ProductBatch.STATUS_ACTIVE);
        ProductBatch bv = createBatch(
                vv, PREFIX + "BV", LocalDate.now().plusDays(10), 8, 8, new BigDecimal("9000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(vx.getId());
        stockMutationService.syncVariantStockWithBatches(vv.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "DAMAGED",
                "wrong batch",
                List.of(new StockAdjustmentRequest.ItemRequest(vv.getId(), 6, bx.getId(), "x")));
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class, () -> stockAdjustmentService.create(req));
        assertTrue(ex.getMessage().contains("không thuộc variant"));
        assertEquals(5, batchRepository.findById(bx.getId()).orElseThrow().getRemainingQty());
        assertEquals(8, batchRepository.findById(bv.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void test3_insufficient_selected_batch_rejected() {
        ProductVariant v = createVariant(PREFIX + "V3");
        ProductBatch a = createBatch(
                v, PREFIX + "B3", LocalDate.now().plusDays(10), 1, 1, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        createBatch(
                v, PREFIX + "B3b", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "DAMAGED",
                "insufficient",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 6, a.getId(), "need 5 from batch A")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("không đủ tồn"));
        assertEquals(1, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void test4_reversal_restores_exact_batch() {
        ProductVariant v = createVariant(PREFIX + "V4");
        ProductBatch a = createBatch(
                v, PREFIX + "B4A", LocalDate.now().plusDays(10), 10, 10, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        createBatch(
                v, PREFIX + "B4B", LocalDate.now().plusDays(20), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "LOST",
                "rev",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 12, a.getId(), "take 3 from A")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(7, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());

        stockAdjustmentService.reverse(created.id(), new StockAdjustmentReverseRequest("undo slice d", null));
        assertEquals(10, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertStockInvariant(v.getId());
    }

    @Test
    void test5_unsourced_negative_stocktake_preserved() {
        ProductVariant v = createVariant(PREFIX + "V5");
        ProductBatch early = createBatch(
                v, PREFIX + "E5", LocalDate.now().plusDays(2), 4, 4, new BigDecimal("10000"), ProductBatch.STATUS_BLOCKED);
        ProductBatch late = createBatch(
                v, PREFIX + "L5", LocalDate.now().plusDays(30), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE",
                "unsourced",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 9, null, "fefo")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(0, batchRepository.findById(early.getId()).orElseThrow().getRemainingQty());
        assertEquals(9, batchRepository.findById(late.getId()).orElseThrow().getRemainingQty());
        assertStockInvariant(v.getId());
        assertEquals(0, inventoryMovementRepository.findAll().size());
    }

    @Test
    void test6_positive_with_sourceBatchId_rejected_at_create() {
        ProductVariant v = createVariant(PREFIX + "V6");
        ProductBatch a = createBatch(
                v, PREFIX + "B6", LocalDate.now().plusDays(10), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE",
                "bad",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 8, a.getId(), "+3")));
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class, () -> stockAdjustmentService.create(req));
        assertTrue(ex.getMessage().contains("sourceBatchId") || ex.getMessage().contains("tăng tồn"));
        assertEquals(5, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void damaged_without_source_rejected_when_adjustable_batches_exist() {
        ProductVariant v = createVariant(PREFIX + "V7");
        createBatch(
                v, PREFIX + "B7", LocalDate.now().plusDays(10), 6, 6, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "DAMAGED",
                "no source",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 3, null, "unsourced")));
        var created = stockAdjustmentService.create(req);
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("lô nguồn") || ex.getMessage().contains("nguồn"));
    }

    @Test
    void wrongReceipt_decrease_selected_batch_and_reversal_restores_it() {
        ProductVariant v = createVariant(PREFIX + "WRD");
        ProductBatch a = createBatch(v, PREFIX + "WRDA", LocalDate.now().plusDays(10), 20, 20, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        ProductBatch b = createBatch(v, PREFIX + "WRDB", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var created = stockAdjustmentService.create(new StockAdjustmentRequest(
                "WRONG_RECEIPT", "wrong receipt decrease",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 17, a.getId(), "A to 17"))));
        stockAdjustmentService.confirm(created.id());

        assertEquals(17, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
        assertStockInvariant(v.getId());

        stockAdjustmentService.reverse(created.id(), new StockAdjustmentReverseRequest("undo", null));
        assertEquals(20, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
        assertStockInvariant(v.getId());
    }

    @Test
    void wrongReceipt_increase_creates_new_batch_not_mutating_selected_batch_and_reversal_zeros_created_batch() {
        ProductVariant v = createVariant(PREFIX + "WRI");
        ProductBatch a = createBatch(v, PREFIX + "WRIA", LocalDate.now().plusDays(10), 20, 20, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        ProductBatch b = createBatch(v, PREFIX + "WRIB", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var created = stockAdjustmentService.create(new StockAdjustmentRequest(
                "WRONG_RECEIPT", "wrong receipt increase",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 23, a.getId(), "A context +3"))));
        stockAdjustmentService.confirm(created.id());

        ProductBatch createdBatch = batchRepository.findByBatchCode(created.adjNo() + "-" + v.getVariantCode()).orElseThrow();
        assertEquals(20, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
        assertEquals(3, createdBatch.getRemainingQty());
        assertStockInvariant(v.getId());

        stockAdjustmentService.reverse(created.id(), new StockAdjustmentReverseRequest("undo", null));
        assertEquals(20, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(0, batchRepository.findById(createdBatch.getId()).orElseThrow().getRemainingQty());
        assertStockInvariant(v.getId());
    }

    @Test
    void periodicStocktake_decrease_and_increase_are_batch_scoped() {
        ProductVariant v = createVariant(PREFIX + "PSD");
        ProductBatch a = createBatch(v, PREFIX + "PSDA", LocalDate.now().plusDays(10), 20, 20, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        ProductBatch b = createBatch(v, PREFIX + "PSDB", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        var dec = stockAdjustmentService.create(new StockAdjustmentRequest(
                "PERIODIC_STOCKTAKE", "periodic decrease",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 17, a.getId(), "A to 17"))));
        stockAdjustmentService.confirm(dec.id());
        assertEquals(17, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(10, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());

        var inc = stockAdjustmentService.create(new StockAdjustmentRequest(
                "PERIODIC_STOCKTAKE", "periodic increase",
                List.of(new StockAdjustmentRequest.ItemRequest(v.getId(), 20, a.getId(), "A context +3"))));
        stockAdjustmentService.confirm(inc.id());
        ProductBatch createdBatch = batchRepository.findByBatchCode(inc.adjNo() + "-" + v.getVariantCode()).orElseThrow();
        assertEquals(17, batchRepository.findById(a.getId()).orElseThrow().getRemainingQty());
        assertEquals(3, createdBatch.getRemainingQty());
        assertStockInvariant(v.getId());
    }

    @Test
    void batchScoped_reason_missing_batch_rejected_at_create() {
        ProductVariant v = createVariant(PREFIX + "MISS");
        createBatch(v, PREFIX + "MISSB", LocalDate.now().plusDays(10), 8, 8, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> stockAdjustmentService.create(
                new StockAdjustmentRequest("WRONG_RECEIPT", "missing", List.of(
                        new StockAdjustmentRequest.ItemRequest(v.getId(), 7, null, "missing batch")))));
        assertTrue(ex.getMessage().contains("lô điều chỉnh"));
    }

    private void assertStockInvariant(Long variantId) {
        int sum = batchRepository.sumRemainingQtyByVariantId(variantId);
        int stock = nz(variantRepository.findById(variantId).orElseThrow().getStockQty());
        assertEquals(sum, stock, "stockQty must equal sum(batch.remainingQty)");
    }

    private static int nz(Integer x) {
        return x == null ? 0 : x;
    }

    private ProductVariant createVariant(String code) {
        Category category = new Category();
        category.setName("CAT-" + code);
        category.setDescription("slice-d");
        category.setActive(true);
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + code);
        product.setName("P " + code);
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(code);
        variant.setVariantName("V " + code);
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("20000"));
        variant.setCostPrice(new BigDecimal("10000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        return variantRepository.save(variant);
    }

    private ProductBatch createBatch(
            ProductVariant variant,
            String codePrefix,
            LocalDate expiryDate,
            int importQty,
            int remainingQty,
            BigDecimal costPrice,
            String status) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode(codePrefix + "-" + System.nanoTime());
        batch.setExpiryDate(expiryDate);
        batch.setImportQty(importQty);
        batch.setRemainingQty(remainingQty);
        batch.setCostPrice(costPrice);
        batch.setStatus(status);
        return batchRepository.save(batch);
    }

    @TestConfiguration
    static class TestConfig {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-06-15T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }
    }
}
