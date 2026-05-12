package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.StockAdjustmentItemBatchAllocationRepository;
import com.example.nhadanshop.repository.StockAdjustmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import com.example.nhadanshop.repository.InventoryMovementRepository;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Slice 5B / follow-up: unsourced negative uses {@link com.example.nhadanshop.repository.ProductBatchRepository#findCurrentAdjustableByVariantIdForUpdate};
 * explicit sourceBatch whitelist active|blocked only; inactive variant/product allowed for decreases only (create+confirm guard on increases).
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
        StockAdjustmentServiceSlice5bIntegrationTest.TestConfig.class
})
class StockAdjustmentServiceSlice5bIntegrationTest {

    /** Slice chỉ cover stock adjustment FEFO/guard tăng tồn — không assert stocked-catalog archive policy. */
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
    private StockAdjustmentItemBatchAllocationRepository allocationRepository;
    @Autowired
    private InventoryMovementRepository inventoryMovementRepository;
    @BeforeEach
    void security() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("slice5b-user", "n/a", List.of()));
    }

    @Test
    void unsourced_deducts_from_blocked_first_when_earlier_expiry_than_active() {
        ProductVariant v = createVariant("SKU-5B-BLK-EXP");
        ProductBatch earlierBlocked = createBatch(
                v, "B-5B-early-blk", LocalDate.now().plusDays(2), 4, 4, new BigDecimal("10000"), ProductBatch.STATUS_BLOCKED);
        ProductBatch laterActive = createBatch(
                v, "B-5B-late-act", LocalDate.now().plusDays(30), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        // total 14; reduce to 9 -> 4 from blocked (FEFO) + 1 from later active
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "5b", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 9, null, "unsourced")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(0, batchRepository.findById(earlierBlocked.getId()).orElseThrow().getRemainingQty());
        assertEquals(9, batchRepository.findById(laterActive.getId()).orElseThrow().getRemainingQty());
        assertEquals(0, inventoryMovementRepository.findAll().size());
    }

    @Test
    void unsourced_deducts_from_expired_active_before_future_active() {
        ProductVariant v = createVariant("SKU-5B-EXPIRED-FEFO");
        ProductBatch expired = createBatch(
                v, "B-5B-exp", LocalDate.now().minusDays(1), 6, 6, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        createBatch(
                v, "B-5B-fut", LocalDate.now().plusDays(40), 10, 10, new BigDecimal("11000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        // Unsourced FEFO is allowed for STOCKTAKE/OTHER; EXPIRED now requires explicit sourceBatchId when adjustable lots exist.
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "drain", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 12, null, "unsourced"))); // 16 -> 12, -4
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(2, batchRepository.findById(expired.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void unsourced_fails_when_only_archived_batches_have_stock() {
        ProductVariant v = createVariant("SKU-5B-ARCH-ONLY");
        ProductBatch archived = createBatch(
                v, "B-5B-arch", LocalDate.now().plusDays(30), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ARCHIVED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "arch only", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 2, null, "expect fail")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("điều chỉnh được") || ex.getMessage().contains("active/blocked"));
        assertEquals(5, batchRepository.findById(archived.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void create_and_confirm_allows_inactive_variant_unsourced_negative() {
        ProductVariant v = createVariant("SKU-5B-INACTIVE");
        v.setActive(false);
        v = variantRepository.save(v);
        createBatch(
                v, "B-5B-inact", LocalDate.now().plusDays(20), 8, 8, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "admin", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, null, "drain 8"))); // 8 -> 0
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(0, variantRepository.findById(v.getId()).orElseThrow().getStockQty());
    }

    @Test
    void explicit_source_rejects_voided_status() {
        ProductVariant v = createVariant("SKU-5B-SRC-VOID");
        ProductBatch b = createBatch(
                v, "B-5B-svoi", LocalDate.now().plusDays(10), 4, 4, new BigDecimal("10000"), ProductBatch.STATUS_VOIDED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, b.getId(), "voided lot")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("voided") || ex.getMessage().contains("'voided'"));
    }

    @Test
    void explicit_source_rejects_archived_status() {
        ProductVariant v = createVariant("SKU-5B-SRC-ARCH");
        ProductBatch b = createBatch(
                v, "B-5B-sarch", LocalDate.now().plusDays(10), 6, 6, new BigDecimal("10000"), ProductBatch.STATUS_ARCHIVED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 3, b.getId(), "explicit source")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("archived") || ex.getMessage().contains("status 'archived'"));
    }

    @Test
    void explicit_source_allows_blocked_with_enough_remaining() {
        ProductVariant v = createVariant("SKU-5B-SRC-BLK");
        ProductBatch b = createBatch(
                v, "B-5B-sblk", LocalDate.now().plusDays(10), 9, 9, new BigDecimal("10000"), ProductBatch.STATUS_BLOCKED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "ok", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 4, b.getId(), "take from blocked")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(4, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void explicit_source_allows_expired_active_batch() {
        ProductVariant v = createVariant("SKU-5B-SRC-EXP");
        ProductBatch b = createBatch(
                v, "B-5B-sexp", LocalDate.now().minusDays(2), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "EXPIRED", "destroy", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 2, b.getId(), "from expired lot")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertEquals(2, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
    }

    @Test
    void unsourced_insufficient_current_adjustable_even_when_snapshot_stock_higher() {
        // 10 active + 5 archived = 15 stock; snapshot 15. Reduce to 0 -> diff -15 but only 10 currentAdjustable
        ProductVariant v = createVariant("SKU-5B-MIX-ARCH");
        createBatch(
                v, "B-5B-act", LocalDate.now().plusDays(10), 10, 10, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        createBatch(
                v, "B-5B-arch2", LocalDate.now().plusDays(20), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ARCHIVED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "mismatch", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, null, "need 15 from adjustable, only 10")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("điều chỉnh được"));
    }

    @Test
    void create_rejects_positive_increase_when_variant_inactive() {
        ProductVariant v = createVariant("SKU-5B-POS-INACT-V");
        v.setActive(false);
        v = variantRepository.save(v);
        createBatch(
                v, "B-5B-piv", LocalDate.now().plusDays(10), 5, 5, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 8, null, "tăng tồn")));
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> stockAdjustmentService.create(req));
        assertTrue(ex.getMessage().contains("tăng tồn") || ex.getMessage().contains("ngừng kinh doanh"));
    }

    @Test
    void create_rejects_positive_increase_when_product_inactive() {
        ProductVariant v = createVariant("SKU-5B-POS-INACT-P");
        Product p = v.getProduct();
        p.setActive(false);
        productRepository.save(p);
        createBatch(
                v, "B-5B-pip", LocalDate.now().plusDays(10), 3, 3, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 6, null, "tăng")));
        assertThrows(IllegalStateException.class, () -> stockAdjustmentService.create(req));
    }

    @Test
    void confirm_rejects_positive_increase_if_variant_became_inactive_after_draft() {
        ProductVariant v = createVariant("SKU-5B-CONF-INACT");
        createBatch(
                v, "B-5B-cf", LocalDate.now().plusDays(10), 2, 2, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "STOCKTAKE", "inc", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 5, null, "+3")));
        var created = stockAdjustmentService.create(req);
        v.setActive(false);
        variantRepository.save(v);
        assertThrows(IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
    }

    @Test
    void explicit_source_rejects_depleted_status() {
        ProductVariant v = createVariant("SKU-5B-SRC-DEP");
        ProductBatch b = createBatch(
                v, "B-5B-sdep", LocalDate.now().plusDays(10), 2, 2, new BigDecimal("10000"), ProductBatch.STATUS_DEPLETED);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, b.getId(), "depleted lot")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("depleted") || ex.getMessage().contains("'depleted'"));
    }

    @Test
    void explicit_source_rejects_non_whitelisted_status() {
        ProductVariant v = createVariant("SKU-5B-SRC-BADST");
        ProductBatch b = createBatch(
                v, "B-5B-sbad", LocalDate.now().plusDays(10), 2, 2, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        b.setStatus("weird_status");
        b = batchRepository.save(b);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "nope", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, b.getId(), "bad st")));
        var created = stockAdjustmentService.create(req);
        IllegalStateException ex = assertThrows(
                IllegalStateException.class, () -> stockAdjustmentService.confirm(created.id()));
        assertTrue(ex.getMessage().contains("weird_status"));
    }

    @Test
    void confirm_writes_allocation_traces() {
        ProductVariant v = createVariant("SKU-5B-TRACE");
        createBatch(
                v, "B-5B-tr", LocalDate.now().plusDays(5), 4, 4, new BigDecimal("10000"), ProductBatch.STATUS_ACTIVE);
        stockMutationService.syncVariantStockWithBatches(v.getId());
        StockAdjustmentRequest req = new StockAdjustmentRequest(
                "OTHER", "t", List.of(
                new StockAdjustmentRequest.ItemRequest(v.getId(), 0, null, "trace")));
        var created = stockAdjustmentService.create(req);
        stockAdjustmentService.confirm(created.id());
        assertTrue(allocationRepository.count() > 0L);
    }

    private ProductVariant createVariant(String code) {
        Category category = new Category();
        category.setName("CAT-" + code);
        category.setDescription("5b");
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
