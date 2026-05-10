package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.service.ExcelImportService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 4C: Excel product import preview — prepared statement count should not scale ~linearly with N
 * when using prescan + bulk loads (distinct keys scale, not row loop lookups).
 */
@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase4c_prod_xls;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=phase4c-evidence",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase4cExcelProductImportQueryCountIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(Phase4cExcelProductImportQueryCountIntegrationTest.class);
    private static final String PREFIX = "P4C-" + System.nanoTime();

    @Autowired
    EntityManager entityManager;
    @Autowired
    CategoryRepository categoryRepository;
    @Autowired
    ExcelImportService excelImportService;

    private Statistics stats() {
        return HibernateStatementStatsHelper.statistics(entityManager);
    }

    private long measurePreparedStatements(Runnable action) {
        Statistics s = stats();
        s.clear();
        action.run();
        entityManager.flush();
        return HibernateStatementStatsHelper.prepareStatementCount(s);
    }

    @ParameterizedTest(name = "Excel product preview: N={0} rows, distinct codes")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 4C: previewProducts prepareStatement count bounded vs row count")
    void excel_product_preview_statementCount_bounded(int n) throws Exception {
        Category cat = new Category();
        cat.setName(PREFIX + "-CAT");
        cat.setActive(true);
        categoryRepository.save(cat);
        entityManager.flush();
        entityManager.clear();

        MockMultipartFile file = productImportWorkbook(n, cat.getName());
        long stmts = measurePreparedStatements(() -> {
            try {
                var preview = excelImportService.previewProducts(file);
                assertThat(preview.rows()).hasSize(n);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        });
        log.info("PHASE4C\texcel_product_preview\tN_rows={}\tprepareStatements={}", n, stmts);
        // Static pre-4C: ~5 prepared statements per data row (existsByCode, 2× variant, 2× category, exists name…).
        // Phase 4C: bulk IN + maps → bounded (allow headroom for Hibernate/H2).
        assertThat(stmts).isPositive().isLessThanOrEqualTo(25);
    }

    private static MockMultipartFile productImportWorkbook(int n, String categoryName) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet("Import");
            for (int i = 0; i < 3; i++) {
                sh.createRow(i);
            }
            for (int i = 0; i < n; i++) {
                Row r = sh.createRow(3 + i);
                r.createCell(0).setCellValue(PREFIX + "-ROW-" + i);
                r.createCell(1).setCellValue("Excel product " + i);
                r.createCell(2).setCellValue(categoryName);
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
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return new MockMultipartFile(
                    "file",
                    "phase4c-product-preview.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    bos.toByteArray());
        }
    }
}
