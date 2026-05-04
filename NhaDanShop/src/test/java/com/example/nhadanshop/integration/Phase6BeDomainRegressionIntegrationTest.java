package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.RevenueService;
import com.example.nhadanshop.service.SalesQuoteService;
import com.example.nhadanshop.service.StockMutationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 6 consolidated BE/domain regression touches (beyond thin HTTP smoke): storefront quote snapshots,
 * COGS-ready invoice line persistence, empty revenue window semantics, production search/query path parity.
 *
 * Narrower-focused suites (Slice6/7/8, CRIT*, payment-event, loyalty DataJpa) retain depth; this class binds
 * the highest-risk storefront-to-revenue pillars in one runnable gate aligned with Critical Watchlist.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase6_domain;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token",
        "ghn.token=", "ghn.shop-id="
})
class Phase6BeDomainRegressionIntegrationTest {

    private static final String PREFIX = "P6DOM-" + System.nanoTime();

    @MockBean CustomerLoyaltyService customerLoyaltyService;

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired ProductBatchRepository productBatchRepository;
    @Autowired SalesInvoiceRepository salesInvoiceRepository;
    @Autowired StockMutationService stockMutationService;
    @Autowired RevenueService revenueService;
    @Autowired SalesQuoteService salesQuoteService;

    private Role roleAdmin;

    @BeforeEach
    void seedAdminRole() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
    }

    private User saveAdmin(String username, String pwd) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(pwd));
        u.setFullName("Admin");
        u.setActive(true);
        u.getRoles().add(roleAdmin);
        return userRepository.save(u);
    }

    private String loginAccess(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
    }

    private String uniq() {
        return Long.toUnsignedString(System.nanoTime());
    }

    @Test
    @DisplayName("Revenue total for an empty merchandise window aggregates to zero amounts")
    void revenue_total_empty_merchandise_window_is_financial_zero() {
        LocalDate today = LocalDate.of(2099, 1, 1);
        var dto = revenueService.getTotalRevenue(today, today, "daily");
        assertThat(dto.totalAmount()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.rows()).isNotEmpty();
        assertThat(dto.rows()).allMatch(r -> r.amount() == null
                || r.amount().stripTrailingZeros().equals(BigDecimal.ZERO.stripTrailingZeros()));
    }

    @Test
    @DisplayName("Storefront quote persists pricing breakdown snapshot FE relies on")
    void storefront_sales_quote_keeps_stable_snapshot_handles() throws Exception {
        Category cat = new Category();
        cat.setName(PREFIX + "-C-" + uniq());
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode(PREFIX + "-P-" + uniq());
        product.setName("Dom prod");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + uniq());
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("120000"));
        variant.setCostPrice(new BigDecimal("70000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(product);
        batch.setVariant(variant);
        batch.setBatchCode("B-" + PREFIX + uniq());
        batch.setExpiryDate(LocalDate.now().plusDays(60));
        batch.setImportQty(25);
        batch.setRemainingQty(25);
        batch.setCostPrice(new BigDecimal("70000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        batch = productBatchRepository.save(batch);
        stockMutationService.syncVariantStockWithBatches(variant.getId());

        ShippingAddressDto addr = new ShippingAddressDto(
                "A", "0909123456", "79", "HCM", "760", "Q1",
                "26734", "Xa", "1", null);

        var quote = salesQuoteService.quote(new SalesQuoteRequest(
                "storefront",
                null,
                List.of(new SalesQuoteLineRequest(
                        product.getId(), variant.getId(), 2, BigDecimal.ZERO, batch.getId(), false)),
                null,
                null,
                null,
                addr,
                null,
                BigDecimal.ZERO
        ));

        assertThat(quote.quoteId()).isNotBlank();
        assertThat(quote.pricingBreakdownSnapshot()).isNotNull();
        assertThat(quote.pricingBreakdownSnapshot().subtotal()).isNotNull();
        assertThat(quote.pricingBreakdownSnapshot().total()).isNotNull();
        assertThat(quote.lines()).isNotEmpty();
    }

    @Test
    @DisplayName("Commercial invoice lines round-trip allocation version + COGS snapshot columns")
    void invoice_lines_persist_commercial_allocation_and_unit_cost_snapshots() {
        Category cat = new Category();
        cat.setName(PREFIX + "-IC-" + uniq());
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode(PREFIX + "-IP-" + uniq());
        product.setName("Invoice prod");
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-IV-" + uniq());
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("50000"));
        variant.setCostPrice(new BigDecimal("30000"));
        variant.setStockQty(10);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo("INV-" + PREFIX + uniq());
        inv.setInvoiceDate(LocalDateTime.of(2026, 6, 1, 10, 0));
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv.setDiscountAmount(BigDecimal.ZERO);

        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(2);
        line.setOriginalUnitPrice(new BigDecimal("50000"));
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(new BigDecimal("50000"));
        line.setUnitCostSnapshot(new BigDecimal("30000"));
        line.setLineNetRevenue(new BigDecimal("91000"));
        line.setCommercialAllocationVersion(25);
        inv.getItems().add(line);

        SalesInvoice persisted = salesInvoiceRepository.save(inv);
        salesInvoiceRepository.flush();
        SalesInvoice reload = salesInvoiceRepository.findById(persisted.getId()).orElseThrow();

        SalesInvoiceItem reLine = reload.getItems().iterator().next();
        assertThat(reLine.getCommercialAllocationVersion()).isEqualTo(25);
        assertThat(reLine.getUnitCostSnapshot()).isEqualByComparingTo("30000");
        assertThat(reLine.getLineNetRevenue()).isEqualByComparingTo("91000");
    }

    @Test
    @DisplayName("Production orders list honours search query parameter without server errors (bytea-guard parity)")
    void production_orders_list_query_binding_ok() throws Exception {
        String u = PREFIX + "-POQ-" + uniq();
        saveAdmin(u, "Adminpwd1!");
        String tok = loginAccess(u, "Adminpwd1!");

        mockMvc.perform(get("/api/production-orders")
                        .param("page", "0")
                        .param("size", "10")
                        .param("sort", "createdAt,desc")
                        .param("query", "anything")
                        .header("Authorization", "Bearer " + tok))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/production-recipes")
                        .param("query", PREFIX)
                        .param("page", "0")
                        .param("size", "5")
                        .header("Authorization", "Bearer " + tok))
                .andExpect(status().isOk());
    }
}
