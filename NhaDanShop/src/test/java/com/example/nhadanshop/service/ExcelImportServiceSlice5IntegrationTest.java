package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExcelImportResult;
import com.example.nhadanshop.dto.ProductExcelPreviewResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.time.Clock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Slice 5: Excel product import — {@code isSellable} cột N end-to-end (preview + import).
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        ExcelImportService.class,
        ProductService.class,
        ProductVariantService.class,
        StockedCatalogGuardService.class,
        ExcelImportServiceSlice5IntegrationTest.ClockTestConfig.class,
})
class ExcelImportServiceSlice5IntegrationTest {

    @Autowired
    private ExcelImportService excelImportService;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository productVariantRepository;

    @Test
    void previewProducts_falseSellableToken_inPreviewRow() throws Exception {
        String code = "S5-PR-01";
        MockMultipartFile file = productWorkbook(code, true, "nguyên liệu");
        ProductExcelPreviewResponse preview = excelImportService.previewProducts(file);
        assertTrue(preview.canImport());
        var row = preview.rows().stream()
                .filter(r -> code.equalsIgnoreCase(r.resolvedCode() != null ? r.resolvedCode() : r.code()))
                .findFirst()
                .orElseThrow();
        assertFalse(row.isSellable());
    }

    @Test
    void importProducts_persistsVariantWithIsSellableFalse() throws Exception {
        String code = "S5-IM-01";
        MockMultipartFile file = productWorkbook(code, true, "raw");
        ExcelImportResult result = excelImportService.importProducts(file);
        assertEquals(0, result.errorCount());
        assertTrue(result.successCount() >= 1);
        Product p = productRepository.findByCode(code).orElseThrow();
        ProductVariant v = productVariantRepository.findByVariantCodeIgnoreCase(code)
                .orElseThrow();
        assertEquals(p.getId(), v.getProduct().getId());
        assertEquals(Boolean.FALSE, v.getIsSellable());
    }

    @Test
    void previewProducts_missingColumnN_defaultsToTrue() throws Exception {
        String code = "S5-DF-01";
        MockMultipartFile file = productWorkbook(code, false, null);
        ProductExcelPreviewResponse preview = excelImportService.previewProducts(file);
        assertTrue(preview.canImport());
        var row = preview.rows().stream()
                .filter(r -> code.equalsIgnoreCase(r.resolvedCode() != null ? r.resolvedCode() : r.code()))
                .findFirst()
                .orElseThrow();
        assertTrue(row.isSellable());
    }

    @Test
    void previewProducts_invalidSellableToken_marksError() throws Exception {
        String code = "S5-IV-01";
        MockMultipartFile file = productWorkbook(code, true, "not_a_valid_sellable_token_zzz");
        ProductExcelPreviewResponse preview = excelImportService.previewProducts(file);
        assertFalse(preview.canImport());
        var row = preview.rows().stream()
                .filter(r -> code.equalsIgnoreCase(r.resolvedCode() != null ? r.resolvedCode() : r.code()))
                .findFirst()
                .orElseThrow();
        assertNotNull(row.errorMessage());
        assertTrue(row.errorMessage().contains("Cột N") || row.errorMessage().toLowerCase().contains("issellable")
                || row.errorMessage().contains("Bán hàng"));
    }

    @Test
    void previewProducts_saleable_missingColumnN_zeroSellPrice_errors() throws Exception {
        String code = "S5-ZSELL-01";
        MockMultipartFile file = productWorkbookPricing(code, false, null, 50_000, 0);
        ProductExcelPreviewResponse preview = excelImportService.previewProducts(file);
        assertFalse(preview.canImport());
        var row = preview.rows().stream()
                .filter(r -> code.equalsIgnoreCase(r.resolvedCode() != null ? r.resolvedCode() : r.code()))
                .findFirst()
                .orElseThrow();
        assertNotNull(row.errorMessage());
    }

    @Test
    void previewProducts_nonSellable_zeroPrices_ok() throws Exception {
        String code = "S5-ZNVL-01";
        MockMultipartFile file = productWorkbookPricing(code, true, "raw", 0, 0);
        ProductExcelPreviewResponse preview = excelImportService.previewProducts(file);
        assertTrue(preview.canImport());
        var row = preview.rows().stream()
                .filter(r -> code.equalsIgnoreCase(r.resolvedCode() != null ? r.resolvedCode() : r.code()))
                .findFirst()
                .orElseThrow();
        assertFalse(row.isSellable());
    }

    @Test
    void importProducts_nonSellable_zeroPrices_persisted() throws Exception {
        String code = "S5-ZNVL-02";
        MockMultipartFile file = productWorkbookPricing(code, true, "không", 0, 0);
        ExcelImportResult result = excelImportService.importProducts(file);
        assertEquals(0, result.errorCount());
        ProductVariant v = productVariantRepository.findByVariantCodeIgnoreCase(code).orElseThrow();
        assertEquals(Boolean.FALSE, v.getIsSellable());
        assertEquals(0, v.getSellPrice().compareTo(java.math.BigDecimal.ZERO));
        assertEquals(0, v.getCostPrice().compareTo(java.math.BigDecimal.ZERO));
    }

    private static MockMultipartFile productWorkbookPricing(String productCode, boolean includeColN, String colN,
                                                           double costD, double sellD) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("Import");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue("Bánh tráng nguyên liệu");
        r.createCell(2).setCellValue("Nguyên liệu");
        r.createCell(3).setCellValue(costD);
        r.createCell(4).setCellValue(sellD);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(30);
        r.createCell(7).setCellValue(true);
        r.createCell(8).setCellValue("kg");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue(1000);
        r.createCell(11).setCellValue("1kg=1000g");
        r.createCell(12).setCellValue(100);
        if (includeColN && colN != null) {
            r.createCell(13).setCellValue(colN);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-product-priced.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    /**
     * Data row 4 (0-based index 3), cột N (index 13) = optional isSellable.
     */
    private static MockMultipartFile productWorkbook(String productCode, boolean includeColN, String colN) throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sh = wb.createSheet("Import");
        for (int i = 0; i < 3; i++) {
            sh.createRow(i);
        }
        Row r = sh.createRow(3);
        r.createCell(0).setCellValue(productCode);
        r.createCell(1).setCellValue("Bánh tráng nguyên liệu");
        r.createCell(2).setCellValue("Nguyên liệu");
        r.createCell(3).setCellValue(50_000);
        r.createCell(4).setCellValue(1_000);
        r.createCell(5).setCellValue(0);
        r.createCell(6).setCellValue(30);
        r.createCell(7).setCellValue(true);
        r.createCell(8).setCellValue("kg");
        r.createCell(9).setCellValue("g");
        r.createCell(10).setCellValue(1000);
        r.createCell(11).setCellValue("1kg=1000g");
        r.createCell(12).setCellValue(100);
        if (includeColN && colN != null) {
            r.createCell(13).setCellValue(colN);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return new MockMultipartFile(
                "file",
                "slice5-product.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                bos.toByteArray()
        );
    }

    @TestConfiguration
    static class ClockTestConfig {
        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }
}
