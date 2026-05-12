package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.Supplier;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SupplierRepository;
import com.example.nhadanshop.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Set;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slice B2.3 — entity list search is DB-owned (filter before pagination); smoke + auth for changed list APIs.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:b23_entity_search;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!"
})
class EntityListSearchB23MvcIntegrationTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    CustomerRepository customerRepository;
    @Autowired
    SupplierRepository supplierRepository;
    @Autowired
    InventoryReceiptRepository inventoryReceiptRepository;
    @Autowired
    RoleRepository roleRepository;
    @Autowired
    UserRepository userRepository;
    @Autowired
    PasswordEncoder passwordEncoder;

    @BeforeEach
    void seedRoles() {
        ensureRole("ROLE_ADMIN");
        ensureRole("ROLE_STAFF");
    }

    private void ensureRole(String name) {
        roleRepository.findByName(name).orElseGet(() -> {
            Role r = new Role();
            r.setName(name);
            r.setDescription(name);
            return roleRepository.save(r);
        });
    }

    @Test
    void customers_q_filters_before_pagination_and_group_param_combines() throws Exception {
        String tok = "SLICE_B23_CU_" + System.nanoTime();
        Customer a = new Customer();
        a.setCode("B23A-" + tok);
        a.setName("Alpha " + tok);
        a.setPhone("0900000001");
        a.setGroup(Customer.CustomerGroup.RETAIL);
        customerRepository.save(a);

        Customer b = new Customer();
        b.setCode("B23B-" + tok);
        b.setName("Beta VIP " + tok);
        b.setPhone("0900000002");
        b.setEmail(tok.toLowerCase() + "@ex.test");
        b.setGroup(Customer.CustomerGroup.VIP);
        customerRepository.save(b);

        mockMvc.perform(get("/api/customers")
                        .queryParam("q", tok)
                        .queryParam("page", "0")
                        .queryParam("size", "10")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/customers")
                        .queryParam("q", tok)
                        .queryParam("group", "vip")
                        .queryParam("page", "0")
                        .queryParam("size", "10")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].name").value("Beta VIP " + tok));

        mockMvc.perform(get("/api/customers")
                        .queryParam("q", "no_such_customer_" + tok)
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    void suppliers_q_paged_smoke() throws Exception {
        String tok = "SLICE_B23_SU_" + System.nanoTime();
        Supplier s = new Supplier();
        s.setCode("NCC-" + tok);
        s.setName("Supplier " + tok);
        s.setPhone("0911111111");
        s.setActive(true);
        supplierRepository.save(s);

        mockMvc.perform(get("/api/suppliers")
                        .queryParam("q", tok)
                        .queryParam("page", "0")
                        .queryParam("size", "5")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void admin_users_search_and_staff_forbidden() throws Exception {
        Role adminRole = roleRepository.findByName("ROLE_ADMIN").orElseThrow();
        User u = new User();
        u.setUsername("b23_findme_" + System.nanoTime());
        u.setPassword(passwordEncoder.encode("Secret12!ab"));
        u.setFullName("B23 Searchable Name");
        u.setActive(true);
        u.setCreatedAt(LocalDateTime.now());
        u.setUpdatedAt(LocalDateTime.now());
        u.setRoles(Set.of(adminRole));
        userRepository.save(u);

        mockMvc.perform(get("/api/admin/users")
                        .queryParam("search", "b23_findme_")
                        .queryParam("page", "0")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].username").value(u.getUsername()));

        mockMvc.perform(get("/api/admin/users").with(user("staff").roles("STAFF")))
                .andExpect(status().isForbidden());
    }

    @Test
    void stock_adjustments_search_no_match_returns_empty_page() throws Exception {
        mockMvc.perform(get("/api/stock-adjustments")
                        .queryParam("search", "no_such_adj_" + System.nanoTime())
                        .queryParam("page", "0")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void receipts_search_no_match_returns_empty_page() throws Exception {
        mockMvc.perform(get("/api/receipts")
                        .queryParam("search", "no_such_rcp_" + System.nanoTime())
                        .queryParam("page", "0")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void receipt_paging_42_receipts_content_lengths_20_20_2() throws Exception {
        String tok = "RCP-B23-" + System.nanoTime();
        LocalDateTime base = LocalDateTime.now().minusDays(1);
        for (int i = 0; i < 42; i++) {
            InventoryReceipt r = new InventoryReceipt();
            r.setReceiptNo(tok + "-" + String.format("%02d", i));
            r.setReceiptDate(base.plusMinutes(i));
            r.setSupplierName("Paging Supplier " + tok);
            r.setTotalAmount(new BigDecimal("1000"));
            r.setShippingFee(BigDecimal.ZERO);
            r.setTotalVat(BigDecimal.ZERO);
            inventoryReceiptRepository.save(r);
        }

        mockMvc.perform(get("/api/receipts")
                        .queryParam("search", tok)
                        .queryParam("page", "0")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(42))
                .andExpect(jsonPath("$.content.length()").value(20));
        mockMvc.perform(get("/api/receipts")
                        .queryParam("search", tok)
                        .queryParam("page", "1")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(42))
                .andExpect(jsonPath("$.content.length()").value(20));
        mockMvc.perform(get("/api/receipts")
                        .queryParam("search", tok)
                        .queryParam("page", "2")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(42))
                .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    void invoices_q_with_status_and_no_match() throws Exception {
        mockMvc.perform(get("/api/invoices")
                        .queryParam("q", "no_such_inv_" + System.nanoTime())
                        .queryParam("status", "active")
                        .queryParam("page", "0")
                        .queryParam("size", "20")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }
}
