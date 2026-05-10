package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.CustomerRequest;
import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.SupplierRequest;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Product.ProductType;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Supplier;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.SupplierRepository;
import com.example.nhadanshop.service.CustomerService;
import com.example.nhadanshop.service.ProductComboService;
import com.example.nhadanshop.service.ProductService;
import com.example.nhadanshop.service.SupplierService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import jakarta.persistence.EntityManager;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 6: code generation uses MAX-suffix SQL (+ exists retry), not findAll / list-all scans.
 */
@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase6_codegen;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=phase6-codegen",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase6CodegenIntegrationTest {

    private static final String PREFIX = "P6CG-" + System.nanoTime();

    @Autowired
    EntityManager entityManager;
    @Autowired
    CustomerRepository customerRepository;
    @Autowired
    CustomerService customerService;
    @Autowired
    CategoryRepository categoryRepository;
    @Autowired
    ProductRepository productRepository;
    @Autowired
    ProductVariantRepository productVariantRepository;
    @Autowired
    ProductComboService productComboService;
    @Autowired
    ProductService productService;
    @Autowired
    SupplierRepository supplierRepository;
    @Autowired
    SupplierService supplierService;

    private Statistics stats() {
        return HibernateStatementStatsHelper.statistics(entityManager);
    }

    @Test
    @DisplayName("KH: KH001,KH002 → next KH003; gap KH001,KH003 → KH004; invalid KH00X ignored for MAX")
    void customer_autoCode_maxSuffix() {
        seedCustomer("KH001");
        seedCustomer("KH002");
        var r1 = customerService.create(new CustomerRequest(null, "A", null, null, null, null, null, true));
        assertThat(r1.code()).isEqualTo("KH003");

        customerRepository.deleteAll();
        entityManager.flush();

        seedCustomer("KH001");
        seedCustomer("KH003");
        seedCustomer("KH00X");
        var r2 = customerService.create(new CustomerRequest(null, "B", null, null, null, null, null, true));
        assertThat(r2.code()).isEqualTo("KH004");
    }

    @Test
    @DisplayName("COMBO: max suffix over all COMBO rows; inactive COMBO still raises MAX")
    void combo_autoCode_maxSuffix_includesInactive() {
        Category cat = seedCategory(PREFIX + "-cat-combo");
        Product component = seedSingleProduct(cat, PREFIX + "-comp", "COMP-" + PREFIX);

        Product inactiveCombo = new Product();
        inactiveCombo.setCode("COMBO010");
        inactiveCombo.setName("Old inactive");
        inactiveCombo.setCategory(cat);
        inactiveCombo.setActive(false);
        inactiveCombo.setProductType(ProductType.COMBO);
        inactiveCombo.setCreatedAt(LocalDateTime.now());
        inactiveCombo.setUpdatedAt(LocalDateTime.now());
        productRepository.save(inactiveCombo);

        var req = new ProductComboRequest(
                null,
                PREFIX + " combo new",
                null,
                BigDecimal.TEN,
                true,
                null,
                cat.getId(),
                List.of(new ProductComboRequest.ComboItemRequest(component.getId(), 1)));
        var created = productComboService.create(req);
        assertThat(created.code()).isEqualTo("COMBO011");
    }

    @Test
    @DisplayName("Product: category prefix + MAX suffix; many rows — bounded prepared statements for one generate")
    void product_autoCode_maxSuffix_andBoundedStatements() {
        Category cat = seedCategory(PREFIX + "-cat-prod");
        String pfx = ProductService.buildPrefix(cat.getName());
        for (int i = 1; i <= 40; i++) {
            Product p = new Product();
            p.setCode(pfx + String.format("%03d", i));
            p.setName("Row " + i);
            p.setCategory(cat);
            p.setActive(true);
            p.setProductType(ProductType.SINGLE);
            p.setCreatedAt(LocalDateTime.now());
            p.setUpdatedAt(LocalDateTime.now());
            productRepository.save(p);
        }
        entityManager.flush();
        entityManager.clear();

        Statistics s = stats();
        s.clear();
        String next = productService.generateProductCode(cat);
        entityManager.flush();
        assertThat(next).isEqualTo(pfx + "041");

        long stmts = HibernateStatementStatsHelper.prepareStatementCount(s);
        assertThat(stmts).isLessThanOrEqualTo(8);
    }

    @Test
    @DisplayName("NCC: gap NCC001,NCC003 → NCC004")
    void supplier_autoCode_maxSuffix() {
        SupplierRequest base = new SupplierRequest(null, "S1", null, null, null, null, null, true);
        assertThat(supplierService.create(base).code()).isEqualTo("NCC001");
        supplierRepository.deleteAll();
        entityManager.flush();

        seedSupplier("NCC001");
        seedSupplier("NCC003");
        assertThat(supplierService.create(new SupplierRequest(null, "S2", null, null, null, null, null, true)).code())
                .isEqualTo("NCC004");
    }

    private Category seedCategory(String name) {
        Category c = new Category();
        c.setName(name);
        c.setActive(true);
        return categoryRepository.save(c);
    }

    private void seedCustomer(String code) {
        Customer c = new Customer();
        c.setCode(code);
        c.setName("N-" + code);
        c.setActive(true);
        customerRepository.save(c);
    }

    private Product seedSingleProduct(Category cat, String name, String code) {
        Product p = new Product();
        p.setCode(code);
        p.setName(name);
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(ProductType.SINGLE);
        p.setCreatedAt(LocalDateTime.now());
        p.setUpdatedAt(LocalDateTime.now());
        p = productRepository.save(p);

        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode(code + "-V");
        v.setVariantName(name);
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(BigDecimal.ONE);
        v.setCostPrice(BigDecimal.ONE);
        v.setStockQty(10);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        v.setIsSellable(true);
        productVariantRepository.save(v);
        return p;
    }

    private void seedSupplier(String code) {
        Supplier s = new Supplier();
        s.setCode(code);
        s.setName("Sup-" + code);
        s.setActive(true);
        supplierRepository.save(s);
    }
}
