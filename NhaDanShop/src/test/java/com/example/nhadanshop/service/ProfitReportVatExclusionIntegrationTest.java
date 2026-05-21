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
import java.util.List;

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

    @Test
    void weekly_profit_bucket_clamps_to_selected_from_date() {
        Product product = createProductFixture("CLAMP-WEEK");
        ProductVariant variant = product.getVariants().getFirst();
        seedInvoice("INV-WEEK-BEFORE", LocalDate.of(2026, 1, 5).atTime(10, 0), product, variant,
                new BigDecimal("100000"), new BigDecimal("40000"));
        seedInvoice("INV-WEEK-IN", LocalDate.of(2026, 1, 7).atTime(10, 0), product, variant,
                new BigDecimal("200000"), new BigDecimal("80000"));

        List<ProfitReportResponse> rows = reportService.getWeeklyReport(
                LocalDate.of(2026, 1, 7), LocalDate.of(2026, 1, 11));

        assertEquals(1, rows.size());
        ProfitReportResponse first = rows.getFirst();
        assertEquals(LocalDate.of(2026, 1, 7), first.fromDate());
        assertEquals(LocalDate.of(2026, 1, 11), first.toDate());
        assertEquals(0, new BigDecimal("200000").compareTo(first.totalRevenue()));
        assertEquals(0, new BigDecimal("120000").compareTo(first.totalProfit()));
    }

    @Test
    void monthly_profit_bucket_clamps_to_selected_from_date() {
        Product product = createProductFixture("CLAMP-MONTH");
        ProductVariant variant = product.getVariants().getFirst();
        seedInvoice("INV-MONTH-BEFORE", LocalDate.of(2026, 2, 1).atTime(10, 0), product, variant,
                new BigDecimal("100000"), new BigDecimal("40000"));
        seedInvoice("INV-MONTH-IN", LocalDate.of(2026, 2, 15).atTime(10, 0), product, variant,
                new BigDecimal("300000"), new BigDecimal("120000"));

        List<ProfitReportResponse> rows = reportService.getMonthlyReport(
                LocalDate.of(2026, 2, 10), LocalDate.of(2026, 2, 28));

        assertEquals(1, rows.size());
        ProfitReportResponse first = rows.getFirst();
        assertEquals(LocalDate.of(2026, 2, 10), first.fromDate());
        assertEquals(LocalDate.of(2026, 2, 28), first.toDate());
        assertEquals(0, new BigDecimal("300000").compareTo(first.totalRevenue()));
        assertEquals(0, new BigDecimal("180000").compareTo(first.totalProfit()));
    }

    private Product createProductFixture(String suffix) {
        Category cat = new Category();
        cat.setName("CAT-" + suffix);
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("P-" + suffix);
        product.setName("Product " + suffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("V-" + suffix);
        variant.setVariantName("Variant " + suffix);
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
        product.getVariants().add(variant);
        return product;
    }

    private void seedInvoice(String invoiceNo, LocalDateTime invoiceDate, Product product, ProductVariant variant,
                             BigDecimal lineNetRevenue, BigDecimal lineCost) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo(invoiceNo);
        inv.setInvoiceDate(invoiceDate);
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv.setTotalAmount(lineNetRevenue);
        inv.setDiscountAmount(BigDecimal.ZERO);

        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(1);
        line.setUnitPrice(lineNetRevenue);
        line.setUnitCostSnapshot(lineCost);
        line.setLineNetRevenue(lineNetRevenue);
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setRewardLine(false);
        inv.getItems().add(line);

        salesInvoiceRepository.save(inv);
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
