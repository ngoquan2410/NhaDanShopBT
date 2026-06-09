package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({
        PendingOrderService.class,
        ProductVariantService.class,
        AccountService.class,
        CustomerService.class,
        Slice8CustomerBindingIntegrationTest.Cfg.class
})
class Slice8CustomerBindingIntegrationTest {
    @Autowired PendingOrderService pendingOrderService;
    @Autowired CustomerRepository customerRepository;
    @Autowired UserRepository userRepository;
    @Autowired SalesQuoteRepository salesQuoteRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ObjectMapper objectMapper;

    @MockBean InvoiceService invoiceService;
    @MockBean CustomerLoyaltyService customerLoyaltyService;
    @MockBean SalesInvoiceRepository salesInvoiceRepository;
    @MockBean PromotionRepository promotionRepository;
    @MockBean VoucherRepository voucherRepository;
    @MockBean ProductBatchRepository productBatchRepository;
    @MockBean SellableStockService sellableStockService;
    @MockBean StockedCatalogGuardService stockedCatalogGuardService;

    Product product;
    ProductVariant variant;
    Customer own;
    Customer other;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        own = customer("KH-OWN", "Own Customer");
        other = customer("KH-OTHER", "Other Customer");
        product = product();
        variant = variant(product);
        User user = new User();
        user.setUsername("user1");
        user.setPassword("encoded");
        user.setFullName("User One");
        user.setActive(true);
        user.setCustomer(own);
        userRepository.save(user);
        when(sellableStockService.salesSellableQtyByVariantId(anyLong(), any())).thenReturn(100);
    }

    @Test
    void anonymous_pending_order_with_customer_id_is_rejected() {
        String quoteId = quoteId();
        assertThatThrownBy(() -> pendingOrderService.createOrder(request(quoteId, String.valueOf(other.getId()))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("customerId");
    }

    @Test
    void anonymous_quote_backed_order_without_customer_id_still_works_and_is_unbound() {
        String quoteId = quoteId();
        PendingOrderResponse response = pendingOrderService.createOrder(request(quoteId, null));
        assertThat(response.customerId()).isNull();
    }

    @Test
    void role_user_cannot_bind_foreign_customer_but_auto_binds_or_accepts_own_customer() {
        login("user1", "ROLE_USER");

        assertThatThrownBy(() -> pendingOrderService.createOrder(request(quoteId(), String.valueOf(other.getId()))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("customerId");

        PendingOrderResponse omitted = pendingOrderService.createOrder(request(quoteId(), null));
        assertThat(omitted.customerId()).isEqualTo(String.valueOf(own.getId()));

        PendingOrderResponse explicitOwn = pendingOrderService.createOrder(request(quoteId(), String.valueOf(own.getId())));
        assertThat(explicitOwn.customerId()).isEqualTo(String.valueOf(own.getId()));
    }

    @Test
    void admin_can_bind_any_active_customer() {
        login("admin", "ROLE_ADMIN");
        PendingOrderResponse response = pendingOrderService.createOrder(request(quoteId(), String.valueOf(other.getId())));
        assertThat(response.customerId()).isEqualTo(String.valueOf(other.getId()));
    }

    private PendingOrderRequest request(String quoteId, String customerId) {
        return new PendingOrderRequest(customerId, "Guest", "0900000000", null, null,
                "cash_on_delivery", null, null, null, null, null, null, quoteId);
    }

    private String quoteId() {
        String publicId = UUID.randomUUID().toString();
        SalesQuotePayloadDto payload = SalesQuotePayloadDto.from(
                "storefront",
                new PricingBreakdownSnapshotDto(BigDecimal.valueOf(10000), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.valueOf(10000), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.valueOf(10000), BigDecimal.valueOf(10000), BigDecimal.ZERO, 1),
                null,
                null,
                new ShippingQuoteSnapshotDto("test", null, BigDecimal.ZERO, null),
                null,
                List.of(new SalesQuoteCapturedLineDto(product.getId(), variant.getId(), 1, BigDecimal.valueOf(10000),
                        BigDecimal.valueOf(10000), BigDecimal.ZERO, null, false, BigDecimal.valueOf(10000),
                        new CommercialLineSnapshotDto(BigDecimal.valueOf(10000), BigDecimal.ZERO, BigDecimal.valueOf(10000),
                                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                                BigDecimal.valueOf(10000), BigDecimal.valueOf(10000), BigDecimal.ZERO, 1))),
                List.of());
        SalesQuote q = new SalesQuote();
        q.setPublicId(publicId);
        q.setExpiresAt(LocalDateTime.now().plusHours(1));
        try {
            q.setPayloadJson(objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        salesQuoteRepository.save(q);
        return publicId;
    }

    private Customer customer(String code, String name) {
        Customer c = new Customer();
        c.setCode(code);
        c.setName(name);
        c.setActive(true);
        return customerRepository.save(c);
    }

    private Product product() {
        Category cat = new Category();
        cat.setName("Slice8 Binding Cat");
        cat = categoryRepository.save(cat);
        Product p = new Product();
        p.setCode("S8-BIND-P");
        p.setName("Slice8 Binding Product");
        p.setCategory(cat);
        return productRepository.save(p);
    }

    private ProductVariant variant(Product p) {
        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode("S8-BIND-V");
        v.setVariantName("Default");
        v.setSellPrice(BigDecimal.valueOf(10000));
        v.setCostPrice(BigDecimal.valueOf(5000));
        v.setSellUnit("cai");
        v.setStockQty(20);
        v.setIsDefault(true);
        v.setActive(true);
        v.setIsSellable(true);
        return variantRepository.save(v);
    }

    private void login(String username, String role) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(username, "n/a", List.of(new SimpleGrantedAuthority(role))));
    }

    @TestConfiguration
    static class Cfg {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().registerModule(new JavaTimeModule()); }
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-04-30T00:00:00Z"), ZoneId.of("UTC")); }
    }
}

