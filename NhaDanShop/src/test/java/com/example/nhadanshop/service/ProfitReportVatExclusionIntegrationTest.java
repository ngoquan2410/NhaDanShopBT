package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProfitReportResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Slice 6C: profit report net revenue / profit exclude VAT stored in pricing snapshot JSON.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({ReportService.class, ProfitReportVatExclusionIntegrationTest.Cfg.class})
class ProfitReportVatExclusionIntegrationTest {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    private ReportService reportService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;

    @Test
    void profit_report_excludes_vat_from_net_revenue_and_profit() {
        LocalDate day = LocalDate.of(2026, 5, 5);
        LocalDateTime saleTime = day.atTime(12, 0);

        Category cat = new Category();
        cat.setName("CAT-VAT");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-VAT");
        product.setName("P");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("V-VAT");
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("100000"));
        variant.setCostPrice(new BigDecimal("40000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo("INV-VAT-S6C");
        inv.setInvoiceDate(saleTime);
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv.setTotalAmount(new BigDecimal("108000"));
        inv.setDiscountAmount(BigDecimal.ZERO);
        inv.setPricingBreakdownSnapshotJson(
                "{\"vatAmount\":8000,\"subtotal\":100000,\"shippingFee\":0,\"vatPercent\":8}");

        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(1);
        line.setUnitPrice(new BigDecimal("100000"));
        line.setUnitCostSnapshot(new BigDecimal("40000"));
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setRewardLine(false);
        inv.getItems().add(line);

        salesInvoiceRepository.save(inv);

        ProfitReportResponse r = reportService.getProfitReport(day, day);
        assertEquals(0, new BigDecimal("100000").compareTo(r.totalRevenue()));
        assertEquals(0, new BigDecimal("8000").compareTo(r.totalVatAmount()));
        assertEquals(0, new BigDecimal("40000").compareTo(r.totalCost()));
        assertEquals(0, new BigDecimal("60000").compareTo(r.totalProfit()));
    }

    @TestConfiguration
    static class Cfg {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-05-05T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }

        @Bean
        ObjectMapper objectMapper() {
            ObjectMapper m = new ObjectMapper();
            m.registerModule(new JavaTimeModule());
            m.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return m;
        }
    }
}
