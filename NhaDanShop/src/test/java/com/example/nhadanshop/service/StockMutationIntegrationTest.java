package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductVariantRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({StockMutationService.class, ProductBatchService.class, ProductVariantService.class, StockMutationIntegrationTest.TestConfig.class})
class StockMutationIntegrationTest {

    @Autowired
    private StockMutationService stockMutationService;
    @Autowired
    private ProductBatchService productBatchService;
    @Autowired
    private ProductVariantService productVariantService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private EntityManager entityManager;

    /**
     * CRIT-006: centralized invariant — drifted {@code stock_qty} must fail verify with audit path (exception message).
     */
    @Test
    void crit006_verifyVariantStockInvariant_throwsWhenStockQtyDriftsFromBatchSum() {
        ProductVariant variant = createVariant("SKU-CRIT006-A");
        createBatch(variant, "B-CRIT006-A", LocalDate.now().plusDays(40), 10, 10, new BigDecimal("8000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        entityManager.createNativeQuery(
                        "UPDATE product_variants SET stock_qty = :wrong WHERE id = :id")
                .setParameter("wrong", 1)
                .setParameter("id", variant.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> stockMutationService.verifyVariantStockInvariant(variant.getId()));
        assertTrue(ex.getMessage().contains("Invariant lỗi"));
        assertTrue(ex.getMessage().contains("sum(batch)=10"));
    }

    @Test
    void crit006_syncVariantStockWithBatches_repairsDriftThenVerifyPasses() {
        ProductVariant variant = createVariant("SKU-CRIT006-B");
        createBatch(variant, "B-CRIT006-B", LocalDate.now().plusDays(41), 7, 7, new BigDecimal("8100"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        entityManager.createNativeQuery(
                        "UPDATE product_variants SET stock_qty = :wrong WHERE id = :id")
                .setParameter("wrong", 99)
                .setParameter("id", variant.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        stockMutationService.syncVariantStockWithBatches(variant.getId());
        assertDoesNotThrow(() -> stockMutationService.verifyVariantStockInvariant(variant.getId()));
        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();
        assertEquals(7, reloaded.getStockQty());
    }

    @Test
    void case1_receipt_stock_matches_batch_sum() {
        ProductVariant variant = createVariant("SKU-RCPT-01");

        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("BATCH-RCPT-01");
        batch.setExpiryDate(LocalDate.now().plusDays(90));
        batch.setImportQty(20);
        batch.setRemainingQty(20);
        batch.setCostPrice(new BigDecimal("10000"));

        stockMutationService.updateStockWithBatches(
                variant.getId(),
                List.of(StockMutationService.BatchStockChange.create(batch)));

        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();
        assertEquals(20, reloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), reloaded.getStockQty());
    }

    @Test
    void case2_sell_deducts_batches_fefo_and_stock_synced() {
        ProductVariant variant = createVariant("SKU-FEFO-01");
        createBatch(variant, "BATCH-FEFO-1", LocalDate.now().plusDays(10), 5, 5, new BigDecimal("10000"));
        createBatch(variant, "BATCH-FEFO-2", LocalDate.now().plusDays(20), 10, 10, new BigDecimal("12000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        productBatchService.deductStockFEFOAndComputeCost(variant.getProduct().getId(), variant.getId(), 7);

        List<ProductBatch> batches = batchRepository.findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
                variant.getId(), -1);
        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();

        assertEquals(0, batches.get(0).getRemainingQty());
        assertEquals(8, batches.get(1).getRemainingQty());
        assertEquals(8, reloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), reloaded.getStockQty());
    }

    @Test
    void case3_cancel_restore_keeps_stock_batch_consistent() {
        ProductVariant variant = createVariant("SKU-CANCEL-01");
        createBatch(variant, "BATCH-CANCEL-1", LocalDate.now().plusDays(30), 10, 10, new BigDecimal("11000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        productBatchService.deductStockFEFOAndComputeCost(variant.getProduct().getId(), variant.getId(), 4);
        productBatchService.restoreStockOnCancel(variant.getProduct().getId(), variant.getId(), 4);

        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();
        assertEquals(10, reloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), reloaded.getStockQty());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void case4_concurrent_updates_no_drift() throws Exception {
        ProductVariant variant = createVariant("SKU-CONCUR-01");
        ProductBatch batch = createBatch(
                variant, "BATCH-CONCUR-1", LocalDate.now().plusDays(15), 100, 100, new BigDecimal("9000"));
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        int workers = 10;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch latch = new CountDownLatch(workers);
        for (int i = 0; i < workers; i++) {
            executor.submit(() -> {
                try {
                    stockMutationService.updateStockWithBatches(
                            variant.getId(),
                            List.of(StockMutationService.BatchStockChange.delta(batch.getId(), -1)));
                } finally {
                    latch.countDown();
                }
            });
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS));
        executor.shutdownNow();

        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();
        ProductBatch reloadedBatch = batchRepository.findById(batch.getId()).orElseThrow();
        assertEquals(90, reloadedBatch.getRemainingQty());
        assertEquals(90, reloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), reloaded.getStockQty());
    }

    /**
     * CRIT-004: concurrent "import-style" batch creates on one variant must not lose stock
     * (same entry point as Excel import after fix: {@link StockMutationService#updateStockWithBatches}).
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void case6_concurrent_new_batch_creates_same_variant_no_drift() throws Exception {
        ProductVariant variant = createVariant("SKU-CRIT004-01");
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        int workers = 8;
        int qtyEach = 3;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(workers);
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        try {
            for (int i = 0; i < workers; i++) {
                final int idx = i;
                executor.submit(() -> {
                    try {
                        start.await();
                        ProductBatch nb = new ProductBatch();
                        nb.setBatchCode("B-CRIT004-" + idx + "-" + System.nanoTime() + "-" + variant.getVariantCode());
                        nb.setExpiryDate(LocalDate.now().plusDays(25));
                        nb.setImportQty(qtyEach);
                        nb.setRemainingQty(qtyEach);
                        nb.setCostPrice(new BigDecimal("7000"));
                        stockMutationService.updateStockWithBatches(
                                variant.getId(),
                                List.of(StockMutationService.BatchStockChange.create(nb)));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(e);
                    } finally {
                        done.countDown();
                    }
                });
            }
            start.countDown();
            assertTrue(done.await(30, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }

        int expected = workers * qtyEach;
        ProductVariant reloaded = variantRepository.findById(variant.getId()).orElseThrow();
        assertEquals(expected, reloaded.getStockQty());
        assertEquals(batchRepository.sumRemainingQtyByVariantId(variant.getId()), reloaded.getStockQty());
        assertEquals(workers, batchRepository.findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
                variant.getId(), -1).size());
    }

    @Test
    void case5_manual_stock_overwrite_attempt_must_fail() {
        ProductVariant variant = createVariant("SKU-MANUAL-01");
        ProductVariantRequest req = new ProductVariantRequest(
                variant.getVariantCode(),
                variant.getVariantName(),
                variant.getSellUnit(),
                variant.getImportUnit(),
                variant.getPiecesPerUnit(),
                variant.getSellPrice(),
                variant.getCostPrice(),
                999,
                variant.getMinStockQty(),
                variant.getExpiryDays(),
                variant.getIsDefault(),
                variant.getImageUrl(),
                variant.getConversionNote(),
                null,
                null
        );

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> productVariantService.updateVariant(variant.getId(), req));
        assertTrue(ex.getMessage().contains("Không cho phép cập nhật trực tiếp stockQty"));
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
        batch.setBatchCode(batchCode);
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
    }
}
