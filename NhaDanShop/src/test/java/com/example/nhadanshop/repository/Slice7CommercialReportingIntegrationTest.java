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

import static org.junit.jupiter.api.Assertions.*;

/**
 * Slice 7: revenue/profit aggregates use persisted {@code lineNetRevenue} (fallback legacy gross line).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class Slice7CommercialReportingIntegrationTest {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;

    @Test
    void acceptance_85e_reports_use_persisted_line_net_revenue_and_line_profit() {
        LocalDateTime saleDay = LocalDateTime.of(2026, 6, 1, 10, 0);
        LocalDateTime from = saleDay.toLocalDate().atStartOfDay();
        LocalDateTime to = saleDay.toLocalDate().atTime(LocalTime.MAX);

        Category cat = new Category();
        cat.setName("CAT-S7");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-S7");
        product.setName("PS7");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("V-S7");
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("100000"));
        variant.setCostPrice(new BigDecimal("30000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo("INV-S7-01");
        inv.setInvoiceDate(saleDay);
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv.setTotalAmount(new BigDecimal("100000"));
        inv.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(1);
        line.setOriginalUnitPrice(new BigDecimal("100000"));
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(new BigDecimal("100000"));
        line.setUnitCostSnapshot(new BigDecimal("30000"));
        line.setLineNetRevenue(new BigDecimal("77000"));
        line.setCommercialAllocationVersion(1);
        inv.getItems().add(line);

        salesInvoiceRepository.save(inv);

        assertEquals(0, new BigDecimal("77000").compareTo(salesInvoiceRepository.sumLineNetRevenueBetween(from, to)));
        assertEquals(0, new BigDecimal("47000").compareTo(salesInvoiceRepository.sumProfitBetween(from, to)));

        List<Object[]> byP = salesInvoiceRepository.revenueByProduct(from, to);
        assertEquals(1, byP.size());
        assertEquals(0, ((BigDecimal) byP.get(0)[6]).compareTo(new BigDecimal("77000")));
        assertEquals(0, ((BigDecimal) byP.get(0)[9]).compareTo(new BigDecimal("47000")));

        List<Object[]> byCat = salesInvoiceRepository.revenueByCategory(from, to);
        assertEquals(1, byCat.size());
        assertEquals(0, ((BigDecimal) byCat.get(0)[2]).compareTo(new BigDecimal("77000")));

        List<Object[]> top = salesInvoiceRepository.topProducts(from, to, PageRequest.of(0, 5));
        assertEquals(1, top.size());
        assertEquals(0, ((BigDecimal) top.get(0)[9]).compareTo(new BigDecimal("77000")));
        assertEquals(0, ((BigDecimal) top.get(0)[10]).compareTo(new BigDecimal("47000")));
    }
}
