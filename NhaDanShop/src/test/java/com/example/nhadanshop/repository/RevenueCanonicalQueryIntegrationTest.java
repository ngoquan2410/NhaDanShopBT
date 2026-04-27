package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * CRIT-005: revenue aggregates use COMPLETED-only and net revenue (invoice discount + daily net).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class RevenueCanonicalQueryIntegrationTest {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;

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
        BigDecimal dayNet = (BigDecimal) daily.get(0)[1];
        assertEquals(0, dayNet.compareTo(new BigDecimal("90")));

        List<Object[]> byProduct = salesInvoiceRepository.revenueByProduct(from, to);
        assertEquals(1, byProduct.size());
        BigDecimal productNet = (BigDecimal) byProduct.get(0)[6];
        assertEquals(0, productNet.compareTo(new BigDecimal("90")));

        List<Object[]> byCat = salesInvoiceRepository.revenueByCategory(from, to);
        assertEquals(1, byCat.size());
        BigDecimal catNet = (BigDecimal) byCat.get(0)[2];
        assertEquals(0, catNet.compareTo(new BigDecimal("90")));

        List<Object[]> top = salesInvoiceRepository.topProducts(from, to, PageRequest.of(0, 10));
        assertEquals(1, top.size());
        BigDecimal topRev = (BigDecimal) top.get(0)[9];
        BigDecimal topProfit = (BigDecimal) top.get(0)[10];
        assertEquals(0, topRev.compareTo(new BigDecimal("90")));
        // 100 * 0.9 - 40 = 50 (net line revenue − COGS)
        assertEquals(0, topProfit.compareTo(new BigDecimal("50")));

        BigDecimal sumProfit = salesInvoiceRepository.sumProfitBetween(from, to);
        assertEquals(0, sumProfit.compareTo(new BigDecimal("50")));

        BigDecimal sumCost = salesInvoiceRepository.sumCostBetween(from, to);
        assertEquals(0, sumCost.compareTo(new BigDecimal("40")));

        long completedCount = salesInvoiceRepository.countByInvoiceDateBetweenAndStatus(
                from, to, SalesInvoice.Status.COMPLETED);
        assertEquals(1L, completedCount);
    }
}
