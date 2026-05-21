package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.dto.CategoryRevenueSeriesDto;
import com.example.nhadanshop.dto.RevenueTotalDto;
import com.example.nhadanshop.service.RevenueService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * CRIT-005: revenue aggregates use COMPLETED-only and net revenue (invoice discount + daily net).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({RevenueService.class, RevenueCanonicalQueryIntegrationTest.Cfg.class})
class RevenueCanonicalQueryIntegrationTest {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private RevenueService revenueService;
    @Autowired
    private EntityManager entityManager;

    @Test
    void completed_only_and_net_revenue_aligns_across_queries() {
        LocalDateTime saleDay = LocalDateTime.of(2026, 3, 10, 12, 0);
        LocalDateTime from = saleDay.toLocalDate().atStartOfDay();
        LocalDateTime to = saleDay.toLocalDate().atTime(LocalTime.MAX);

        Category cat = new Category();
        cat.setName("CAT-REV");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-REV-01");
        product.setName("Product Rev");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("SKU-REV-01");
        variant.setVariantName("V1");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("100"));
        variant.setCostPrice(new BigDecimal("40"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        // COMPLETED: gross line 100, invoice discount 10 → net 90
        SalesInvoice completed = new SalesInvoice();
        completed.setInvoiceNo("INV-REV-COMP-01");
        completed.setInvoiceDate(saleDay);
        completed.setStatus(SalesInvoice.Status.COMPLETED);
        completed.setTotalAmount(new BigDecimal("100"));
        completed.setDiscountAmount(new BigDecimal("10"));
        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(completed);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(1);
        line.setOriginalUnitPrice(new BigDecimal("100"));
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(new BigDecimal("100"));
        line.setUnitCostSnapshot(new BigDecimal("40"));
        completed.getItems().add(line);
        salesInvoiceRepository.save(completed);

        // CANCELLED: must not affect revenue
        SalesInvoice cancelled = new SalesInvoice();
        cancelled.setInvoiceNo("INV-REV-CAN-01");
        cancelled.setInvoiceDate(saleDay);
        cancelled.setStatus(SalesInvoice.Status.CANCELLED);
        cancelled.setTotalAmount(new BigDecimal("999"));
        cancelled.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem line2 = new SalesInvoiceItem();
        line2.setInvoice(cancelled);
        line2.setProduct(product);
        line2.setVariant(variant);
        line2.setQuantity(99);
        line2.setOriginalUnitPrice(BigDecimal.TEN);
        line2.setLineDiscountPercent(BigDecimal.ZERO);
        line2.setUnitPrice(BigDecimal.TEN);
        line2.setUnitCostSnapshot(BigDecimal.ONE);
        cancelled.getItems().add(line2);
        salesInvoiceRepository.save(cancelled);

        BigDecimal sumGross = salesInvoiceRepository.sumTotalAmountBetween(from, to);
        BigDecimal sumDisc = salesInvoiceRepository.sumDiscountAmountBetween(from, to);
        assertEquals(0, sumGross.compareTo(new BigDecimal("100")));
        assertEquals(0, sumDisc.compareTo(new BigDecimal("10")));

        List<Object[]> daily = salesInvoiceRepository.dailyRevenue(from, to);
        assertEquals(1, daily.size());
        BigDecimal dayNet = (BigDecimal) daily.getFirst()[1];
        assertEquals(0, dayNet.compareTo(new BigDecimal("90")));

        List<Object[]> byProduct = salesInvoiceRepository.revenueByProduct(from, to);
        assertEquals(1, byProduct.size());
        BigDecimal productGrossItemRevenue = (BigDecimal) byProduct.getFirst()[6];
        assertEquals(0, productGrossItemRevenue.compareTo(new BigDecimal("100")));

        List<Object[]> byCat = salesInvoiceRepository.revenueByCategory(from, to);
        assertEquals(1, byCat.size());
        BigDecimal catItemRevenue = (BigDecimal) byCat.getFirst()[2];
        assertEquals(0, catItemRevenue.compareTo(new BigDecimal("100")));

        List<Object[]> top = salesInvoiceRepository.topProducts(from, to, PageRequest.of(0, 10));
        assertEquals(1, top.size());
        BigDecimal topRev = (BigDecimal) top.getFirst()[9];
        BigDecimal topProfit = (BigDecimal) top.getFirst()[10];
        assertEquals(0, topRev.compareTo(new BigDecimal("100")));
        // Slice 7: product/category/top use COALESCE(lineNetRevenue, qty×unitPrice); profit = net − COGS
        assertEquals(0, topProfit.compareTo(new BigDecimal("60")));

        BigDecimal sumProfit = salesInvoiceRepository.sumProfitBetween(from, to);
        assertEquals(0, sumProfit.compareTo(new BigDecimal("60")));

        BigDecimal sumCost = salesInvoiceRepository.sumCostBetween(from, to);
        assertEquals(0, sumCost.compareTo(new BigDecimal("40")));

        long completedCount = salesInvoiceRepository.countByInvoiceDateBetweenAndStatus(
                from, to, SalesInvoice.Status.COMPLETED);
        assertEquals(1L, completedCount);
    }

    @Test
    void total_revenue_grouping_respects_selected_range_without_semantic_change() {
        Category cat = new Category();
        cat.setName("CAT-REV-GROUP");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-REV-GROUP");
        product.setName("Product Rev Group");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("SKU-REV-GROUP");
        variant.setVariantName("V1");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("100"));
        variant.setCostPrice(new BigDecimal("40"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        seedRevenueInvoice("INV-GROUP-BEFORE", LocalDate.of(2026, 4, 1).atTime(10, 0), product, variant, new BigDecimal("100"));
        seedRevenueInvoice("INV-GROUP-IN", LocalDate.of(2026, 4, 15).atTime(10, 0), product, variant, new BigDecimal("250"));
        seedRevenueInvoice("INV-GROUP-AFTER", LocalDate.of(2026, 5, 1).atTime(10, 0), product, variant, new BigDecimal("500"));

        LocalDate from = LocalDate.of(2026, 4, 10);
        LocalDate to = LocalDate.of(2026, 4, 20);
        for (String period : List.of("daily", "weekly", "monthly", "yearly")) {
            RevenueTotalDto grouped = revenueService.getTotalRevenue(from, to, period);
            assertEquals(0, new BigDecimal("250").compareTo(grouped.totalAmount()), period);
        }
    }

    @Test
    void invoice_item_category_snapshot_survives_product_category_change() {
        Category categoryA = new Category();
        categoryA.setName("Category A Snapshot");
        categoryA.setActive(true);
        categoryA = categoryRepository.save(categoryA);

        Category categoryB = new Category();
        categoryB.setName("Category B Current");
        categoryB.setActive(true);
        categoryB = categoryRepository.save(categoryB);

        Product product = new Product();
        product.setCode("P-CAT-SNAPSHOT");
        product.setName("Product Category Snapshot");
        product.setCategory(categoryA);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("SKU-CAT-SNAPSHOT");
        variant.setVariantName("V1");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("100"));
        variant.setCostPrice(new BigDecimal("40"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo("INV-CAT-SNAPSHOT");
        invoice.setInvoiceDate(LocalDate.of(2026, 4, 10).atTime(10, 0));
        invoice.setStatus(SalesInvoice.Status.COMPLETED);
        invoice.setTotalAmount(new BigDecimal("100"));
        invoice.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.captureCategorySnapshotFromProduct(product);
        item.setVariant(variant);
        item.setQuantity(1);
        item.setOriginalUnitPrice(new BigDecimal("100"));
        item.setLineDiscountPercent(BigDecimal.ZERO);
        item.setUnitPrice(new BigDecimal("100"));
        item.setUnitCostSnapshot(new BigDecimal("40"));
        item.setLineNetRevenue(new BigDecimal("100"));
        invoice.getItems().add(item);
        salesInvoiceRepository.save(invoice);

        product.setCategory(categoryB);
        productRepository.save(product);
        entityManager.flush();
        entityManager.clear();

        SalesInvoice reloaded = salesInvoiceRepository.findByInvoiceNo("INV-CAT-SNAPSHOT").orElseThrow();
        SalesInvoiceItem reloadedItem = reloaded.getItems().getFirst();
        assertEquals(categoryA.getId(), reloadedItem.getCategoryIdSnapshot());
        assertEquals("Category A Snapshot", reloadedItem.getCategoryNameSnapshot());
        assertEquals(categoryB.getId(), reloadedItem.getProduct().getCategory().getId());

        List<CategoryRevenueSeriesDto> series = revenueService.getRevenueByCategorySeries(
                LocalDate.of(2026, 4, 10), LocalDate.of(2026, 4, 10), "daily", null);
        assertEquals(1, series.size());
        assertEquals(categoryA.getId(), series.getFirst().categoryId());
        assertEquals("Category A Snapshot", series.getFirst().categoryName());
        assertEquals(0, new BigDecimal("100").compareTo(series.getFirst().revenue()));
    }

    @Test
    void category_series_groups_legacy_rows_without_snapshot_as_unknown() {
        Category cat = new Category();
        cat.setName("Current Category Not Historical");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-CAT-LEGACY");
        product.setName("Product Category Legacy");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("SKU-CAT-LEGACY");
        variant.setVariantName("V1");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("50"));
        variant.setCostPrice(BigDecimal.ZERO);
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        seedRevenueInvoice("INV-CAT-LEGACY", LocalDate.of(2026, 4, 11).atTime(10, 0), product, variant, new BigDecimal("50"));

        List<CategoryRevenueSeriesDto> series = revenueService.getRevenueByCategorySeries(
                LocalDate.of(2026, 4, 11), LocalDate.of(2026, 4, 11), "daily", null);

        assertEquals(1, series.size());
        assertEquals(-1L, series.getFirst().categoryId());
        assertEquals("Unknown/Legacy Category", series.getFirst().categoryName());
        assertEquals(0, new BigDecimal("50").compareTo(series.getFirst().revenue()));
    }

    @Test
    void category_series_default_returns_top_ten_plus_khac_from_snapshot_revenue() {
        LocalDate day = LocalDate.of(2026, 4, 12);
        for (int i = 1; i <= 11; i++) {
            Category cat = new Category();
            cat.setName("Series Category " + i);
            cat.setActive(true);
            cat = categoryRepository.save(cat);

            Product product = new Product();
            product.setCode("P-SERIES-" + i);
            product.setName("Product Series " + i);
            product.setCategory(cat);
            product.setActive(true);
            product.setProductType(Product.ProductType.SINGLE);
            product = productRepository.save(product);

            ProductVariant variant = new ProductVariant();
            variant.setProduct(product);
            variant.setVariantCode("SKU-SERIES-" + i);
            variant.setVariantName("V" + i);
            variant.setSellUnit("cai");
            variant.setPiecesPerUnit(1);
            variant.setSellPrice(BigDecimal.valueOf(i));
            variant.setCostPrice(BigDecimal.ZERO);
            variant.setStockQty(0);
            variant.setMinStockQty(0);
            variant.setActive(true);
            variant.setIsDefault(true);
            variant = variantRepository.save(variant);

            SalesInvoice invoice = new SalesInvoice();
            invoice.setInvoiceNo("INV-SERIES-" + i);
            invoice.setInvoiceDate(day.atTime(10, 0));
            invoice.setStatus(SalesInvoice.Status.COMPLETED);
            invoice.setTotalAmount(BigDecimal.valueOf(i));
            invoice.setDiscountAmount(BigDecimal.ZERO);
            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.captureCategorySnapshotFromProduct(product);
            item.setVariant(variant);
            item.setQuantity(1);
            item.setOriginalUnitPrice(BigDecimal.valueOf(i));
            item.setLineDiscountPercent(BigDecimal.ZERO);
            item.setUnitPrice(BigDecimal.valueOf(i));
            item.setUnitCostSnapshot(BigDecimal.ZERO);
            item.setLineNetRevenue(BigDecimal.valueOf(i));
            invoice.getItems().add(item);
            salesInvoiceRepository.save(invoice);
        }

        List<CategoryRevenueSeriesDto> series = revenueService.getRevenueByCategorySeries(day, day, "daily", null);

        assertEquals(11, series.size());
        assertEquals("Series Category 11", series.getFirst().categoryName());
        CategoryRevenueSeriesDto khac = series.getLast();
        assertEquals(-999L, khac.categoryId());
        assertEquals("Khác", khac.categoryName());
        assertEquals(0, BigDecimal.ONE.compareTo(khac.revenue()));
    }

    private void seedRevenueInvoice(String invoiceNo, LocalDateTime invoiceDate, Product product,
                                    ProductVariant variant, BigDecimal totalAmount) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(invoiceNo);
        invoice.setInvoiceDate(invoiceDate);
        invoice.setStatus(SalesInvoice.Status.COMPLETED);
        invoice.setTotalAmount(totalAmount);
        invoice.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(1);
        item.setOriginalUnitPrice(totalAmount);
        item.setLineDiscountPercent(BigDecimal.ZERO);
        item.setUnitPrice(totalAmount);
        item.setUnitCostSnapshot(BigDecimal.ZERO);
        invoice.getItems().add(item);
        salesInvoiceRepository.save(invoice);
    }

    @TestConfiguration
    static class Cfg {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-05-05T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }
    }
}
