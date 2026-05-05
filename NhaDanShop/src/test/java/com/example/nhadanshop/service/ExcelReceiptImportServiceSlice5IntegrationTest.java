package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExcelPreviewResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Slice 5: Goods receipt Excel — cột P {@code isSellable}, preview, import, warnings (blank B + NVL).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        ExcelReceiptImportService.class,
        ProductService.class,
        ProductVariantService.class,
        StockedCatalogGuardService.class,
        StockMutationService.class,
        ProductComboService.class,
        ExcelReceiptImportServiceSlice5IntegrationTest.ClockTestConfig.class
})
class ExcelReceiptImportServiceSlice5IntegrationTest {

    @MockBean
    private InvoiceNumberGenerator invoiceNumberGenerator;

    @Autowired
    private ExcelReceiptImportService excelReceiptImportService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository productVariantRepository;
    @Autowired
    private ProductBatchRepository productBatchRepository;

    @BeforeEach
    void securityAndMocks() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test-admin", "x", List.of())
        );
        when(invoiceNumberGenerator.nextReceiptNo()).thenReturn("RCP-S5-00001");
    }

    @Test
    void previewExcel_falseSellableToken() throws Exception {
        MockMultipartFile file = receiptWorkbook("S5-RP-PV-1", "S5-RP-PV-1-G", true, "không");
        ExcelPreviewResponse preview = excelReceiptImportService.previewExcel(file);
        ExcelPreviewResponse.PreviewRow row = preview.rows().stream()
                .filter(r -> r.lineNumber() == 4)
                .findFirst()
                .orElseThrow();
        assertNotNull(row.isSellable());
        assertFalse(row.isSellable());
    }

    @Test
    void previewExcel_blankColumnP_defaultsToTrue() throws Exception {
        MockMultipartFile file = receiptWorkbookWithSellColF("S5-RP-DF-1", "S5-RP-DF-1-G", false, null, 90_000);
        ExcelPreviewResponse preview = excelReceiptImportService.previewExcel(file);
        ExcelPreviewResponse.PreviewRow row = preview.rows().stream()
                .filter(r -> r.lineNumber() == 4)
                .findFirst()
                .orElseThrow();
        assertEquals(Boolean.TRUE, row.isSellable());
    }

    @Test
    void previewExcel_invalidSellableToken_error() throws Exception {
        MockMultipartFile file = receiptWorkbook("S5-RP-IV-1", "S5-RP-IV-1-G", true, "___invalid_sellable___");
        ExcelPreviewResponse preview = excelReceiptImportService.previewExcel(file);
        ExcelPreviewResponse.PreviewRow row = preview.rows().stream()
                .filter(r -> r.lineNumber() == 4)
                .findFirst()
                .orElseThrow();
        assertNotNull(row.errorMessage());
    }

    @Test
    void importReceipt_newProduct_persistsIsSellableFalse_and_batchRemainingQty() throws Exception {
        String pcode = "S5-RP-NEW-1";
        String vcode = "S5-RP-NEW-1-G";
        MockMultipartFile file = newProductRowWorkbook(pcode, vcode, "raw");
        var result = excelReceiptImportService.importReceiptFromExcel(
                file, "NCC Slice5", null, "", BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDateTime.of(2025, 1, 10, 12, 0)
        );
        assertTrue(result.errors().isEmpty());
        ProductVariant v = productVariantRepository.findByVariantCodeIgnoreCase(vcode).orElseThrow();
        assertEquals(Boolean.FALSE, v.getIsSellable());
        List<ProductBatch> batches = productBatchRepository.findAll().stream()
                .filter(b -> b.getVariant() != null && b.getVariant().getId().equals(v.getId()))
                .toList();
        assertFalse(batches.isEmpty());
        assertEquals(1000, batches.get(0).getRemainingQty());
    }

    @Test
    void importReceipt_existingVariant_explicitFalse_doesNotOverwriteDbTrue() throws Exception {
        Category cat = new Category();
        cat.setName("Cat-S5-OW");
        cat.setDescription("d");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product p = new Product();
        p.setCode("S5-OW-1");
        p.setName("Existing S5");
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        p = productRepository.save(p);

        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode("S5-OW-1-G");
        v.setVariantName("Default g");
        v.setSellUnit("g");
        v.setImportUnit("kg");
        v.setPiecesPerUnit(1000);
        v.setSellPrice(new BigDecimal("1000"));
        v.setCostPrice(new BigDecimal("1"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setExpiryDays(30);
        v.setIsDefault(true);
        v.setActive(true);
        v.setIsSellable(true);
        v = productVariantRepository.save(v);

        MockMultipartFile file = receiptWorkbook("S5-OW-1", "S5-OW-1-G", true, "không");
        var result = excelReceiptImportService.importReceiptFromExcel(
                file, "NCC", null, "", BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDateTime.of(2025, 1, 10, 12, 0)
        );
        assertTrue(result.errors().isEmpty());
        ProductVariant reloaded = productVariantRepository.findById(v.getId()).orElseThrow();
        assertEquals(Boolean.TRUE, reloaded.getIsSellable());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("không tự cập nhật")
                || w.contains("Excel Bán hàng?") || w.contains("isSellable")));
    }

    @Test
    void importReceipt_newProduct_defaultSellable_zeroSellPrice_failsPass1() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("SP Don");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue("S5-RP-SZ-1");
        r.createCell(1).setCellValue("S5-RP-SZ-1-G");
        r.createCell(2).setCellValue("Thu SZ product");
        r.createCell(3).setCellValue(1);
        r.createCell(4).setCellValue(50_000);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(0);
        r.createCell(7).setCellValue("");
        r.createCell(8).setCellValue("Nguyên liệu");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue("kg");
        r.createCell(11).setCellValue("g");
        r.createCell(12).setCellValue(1000);
        r.createCell(14).setCellValue(30);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "slice5-rcp-sellzero.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray());
        ExcelReceiptImportService.ExcelImportValidationException ex = assertThrows(
                ExcelReceiptImportService.ExcelImportValidationException.class,
                () -> excelReceiptImportService.importReceiptFromExcel(
                        file, "NCC SZ", null, "", BigDecimal.ZERO, BigDecimal.ZERO,
                        LocalDateTime.of(2025, 1, 10, 12, 0)));
        assertTrue(ex.getValidationErrors().stream().anyMatch(m -> {
            String x = m.toLowerCase();
            return x.contains("gia ban") || x.contains("giá bán") || x.contains("sell");
        }));
    }

    @Test
    void previewExcel_blankVariantCode_nvL_showsDefaultVariantWarning() throws Exception {
        Category cat = new Category();
        cat.setName("Cat-S5-BL");
        cat.setDescription("d");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product p = new Product();
        p.setCode("S5-BLANK-1");
        p.setName("BlankB test");
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        p = productRepository.save(p);

        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode("S5-BLANK-1");
        v.setVariantName("Def");
        v.setSellUnit("g");
        v.setImportUnit("kg");
        v.setPiecesPerUnit(1000);
        v.setSellPrice(new BigDecimal("1"));
        v.setCostPrice(new BigDecimal("1"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setExpiryDays(30);
        v.setIsDefault(true);
        v.setActive(true);
        v.setIsSellable(true);
        productVariantRepository.save(v);

        MockMultipartFile file = receiptWorkbookVariantBlank("S5-BLANK-1", true, "nguyên liệu");
        ExcelPreviewResponse preview = excelReceiptImportService.previewExcel(file);
        ExcelPreviewResponse.PreviewRow row = preview.rows().stream()
                .filter(r -> "S5-BLANK-1".equalsIgnoreCase(r.productCode()))
                .findFirst()
                .orElseThrow();
        assertNotNull(row.warningMessage());
        assertTrue(row.warningMessage().contains("cột B (variantCode) trống")
                || row.warningMessage().contains("variant mặc định"));
    }

    /**
     * NEW product row: SP chưa tồn tại — sheet SP Don, đủ cột A–O, P = sellable token.
     */
    private static MockMultipartFile newProductRowWorkbook(String productCode, String variantCode, String colP) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("SP Don");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue(variantCode);
        r.createCell(2).setCellValue("Bánh tráng nguyên liệu");
        r.createCell(3).setCellValue(1);
        r.createCell(4).setCellValue(50_000);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(0);
        r.createCell(7).setCellValue("");
        r.createCell(8).setCellValue("Nguyên liệu");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue("kg");
        r.createCell(11).setCellValue("g");
        r.createCell(12).setCellValue(1000);
        r.createCell(14).setCellValue(30);
        r.createCell(15).setCellValue(colP);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-rcp-new.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    /** SP exists — B blank, D..P set; P = NVL. */
    private static MockMultipartFile receiptWorkbookVariantBlank(String productCode, boolean includeP, String colP) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("SP Don");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue("");
        r.createCell(2).setCellValue("Blank B");
        r.createCell(3).setCellValue(1);
        r.createCell(4).setCellValue(50_000);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(0);
        r.createCell(7).setCellValue("");
        r.createCell(8).setCellValue("Nguyên liệu");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue("kg");
        r.createCell(11).setCellValue("g");
        r.createCell(12).setCellValue(1000);
        r.createCell(14).setCellValue(30);
        if (includeP && colP != null) {
            r.createCell(15).setCellValue(colP);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-rcp-blankb.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    /** Giống receiptWorkbook nhưng cho phép đặt giá bán cột F. */
    private static MockMultipartFile receiptWorkbookWithSellColF(
            String productCode, String variantCode, boolean includeP, String colP, double sellColF) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("SP Don");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue(variantCode);
        r.createCell(2).setCellValue("Bánh tráng nguyên liệu");
        r.createCell(3).setCellValue(1);
        r.createCell(4).setCellValue(50_000);
        r.createCell(5).setCellValue(sellColF);
        r.createCell(6).setCellValue(0);
        r.createCell(7).setCellValue("");
        r.createCell(8).setCellValue("Nguyên liệu");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue("kg");
        r.createCell(11).setCellValue("g");
        r.createCell(12).setCellValue(1000);
        r.createCell(14).setCellValue(30);
        if (includeP && colP != null) {
            r.createCell(15).setCellValue(colP);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-receipt-sellf.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    private static MockMultipartFile receiptWorkbook(
            String productCode, String variantCode, boolean includeP, String colP) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("SP Don");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue(variantCode);
        r.createCell(2).setCellValue("Bánh tráng nguyên liệu");
        r.createCell(3).setCellValue(1);
        r.createCell(4).setCellValue(50_000);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(0);
        r.createCell(7).setCellValue("");
        r.createCell(8).setCellValue("Nguyên liệu");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue("kg");
        r.createCell(11).setCellValue("g");
        r.createCell(12).setCellValue(1000);
        r.createCell(14).setCellValue(30);
        if (includeP && colP != null) {
            r.createCell(15).setCellValue(colP);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-receipt.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    @TestConfiguration
    static class ClockTestConfig {
        @Bean
        Clock clock() {
            return Clock.fixed(Instant.parse("2025-01-15T10:00:00Z"), ZoneId.of("UTC"));
        }
    }
}
