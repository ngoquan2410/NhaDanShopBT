package com.example.nhadanshop.service;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(ExcelTemplateService.class)
class ExcelTemplateServiceIntegrationTest {

    private static final DataFormatter FMT = new DataFormatter();

    @Autowired
    private ExcelTemplateService excelTemplateService;

    @Test
    void buildProductTemplate_row3IncludesSellableColumnN() throws Exception {
        byte[] bytes = excelTemplateService.buildProductTemplate();
        Sheet data = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(bytes))
                .getSheetAt(0);
        Row header = data.getRow(2);
        assertNotNull(header);
        String nHdr = FMT.formatCellValue(header.getCell(13)).toLowerCase();
        assertTrue(nHdr.contains("ban") || nHdr.contains("sell"), () -> "header N: " + nHdr);
    }

    @Test
    void buildReceiptTemplate_hasSellableColumnPHeader() throws Exception {
        byte[] bytes = excelTemplateService.buildReceiptTemplate();
        Sheet spDon = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(bytes))
                .getSheet("SP Don");
        assertNotNull(spDon);
        Row header = spDon.getRow(2);
        assertNotNull(header);
        Cell p = header.getCell(15);
        assertNotNull(p);
        String pHdr = FMT.formatCellValue(p).toLowerCase();
        assertTrue(pHdr.contains("ban") || pHdr.contains("sell"), () -> "header P: " + pHdr);
    }
}
