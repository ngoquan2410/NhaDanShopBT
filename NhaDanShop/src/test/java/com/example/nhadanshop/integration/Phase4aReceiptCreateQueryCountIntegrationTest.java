package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.ReceiptItemRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.InventoryReceiptService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import jakarta.persistence.EntityManager;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 4A: {@link InventoryReceiptService#createReceipt} — Hibernate prepareStatement count vs line count.
 * Writes (batch insert / mutation) still scale with N; goal is bounded product/import-unit <strong>reads</strong>.
 */
@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase4a_cr;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=phase4a-create",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase4aReceiptCreateQueryCountIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(Phase4aReceiptCreateQueryCountIntegrationTest.class);
    private static final String PREFIX = "P4A-QC-" + System.nanoTime();

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
    InventoryReceiptService inventoryReceiptService;

    @BeforeEach
    void auth() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("phase4a-create-user", "x", List.of()));
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

    private ProductVariant seedSingleProductWithVariant(int runSalt) {
        Category cat = new Category();
        cat.setName(PREFIX + "-CAT-" + runSalt);
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode(PREFIX + "-P-" + runSalt);
        product.setName("Prod P4A");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + runSalt);
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setImportUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("10000"));
        variant.setCostPrice(new BigDecimal("5000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        return variantRepository.save(variant);
    }

    @ParameterizedTest(name = "createReceipt N_lines={0} (single product repeated)")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 4A: createReceipt prepareStatement count vs line count")
    void baseline_createReceipt_statementCount(int lineCount) {
        ProductVariant v = seedSingleProductWithVariant(lineCount);
        List<ReceiptItemRequest> lines = new ArrayList<>(lineCount);
        IntStream.range(0, lineCount).forEach(i -> lines.add(new ReceiptItemRequest(
                v.getProduct().getId(),
                1,
                new BigDecimal("5000"),
                BigDecimal.ZERO,
                null,
                null,
                null,
                "cai",
                1,
                v.getId(),
                null)));
        var req = new InventoryReceiptRequest(
                PREFIX + "-NCC",
                null,
                null,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                lines,
                List.of(),
                LocalDateTime.of(2026, 3, 1, 10, 0));

        flushClearResetStats();
        long stmts = measurePreparedStatements(() -> {
            var resp = inventoryReceiptService.createReceipt(req);
            assertThat(resp.items()).hasSize(lineCount);
        });
        log.info("PHASE4A\tcreateReceipt\tN_lines={}\tprepareStatements={}", lineCount, stmts);
        assertThat(stmts).isPositive();
    }
}
