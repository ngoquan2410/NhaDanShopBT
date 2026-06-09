package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.InventoryReceiptItem;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import com.example.nhadanshop.config.TimeConfig;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * CRIT-007: fail-fast when computed or persisted stock signals corruption (no silent Math.max clamp).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({InventoryStockService.class, TimeConfig.class})
class Crit007FailFastStockIntegrationTest {

    @Autowired
    private InventoryStockService inventoryStockService;
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
    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private Clock businessClock;

    @Test
    void valuation_ignores_stale_or_negative_variant_stock_projection() {
        ProductVariant v = createSingleVariant("CRIT007-NEG-Persist");
        entityManager.createNativeQuery(
                        "UPDATE product_variants SET stock_qty = :sq WHERE id = :id")
                .setParameter("sq", -2)
                .setParameter("id", v.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        LocalDate from = LocalDate.of(2020, 1, 1);
        LocalDate to = LocalDate.of(2020, 1, 31);
        var row = inventoryStockService.getStockReport(from, to).rows().stream()
                .filter(r -> v.getId().equals(r.variantId()))
                .findFirst()
                .orElseThrow();

        assertEquals(0, row.openingStock());
        assertEquals(0, row.closingStock());
        assertEquals(0, row.closingStockValue().compareTo(BigDecimal.ZERO));
    }

    @Test
    void valuation_quantity_and_value_use_same_physical_batch_predicate() {
        ProductVariant v = createSingleVariant("CRIT007-VALUATION-PRED");
        LocalDate today = LocalDate.now(businessClock);
        persistBatch(v, "VALUABLE-A", today.plusDays(30), 10, new BigDecimal("100"), ProductBatch.STATUS_ACTIVE);
        persistBatch(v, "VALUABLE-BLOCKED", today.plusDays(20), 2, new BigDecimal("80"), ProductBatch.STATUS_BLOCKED);
        persistBatch(v, "EXPIRED", today.minusDays(1), 5, new BigDecimal("10"), ProductBatch.STATUS_ACTIVE);
        persistBatch(v, "VOIDED", today.plusDays(30), 99, BigDecimal.ONE, ProductBatch.STATUS_VOIDED);
        entityManager.createNativeQuery(
                        "UPDATE product_variants SET stock_qty = :sq WHERE id = :id")
                .setParameter("sq", 999)
                .setParameter("id", v.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        var row = inventoryStockService.getStockReport(today.withDayOfMonth(1), today).rows().stream()
                .filter(r -> v.getId().equals(r.variantId()))
                .findFirst()
                .orElseThrow();

        // Expired stock is not sellable, but it remains physical inventory until adjusted or voided.
        assertEquals(17, row.openingStock());
        assertEquals(17, row.closingStock());
        assertEquals(0, row.closingStockValue().setScale(0, RoundingMode.HALF_UP).compareTo(new BigDecimal("1210")));
    }

    /**
     * openingStock = 0 via balanced recv/sold-after-from, but period net (recv Ã¢Ë†â€™ sold) is negative Ã¢â€ â€™ closing &lt; 0.
     * Previously closing/opening were clamped to 0; now fail-fast.
     */
    @Test
    void crit007_stockReport_throwsWhenComputedClosingStockNegative() {
        ProductVariant v = createSingleVariant("CRIT007-NEG-Close");
        Product p = v.getProduct();

        LocalDateTime inJune = LocalDate.of(2020, 6, 15).atStartOfDay();
        LocalDateTime inJuly = LocalDate.of(2020, 7, 15).atStartOfDay();

        persistReceipt("RCP-CRIT007-A", inJune, p, v, 5);
        persistReceipt("RCP-CRIT007-B", inJuly, p, v, 5);
        persistInvoice("INV-CRIT007-A", inJune.plusHours(12), p, v, 10);

        LocalDate from = LocalDate.of(2020, 6, 1);
        LocalDate to = LocalDate.of(2020, 6, 30);

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> inventoryStockService.getStockReport(from, to));
        assertTrue(ex.getMessage().contains("openingStock"));
    }

    private ProductVariant createSingleVariant(String code) {
        Category cat = new Category();
        cat.setName("CAT-" + code);
        cat.setDescription("t");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-" + code);
        product.setName("Prod " + code);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(code);
        v.setVariantName("Var " + code);
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(BigDecimal.TEN);
        v.setCostPrice(BigDecimal.ONE);
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        return variantRepository.save(v);
    }

    private void persistBatch(ProductVariant variant, String suffix, LocalDate expiryDate, int qty, BigDecimal cost, String status) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("B-" + suffix + "-" + variant.getVariantCode());
        batch.setExpiryDate(expiryDate);
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(cost);
        batch.setStatus(status);
        batchRepository.save(batch);
    }

    private void persistReceipt(String receiptNo, LocalDateTime receiptDate, Product product, ProductVariant variant, int qty) {
        InventoryReceipt r = new InventoryReceipt();
        r.setReceiptNo(receiptNo);
        r.setReceiptDate(receiptDate);
        r.setTotalAmount(BigDecimal.ZERO);
        r = receiptRepository.save(r);

        InventoryReceiptItem item = new InventoryReceiptItem();
        item.setReceipt(r);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(qty);
        item.setUnitCost(BigDecimal.ONE);
        item.setDiscountPercent(BigDecimal.ZERO);
        item.setDiscountedCost(BigDecimal.ONE);
        item.setShippingAllocated(BigDecimal.ZERO);
        item.setVatPercent(BigDecimal.ZERO);
        item.setVatAllocated(BigDecimal.ZERO);
        item.setFinalCost(BigDecimal.ONE);
        item.setFinalCostWithVat(BigDecimal.ONE);
        item.setImportUnitUsed("cai");
        item.setPiecesUsed(1);
        item.setRetailQtyAdded(qty);
        r.getItems().add(item);
        receiptRepository.save(r);
    }

    private void persistInvoice(String invoiceNo, LocalDateTime invoiceDate, Product product, ProductVariant variant, int qty) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo(invoiceNo);
        inv.setInvoiceDate(invoiceDate);
        inv.setTotalAmount(BigDecimal.valueOf(100));
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv = salesInvoiceRepository.save(inv);

        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(qty);
        line.setOriginalUnitPrice(BigDecimal.TEN);
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(BigDecimal.TEN);
        line.setUnitCostSnapshot(BigDecimal.ONE);
        inv.getItems().add(line);
        salesInvoiceRepository.save(inv);
    }
}
