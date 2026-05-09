package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        "spring.flyway.validate-on-migrate=true",
        "jwt.secret=NullableFilterHotfixJwtSecretAtLeast32CharsLong!!",
        "casso.webhook-secure-token=nullable-filter-hotfix",
        "ghn.token=",
        "ghn.shop-id=",
})
class PostgresNullableFilterHotfixIntegrationTest {

    @Container
    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("nhadanshop_nullable_filter_hotfix");

    @DynamicPropertySource
    static void dataSourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
    }

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    RoleRepository roleRepository;
    @Autowired
    UserRepository userRepository;
    @Autowired
    PasswordEncoder passwordEncoder;

    private Role roleAdmin;

    @BeforeEach
    void seedRoles() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
    }

    private String adminToken() throws Exception {
        String username = "pg_hotfix_admin_" + UUID.randomUUID();
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode("Secret12!ab"));
        u.setFullName("PG Admin");
        u.setActive(true);
        u.getRoles().add(roleAdmin);
        userRepository.save(u);

        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"Secret12!ab\"}"))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
    }

    @Test
    void nullable_filter_endpoints_do_not_fail_with_postgres_bytea_upper() throws Exception {
        String token = adminToken();

        int pendingList = mockMvc.perform(get("/api/pending-orders")
                        .param("page", "0")
                        .param("size", "10")
                        .param("sort", "createdAt,desc")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int pendingCounts = mockMvc.perform(get("/api/pending-orders/counts")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int vouchers = mockMvc.perform(get("/api/vouchers")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "createdAt,desc")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int promotions = mockMvc.perform(get("/api/promotions")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "createdAt,desc")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int unmatched = mockMvc.perform(get("/api/payment-events/unmatched")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "txTime,desc")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();

        assertThat(pendingList).isEqualTo(200);
        assertThat(pendingCounts).isEqualTo(200);
        assertThat(vouchers).isEqualTo(200);
        assertThat(promotions).isEqualTo(200);
        assertThat(unmatched).isEqualTo(200);
    }

    @Test
    void nullable_filter_endpoints_accept_non_empty_search_and_filters() throws Exception {
        String token = adminToken();

        int pendingList = mockMvc.perform(get("/api/pending-orders")
                        .param("page", "0")
                        .param("size", "10")
                        .param("sort", "createdAt,desc")
                        .param("status", "pending_payment")
                        .param("paymentMethod", "bank_transfer")
                        .param("search", "DH-2026")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int pendingCounts = mockMvc.perform(get("/api/pending-orders/counts")
                        .param("paymentMethod", "bank_transfer")
                        .param("search", "DH-2026")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int vouchers = mockMvc.perform(get("/api/vouchers")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "createdAt,desc")
                        .param("status", "active")
                        .param("search", "KM")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int promotions = mockMvc.perform(get("/api/promotions")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "createdAt,desc")
                        .param("status", "inactive")
                        .param("type", "BUY_X_GET_Y")
                        .param("includeArchived", "true")
                        .param("search", "tang")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        int unmatched = mockMvc.perform(get("/api/payment-events/unmatched")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "txTime,desc")
                        .param("search", "DH-2026")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();

        assertThat(pendingList).isEqualTo(200);
        assertThat(pendingCounts).isEqualTo(200);
        assertThat(vouchers).isEqualTo(200);
        assertThat(promotions).isEqualTo(200);
        assertThat(unmatched).isEqualTo(200);
    }
}
