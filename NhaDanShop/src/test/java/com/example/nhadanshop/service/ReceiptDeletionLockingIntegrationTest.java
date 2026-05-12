package com.example.nhadanshop.service;

import com.example.nhadanshop.exception.BusinessConflictException;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * CRIT-003: receipt delete uses pessimistic locks (receipt → variants → batches) so
 * “has sold?” and rollback are not interleaved with concurrent sales.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        InventoryReceiptService.class,
        ProductBatchService.class,
        StockMutationService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        StockedCatalogGuardService.class,
        ReceiptDeletionLockingIntegrationTest.TestConfig.class
})
class ReceiptDeletionLockingIntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @Autowired
    private InventoryReceiptService inventoryReceiptService;
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
    private InventoryReceiptRepository receiptRepository;

    @Test
    void deleteReceipt_rolls_back_stock_when_no_sales() {
        ProductVariant variant = createVariant("SKU-RDEL-01");
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo("RCP-TEST-RDEL-01");
        receipt.setReceiptDate(LocalDateTime.now(Clock.systemUTC()));
        receipt.setTotalAmount(BigDecimal.ZERO);
        receipt.setShippingFee(BigDecimal.ZERO);
        receipt.setTotalVat(BigDecimal.ZERO);
        receipt = receiptRepository.save(receipt);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setReceipt(receipt);
        batch.setBatchCode("BATCH-RDEL-01-" + variant.getVariantCode());
        batch.setExpiryDate(LocalDate.now().plusDays(60));
        batch.setImportQty(10);
        batch.setRemainingQty(10);
        batch.setCostPrice(new BigDecimal("5000"));
        batchRepository.save(batch);

        stockMutationService.syncVariantStockWithBatches(variant.getId());
        assertEquals(10, variantRepository.findById(variant.getId()).orElseThrow().getStockQty());

        inventoryReceiptService.deleteReceipt(receipt.getId());

        assertTrue(batchRepository.findByReceiptIdOrderByExpiryDateAsc(receipt.getId()).isEmpty());
        assertTrue(receiptRepository.findById(receipt.getId()).isEmpty());
        assertEquals(0, variantRepository.findById(variant.getId()).orElseThrow().getStockQty());
    }

    @Test
    void deleteReceipt_rejects_when_batch_partially_sold() {
        ProductVariant variant = createVariant("SKU-RDEL-02");
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo("RCP-TEST-RDEL-02");
        receipt.setReceiptDate(LocalDateTime.now(Clock.systemUTC()));
        receipt.setTotalAmount(BigDecimal.ZERO);
        receipt.setShippingFee(BigDecimal.ZERO);
        receipt.setTotalVat(BigDecimal.ZERO);
        receipt = receiptRepository.save(receipt);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setReceipt(receipt);
        batch.setBatchCode("BATCH-RDEL-02-" + variant.getVariantCode());
        batch.setExpiryDate(LocalDate.now().plusDays(60));
        batch.setImportQty(10);
        batch.setRemainingQty(7);
        batch.setCostPrice(new BigDecimal("5000"));
        batchRepository.save(batch);

        stockMutationService.syncVariantStockWithBatches(variant.getId());

        final Long receiptId = receipt.getId();
        assertThrows(BusinessConflictException.class, () -> inventoryReceiptService.deleteReceipt(receiptId));

        assertTrue(receiptRepository.findById(receiptId).isPresent());
        assertEquals(1, batchRepository.findByReceiptIdOrderByExpiryDateAsc(receiptId).size());
    }

    private ProductVariant createVariant(String sku) {
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
        variant.setSellPrice(new BigDecimal("12000"));
        variant.setCostPrice(new BigDecimal("5000"));
        variant.setStockQty(0);
        variant.setMinStockQty(1);
        variant.setActive(true);
        variant.setIsDefault(true);
        return variantRepository.save(variant);
    }

    @TestConfiguration
    static class TestConfig {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-04-14T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }
    }
}
