package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:account_order_detail_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class AccountOrderDetailMvcIntegrationTest {

    private static final String PREFIX = "ACCT-OD-" + System.nanoTime();

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired CustomerRepository customerRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired SalesInvoiceRepository salesInvoiceRepository;
    @Autowired PasswordEncoder passwordEncoder;

    private Role roleUser;

    @BeforeEach
    void seedRoles() {
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_USER");
            r.setDescription("Customer");
            return roleRepository.save(r);
        });
    }

    @Test
    void customer_can_read_own_completed_invoice_detail_with_items_totals_and_snapshots() throws Exception {
        User user = saveUserWithCustomer("own_completed", "Customer Completed", "0901000001");
        SalesInvoice invoice = saveInvoice(user.getCustomer(), SalesInvoice.Status.COMPLETED, "Completed Snapshot Item");
        String token = loginAccess(user.getUsername(), "Userpwd1!");

        mockMvc.perform(get("/api/account/orders/" + invoice.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(invoice.getId()))
                .andExpect(jsonPath("$.invoiceNo").value(invoice.getInvoiceNo()))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.totalAmount").value(120000))
                .andExpect(jsonPath("$.discountAmount").value(10000))
                .andExpect(jsonPath("$.finalAmount").value(110000))
                .andExpect(jsonPath("$.items[0].productName").value("Completed Snapshot Item"))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.shippingQuoteSnapshot.zoneCode").value("LOCAL_MO_CAY"))
                .andExpect(jsonPath("$.pricingBreakdownSnapshot.total").value(120000));
    }

    @Test
    void customer_can_read_own_cancelled_invoice_detail_read_only() throws Exception {
        User user = saveUserWithCustomer("own_cancelled", "Customer Cancelled", "0901000002");
        SalesInvoice invoice = saveInvoice(user.getCustomer(), SalesInvoice.Status.CANCELLED, "Cancelled Snapshot Item");
        String token = loginAccess(user.getUsername(), "Userpwd1!");

        mockMvc.perform(get("/api/account/orders/" + invoice.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(invoice.getId()))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("Customer requested cancellation"))
                .andExpect(jsonPath("$.items[0].productName").value("Cancelled Snapshot Item"))
                .andExpect(jsonPath("$.totalAmount").value(120000))
                .andExpect(jsonPath("$.pricingBreakdownSnapshot.total").value(120000));
    }

    @Test
    void customer_cannot_read_other_customer_invoice_detail() throws Exception {
        User owner = saveUserWithCustomer("owner", "Owner Customer", "0901000003");
        User other = saveUserWithCustomer("other", "Other Customer", "0901000004");
        SalesInvoice invoice = saveInvoice(owner.getCustomer(), SalesInvoice.Status.COMPLETED, "Private Snapshot Item");
        String token = loginAccess(other.getUsername(), "Userpwd1!");

        String body = mockMvc.perform(get("/api/account/orders/" + invoice.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(invoice.getInvoiceNo());
        assertThat(body).doesNotContain("Private Snapshot Item");
        assertThat(body).doesNotContain("totalAmount");
    }

    @Test
    void anonymous_cannot_read_account_order_detail() throws Exception {
        User owner = saveUserWithCustomer("anon_owner", "Anonymous Owner", "0901000005");
        SalesInvoice invoice = saveInvoice(owner.getCustomer(), SalesInvoice.Status.COMPLETED, "Anonymous Blocked Item");

        int status = mockMvc.perform(get("/api/account/orders/" + invoice.getId()))
                .andReturn().getResponse().getStatus();

        assertThat(status).isIn(401, 403);
    }

    private User saveUserWithCustomer(String usernameSuffix, String fullName, String phone) {
        Customer c = new Customer();
        c.setCode("KH-" + usernameSuffix + "-" + System.nanoTime());
        c.setName(fullName);
        c.setPhone(phone);
        c.setActive(true);
        c = customerRepository.save(c);

        User u = new User();
        u.setUsername(PREFIX + "_" + usernameSuffix);
        u.setPassword(passwordEncoder.encode("Userpwd1!"));
        u.setFullName(fullName);
        u.setActive(true);
        u.setCustomer(c);
        u.getRoles().add(roleUser);
        return userRepository.save(u);
    }

    private SalesInvoice saveInvoice(Customer customer, SalesInvoice.Status status, String productName) {
        Category category = new Category();
        category.setName("Account Detail Category " + System.nanoTime());
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + System.nanoTime());
        product.setName(productName);
        product.setCategory(category);
        product.setActive(true);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("V-" + System.nanoTime());
        variant.setVariantName(productName + " Variant");
        variant.setSellUnit("cai");
        variant.setSellPrice(new BigDecimal("60000"));
        variant.setCostPrice(new BigDecimal("30000"));
        variant.setStockQty(10);
        variant.setIsDefault(true);
        variant.setActive(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo("INV-ACCT-" + System.nanoTime());
        invoice.setInvoiceDate(LocalDateTime.of(2026, 5, 21, 10, 0));
        invoice.setCustomer(customer);
        invoice.setCustomerName(customer.getName());
        invoice.setCustomerPhone(customer.getPhone());
        invoice.setPaymentMethod("cash");
        invoice.setTotalAmount(new BigDecimal("120000"));
        invoice.setDiscountAmount(new BigDecimal("10000"));
        invoice.setVatPercent(BigDecimal.ZERO);
        invoice.setStatus(status);
        invoice.setShippingQuoteSnapshotJson("{\"source\":\"LOCAL\",\"zoneCode\":\"LOCAL_MO_CAY\",\"fee\":0,\"etaDays\":{\"min\":1,\"max\":2}}");
        invoice.setPricingBreakdownSnapshotJson("{\"subtotal\":120000,\"manualDiscount\":10000,\"promotionDiscount\":0,\"voucherDiscount\":0,\"shippingFee\":0,\"shippingDiscount\":0,\"vatBase\":110000,\"vatPercent\":0,\"vatAmount\":0,\"total\":120000,\"itemNetRevenue\":110000,\"shippingNetRevenue\":0,\"commercialAllocationVersion\":1,\"loyaltyDiscount\":0,\"loyaltyRedeemedPoints\":0}");
        if (status == SalesInvoice.Status.CANCELLED) {
            invoice.setCancelledAt(LocalDateTime.of(2026, 5, 21, 11, 0));
            invoice.setCancelledBy("admin");
            invoice.setCancelReason("Customer requested cancellation");
        }

        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(2);
        item.setOriginalUnitPrice(new BigDecimal("60000"));
        item.setLineDiscountPercent(BigDecimal.ZERO);
        item.setUnitPrice(new BigDecimal("60000"));
        item.setUnitCostSnapshot(new BigDecimal("30000"));
        item.captureCategorySnapshotFromProduct(product);
        invoice.getItems().add(item);

        return salesInvoiceRepository.save(invoice);
    }

    private String loginAccess(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode n = objectMapper.readTree(body);
        return n.get("accessToken").asText();
    }
}
