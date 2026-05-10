package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.ReceiptItemRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.ExcelReceiptImportService;
import com.example.nhadanshop.service.InventoryReceiptService;
import com.example.nhadanshop.service.StockMutationService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phase 4 evidence-only: receipt create / void / delete invariants and Excel receipt preview query scaling.
 * Does not change production code paths.
 */
@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase4_rcp;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=phase4-evidence",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase4ReceiptExcelEvidenceIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(Phase4ReceiptExcelEvidenceIntegrationTest.class);
    private static final String PREFIX = "P4EV-" + System.nanoTime();

    private static final String MOVEMENT_GOODS_RECEIPT = "goods_receipt";
    private static final String MOVEMENT_GOODS_RECEIPT_VOID = "goods_receipt_void";

    @MockBean
    CustomerLoyaltyService customerLoyaltyService;

    @Autowired
    EntityManager entityManager;
    @Autowired
    CategoryRepository categoryRepository;
    @Autowired
    ProductRepository productRepository;
    @Autowired
    ProductVariantRepository variantRepository;
    @Autowired
    ProductBatchRepository productBatchRepository;
    @Autowired
    InventoryReceiptRepository inventoryReceiptRepository;
    @Autowired
    InventoryReceiptService inventoryReceiptService;
    @Autowired
    StockMutationService stockMutationService;
    @Autowired
    ExcelReceiptImportService excelReceiptImportService;

    @BeforeEach
    void auth() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("phase4-evidence-user", "x", List.of()));
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    private Statistics stats() {
        return HibernateStatementStatsHelper.statistics(entityManager);
    }

    private void flushClearResetStats() {
        entityManager.flush();
        entityManager.clear();
        stats().clear();
    }

    private long measurePreparedStatements(Runnable action) {
        Statistics s = stats();
        s.clear();
        action.run();
        entityManager.flush();
        return HibernateStatementStatsHelper.prepareStatementCount(s);
    }

    private Category mkCategory(String suffix) {
        Category cat = new Category();
        cat.setName(PREFIX + suffix);
        cat.setActive(true);
        return categoryRepository.save(cat);
    }

    private ProductVariant mkVariantBare(String suffix, Category cat) {
        Product product = new Product();
        product.setCode(PREFIX + "-P-" + suffix);
        product.setName("Prod " + suffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + suffix);
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("12000"));
        variant.setCostPrice(new BigDecimal("5000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        return variantRepository.save(variant);
    }

    private int sumRemainingAllBatchesForVariant(long variantId) {
        Number n = (Number) entityManager.createQuery(
                        "SELECT COALESCE(SUM(b.remainingQty), 0) FROM ProductBatch b WHERE b.variant.id = :vid")
                .setParameter("vid", variantId)
                .getSingleResult();
        return n.intValue();
    }

    private long countVoidMovementsForReceipt(long receiptId) {
        String like = "receipt:" + receiptId + ":%";
        return (long) entityManager.createQuery(
                        "SELECT COUNT(m) FROM InventoryMovement m WHERE m.sourceType = :t AND m.sourceId LIKE :p")
                .setParameter("t", MOVEMENT_GOODS_RECEIPT_VOID)
                .setParameter("p", like)
                .getSingleResult();
    }

    private long countInboundMovementsForReceipt(long receiptId) {
        String like = "receipt:" + receiptId + ":%";
        return (long) entityManager.createQuery(
                        "SELECT COUNT(m) FROM InventoryMovement m WHERE m.sourceType = :t AND m.sourceId LIKE :p")
                .setParameter("t", MOVEMENT_GOODS_RECEIPT)
                .setParameter("p", like)
                .getSingleResult();
    }

    @Test
    @DisplayName("Phase 4: createReceipt persists receipt, batch, movement, and stock projection")
    void createReceipt_success_dbEvidence() {
        Category cat = mkCategory("CAT-CR");
        ProductVariant v = mkVariantBare("CR1", cat);
        assertThat(v.getStockQty()).isZero();
        assertThat(sumRemainingAllBatchesForVariant(v.getId())).isZero();

        var item = new ReceiptItemRequest(
                v.getProduct().getId(),
                6,
                new BigDecimal("7000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                v.getId(),
                LocalDate.of(2030, 12, 31));
        var req = new InventoryReceiptRequest(
                PREFIX + "-NCC",
                null,
                "phase4-note",
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(item),
                List.of(),
                LocalDateTime.of(2026, 3, 10, 9, 0));

        var resp = inventoryReceiptService.createReceipt(req);
        entityManager.flush();
        entityManager.clear();

        InventoryReceipt r = inventoryReceiptRepository.findById(resp.id()).orElseThrow();
        assertThat(r.getStatus()).isEqualTo(InventoryReceipt.STATUS_CONFIRMED);

        List<ProductBatch> batches = productBatchRepository.findByReceiptIdOrderByExpiryDateAsc(r.getId());
        assertThat(batches).hasSize(1);
        ProductBatch b = batches.getFirst();
        assertThat(b.getImportQty()).isEqualTo(6);
        assertThat(b.getRemainingQty()).isEqualTo(6);

        ProductVariant v2 = variantRepository.findById(v.getId()).orElseThrow();
        assertThat(v2.getStockQty()).isEqualTo(6);
        assertThat(sumRemainingAllBatchesForVariant(v.getId())).isEqualTo(6);

        assertThat(countInboundMovementsForReceipt(r.getId())).isEqualTo(1);
        assertThat(countVoidMovementsForReceipt(r.getId())).isZero();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("Phase 4: createReceipt rolls back fully when Pass1 fails (no partial receipt)")
    void createReceipt_validationFail_noPartialPersist() {
        Category cat = mkCategory("CAT-ROLL");
        ProductVariant v = mkVariantBare("ROLL", cat);
        long receiptCountBefore = inventoryReceiptRepository.count();

        var good = new ReceiptItemRequest(
                v.getProduct().getId(),
                1,
                new BigDecimal("1000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                v.getId(),
                null);
        var bad = new ReceiptItemRequest(
                9_999_999_999L,
                1,
                new BigDecimal("1000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                null,
                null);
        var req = new InventoryReceiptRequest(
                PREFIX + "-NCC2",
                null,
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(good, bad),
                List.of(),
                LocalDateTime.of(2026, 3, 10, 9, 0));

        assertThatThrownBy(() -> inventoryReceiptService.createReceipt(req))
                .isInstanceOf(EntityNotFoundException.class);
        entityManager.clear();
        assertThat(inventoryReceiptRepository.count()).isEqualTo(receiptCountBefore);
    }

    @Test
    @DisplayName("Phase 4: voidReceipt zeros remaining, writes goods_receipt_void, duplicate void rejects")
    void voidReceipt_matrix_unconsumed_and_duplicate() {
        Category cat = mkCategory("CAT-VD");
        ProductVariant v = mkVariantBare("VD1", cat);
        var item = new ReceiptItemRequest(
                v.getProduct().getId(),
                4,
                new BigDecimal("3000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                v.getId(),
                null);
        var req = new InventoryReceiptRequest(
                PREFIX + "-VD-NCC",
                null,
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(item),
                List.of(),
                LocalDateTime.of(2026, 2, 1, 8, 0));
        var resp = inventoryReceiptService.createReceipt(req);
        long rid = resp.id();

        inventoryReceiptService.voidReceipt(rid, null);
        entityManager.flush();
        entityManager.clear();

        ProductBatch b = productBatchRepository.findByReceiptIdOrderByExpiryDateAsc(rid).getFirst();
        assertThat(b.getRemainingQty()).isZero();
        ProductVariant v2 = variantRepository.findById(v.getId()).orElseThrow();
        assertThat(v2.getStockQty()).isEqualTo(sumRemainingAllBatchesForVariant(v.getId()));
        assertThat(countVoidMovementsForReceipt(rid)).isEqualTo(1);

        assertThatThrownBy(() -> inventoryReceiptService.voidReceipt(rid, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("đã bị hủy");

        assertThat(countVoidMovementsForReceipt(rid)).isEqualTo(1);
    }

    @Test
    @DisplayName("Phase 4: voidReceipt with fully consumed batch is metadata-only (no goods_receipt_void rows)")
    void voidReceipt_fullyConsumed_metadataOnly() {
        Category cat = mkCategory("CAT-FC");
        ProductVariant v = mkVariantBare("FC1", cat);
        InventoryReceipt r = new InventoryReceipt();
        r.setReceiptNo(PREFIX + "-FC-R");
        r.setReceiptDate(LocalDateTime.of(2026, 1, 5, 10, 0));
        r.setTotalAmount(BigDecimal.ZERO);
        r.setShippingFee(BigDecimal.ZERO);
        r.setTotalVat(BigDecimal.ZERO);
        r.setStatus(InventoryReceipt.STATUS_CONFIRMED);
        r = inventoryReceiptRepository.save(r);

        ProductBatch b = new ProductBatch();
        b.setProduct(v.getProduct());
        b.setVariant(v);
        b.setReceipt(r);
        b.setBatchCode(PREFIX + "-FC-B");
        b.setExpiryDate(LocalDate.now().plusDays(20));
        b.setImportQty(10);
        b.setRemainingQty(0);
        b.setCostPrice(new BigDecimal("1000"));
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        productBatchRepository.save(b);
        stockMutationService.syncVariantStockWithBatches(v.getId());

        inventoryReceiptService.voidReceipt(r.getId(), null);
        entityManager.flush();
        entityManager.clear();

        InventoryReceipt r2 = inventoryReceiptRepository.findById(r.getId()).orElseThrow();
        assertThat(r2.getStatus()).isEqualTo(InventoryReceipt.STATUS_VOIDED);
        assertThat(countVoidMovementsForReceipt(r.getId())).isZero();
    }

    @Test
    @DisplayName("Phase 4: deleteReceipt rejects when receipt is voided")
    void deleteReceipt_rejects_when_voided() {
        Category cat = mkCategory("CAT-DV");
        ProductVariant v = mkVariantBare("DV1", cat);
        var item = new ReceiptItemRequest(
                v.getProduct().getId(),
                2,
                new BigDecimal("2000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                v.getId(),
                null);
        var req = new InventoryReceiptRequest(
                PREFIX + "-DV-NCC",
                null,
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(item),
                List.of(),
                LocalDateTime.of(2026, 2, 2, 8, 0));
        var resp = inventoryReceiptService.createReceipt(req);
        inventoryReceiptService.voidReceipt(resp.id(), null);

        assertThatThrownBy(() -> inventoryReceiptService.deleteReceipt(resp.id()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("void");
    }

    @ParameterizedTest(name = "Excel receipt preview: N={0} existing product rows")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 4: ExcelReceiptImportService.previewExcel statement count vs row count")
    void excel_receipt_preview_statementCount(int n) throws Exception {
        Category cat = mkCategory("CAT-XLS");
        ProductVariant[] variants = new ProductVariant[n];
        for (int i = 0; i < n; i++) {
            variants[i] = mkVariantBare("X" + i, cat);
        }
        MockMultipartFile file = receiptPreviewWorkbook(n, variants);
        flushClearResetStats();
        long stmts = measurePreparedStatements(() -> {
            try {
                var preview = excelReceiptImportService.previewExcel(file);
                assertThat(preview.rows()).hasSize(n);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        });
        log.info("PHASE4\texcel_receipt_preview\tN_rows={}\tprepareStatements={}", n, stmts);
        // Phase 4 evidence (pre-4B): ~3N+1 prepared statements (10→31, 50→151, 100→301).
        // Phase 4B prescan + bulk IN: bounded; fixture uses N distinct product/variant codes → still O(1) statements vs N.
        assertThat(stmts).isPositive().isLessThanOrEqualTo(15);
    }

    private static MockMultipartFile receiptPreviewWorkbook(int n, ProductVariant[] variants) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet("SP Don");
            for (int i = 0; i < 3; i++) {
                sh.createRow(i);
            }
            // Header so detectNewFormat() recognizes 13-col layout (variant in column B).
            Row hdr = sh.getRow(2);
            hdr.createCell(1).setCellValue("Variant code");
            for (int i = 0; i < n; i++) {
                ProductVariant v = variants[i];
                Row r = sh.createRow(3 + i);
                r.createCell(0).setCellValue(v.getProduct().getCode());
                r.createCell(1).setCellValue(v.getVariantCode());
                r.createCell(2).setCellValue("Excel row " + i);
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
                r.createCell(15).setCellValue("không");
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return new MockMultipartFile(
                    "file",
                    "phase4-rcp-preview.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    bos.toByteArray());
        }
    }
}
