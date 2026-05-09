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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 6 — consolidated security / FE-critical API regression for {@code /api/**} surface:
 * {@code permitAll} abuse boundaries (checkout/payment/shipping/webhook/VietQR), auth matrix, validation,
 * and Spring Page response shape smoke.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase6_sec_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase6SecurityApiMvcIntegrationTest {

    private static final String PREFIX = "P6SEC-" + System.nanoTime();

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
    private Role roleStaff;
    private Role roleUser;

    @BeforeEach
    void seedRoles() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_USER");
            r.setDescription("U");
            return roleRepository.save(r);
        });
        roleStaff = roleRepository.findByName("ROLE_STAFF").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_STAFF");
            r.setDescription("S");
            return roleRepository.save(r);
        });
    }

    private User saveUser(String username, Role primary) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode("Secret12!ab"));
        u.setFullName("T");
        u.setActive(true);
        u.getRoles().add(primary);
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

    @Test
    void signup_password_too_short_returns_validation_problem_detail() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"bad","fullName":"X"}
                                """.formatted("u_" + System.nanoTime())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").exists())
                .andExpect(jsonPath("$.fieldErrors.password").exists());
    }

    @Test
    void loyalty_settings_public_returns_fe_stable_shape() throws Exception {
        mockMvc.perform(get("/api/loyalty/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").isBoolean())
                .andExpect(jsonPath("$.earnMoneyAmount").exists())
                .andExpect(jsonPath("$.earnPoints").exists())
                .andExpect(jsonPath("$.redeemValuePerPoint").exists())
                .andExpect(jsonPath("$.minimumRedeemPoints").exists());
    }

    @Test
    void products_page_shape_and_categories_sort_param_accepted() throws Exception {
        mockMvc.perform(get("/api/products")
                        .param("page", "0")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").exists())
                .andExpect(jsonPath("$.pageable").exists());

        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void invoices_and_payment_events_require_auth_or_admin_role() throws Exception {
        int anonInvoices = mockMvc.perform(get("/api/invoices").param("page", "0").param("size", "10"))
                .andReturn().getResponse().getStatus();
        assertThat(anonInvoices == 401 || anonInvoices == 403).isTrue();

        String userName = PREFIX + "_u_" + UUID.randomUUID();
        saveUser(userName, roleUser);
        String userToken = loginAccess(userName, "Secret12!ab");

        mockMvc.perform(get("/api/invoices")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/payment-events/recent"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/payment-events/recent")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        String adminName = PREFIX + "_a_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        String adminTok = loginAccess(adminName, "Secret12!ab");
        mockMvc.perform(get("/api/payment-events/recent")
                        .header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void role_user_cannot_post_or_patch_sales_invoice_even_when_authenticated() throws Exception {
        String userName = PREFIX + "_no_inv_" + UUID.randomUUID();
        saveUser(userName, roleUser);
        String userToken = loginAccess(userName, "Secret12!ab");

        String body = "{\"customerName\":\"Khách lẻ\",\"customerId\":null,\"note\":null,\"promotionId\":null,"
                + "\"items\":null,\"quotePublicId\":\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\",\"paymentMethod\":\"cash\"}";

        mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/invoices/1/cancel")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"x\"}"))
                .andExpect(status().isForbidden());
    }


    @Test
    void pending_orders_staff_read_only_admin_mutation_public_create_flow() throws Exception {
        String adminName = PREFIX + "_poa_" + UUID.randomUUID();
        String staffName = PREFIX + "_pos_" + UUID.randomUUID();
        String userName = PREFIX + "_pou_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        saveUser(staffName, roleStaff);
        saveUser(userName, roleUser);
        String adminTok = loginAccess(adminName, "Secret12!ab");
        String staffTok = loginAccess(staffName, "Secret12!ab");
        String userTok = loginAccess(userName, "Secret12!ab");

        mockMvc.perform(get("/api/pending-orders").header("Authorization", "Bearer " + staffTok))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/pending-orders/counts").header("Authorization", "Bearer " + staffTok))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/pending-orders").header("Authorization", "Bearer " + userTok))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/pending-orders/counts").header("Authorization", "Bearer " + userTok))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/pending-orders").header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/sales/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source\":\"storefront\",\"lines\":[],\"shippingAddress\":{\"receiverName\":\"G\"" +
                                ",\"phone\":\"091\",\"provinceCode\":\"79\",\"provinceName\":\"HCM\"" +
                                ",\"districtCode\":\"760\",\"districtName\":\"Q1\"" +
                                ",\"wardCode\":\"26734\",\"wardName\":\"Ben Nghe\"" +
                                ",\"street\":\"1\",\"note\":null}}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/pending-orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/pending-orders/999/confirm")
                        .header("Authorization", "Bearer " + staffTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/pending-orders/999/cancel")
                        .header("Authorization", "Bearer " + staffTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        int adminConfirmStatus = mockMvc.perform(post("/api/pending-orders/999/confirm")
                        .header("Authorization", "Bearer " + adminTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andReturn().getResponse().getStatus();
        int adminCancelStatus = mockMvc.perform(post("/api/pending-orders/999/cancel")
                        .header("Authorization", "Bearer " + adminTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"x\"}"))
                .andReturn().getResponse().getStatus();
        assertThat(adminConfirmStatus).isNotEqualTo(403);
        assertThat(adminCancelStatus).isNotEqualTo(403);
    }

    @Test
    void vietqr_permit_all_does_not_allow_anonymous_preview_override_but_allows_generation_after_saved_settings()
            throws Exception {
        String overridePayload = """
                {"amount":100000,"transferContent":"PO-T","settingsOverride":{"shopName":"","qrEnabled":true,"vietQrBankCode":"VCB","bankName":"","accountNumber":"12345678","accountName":"ABC","branch":null,"transferPrefix":null,"qrTemplate":"compact2","momoQrImage":null,"momoAccountName":null,"momoPhone":null,"zalopayQrImage":null,"zalopayAccountName":null,"zalopayPhone":null}}
                """;
        mockMvc.perform(post("/api/vietqr/generate").contentType(MediaType.APPLICATION_JSON).content(overridePayload))
                .andExpect(status().isForbidden());

        String adminName = PREFIX + "_vqr_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        String adminTok = loginAccess(adminName, "Secret12!ab");

        mockMvc.perform(put("/api/store/payment-settings")
                        .header("Authorization", "Bearer " + adminTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"qrEnabled":true,"vietQrBankCode":"VCB","accountNumber":"999888","accountName":"Shop","bankName":"","branch":null,"transferPrefix":"","qrTemplate":"compact2","shopName":"","momoQrImage":null,"momoAccountName":null,"momoPhone":null,"zalopayQrImage":null,"zalopayAccountName":null,"zalopayPhone":null}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/vietqr/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":150000,\"transferContent\":\"INV-CHK\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").isString())
                .andExpect(jsonPath("$.imageUrl").value(containsString(".png")))
                .andExpect(jsonPath("$.accountNumber").value("999888"));

        mockMvc.perform(post("/api/vietqr/generate")
                        .with(user("svc").roles("ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":150000,"transferContent":"ADM-OVR-X","cacheKey":"k","settingsOverride":{"qrEnabled":true,"vietQrBankCode":"VCB","accountNumber":"991122334455","accountName":"Ov","bankName":"","branch":null,"transferPrefix":"","qrTemplate":"compact2","shopName":"","momoQrImage":null,"momoAccountName":null,"momoPhone":null,"zalopayQrImage":null,"zalopayAccountName":null,"zalopayPhone":null}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value("991122334455"));
    }

    @Test
    void casso_webhook_permit_all_still_requires_valid_secure_token_or_signature_config() throws Exception {
        mockMvc.perform(post("/api/webhooks/casso")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"data\":{\"reference\":\"r1\",\"amount\":\"1\"}}")
                        .header("secure-token", "wrong-token"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/webhooks/casso")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"error\":0,\"data\":{\"reference\":\"phase6-safe\",\"amount\":\"999\"}}")
                        .header("secure-token", "test-secure-token"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.received").exists());

        mockMvc.perform(post("/api/webhooks/casso")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"error\":0,\"data\":{\"reference\":\"phase6-safe\",\"amount\":\"999\"}}")
                        .header("secure-token", "test-secure-token"))
                .andExpect(status().isAccepted());
    }

    @Test
    void reports_inventory_requires_admin_even_when_authenticated() throws Exception {
        String userName = PREFIX + "_rep_" + UUID.randomUUID();
        saveUser(userName, roleUser);
        String userToken = loginAccess(userName, "Secret12!ab");

        mockMvc.perform(get("/api/reports/profit").param("from", "2026-01-01").param("to", "2026-01-31")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        String staffName = PREFIX + "_repst_" + UUID.randomUUID();
        saveUser(staffName, roleStaff);
        String staffToken = loginAccess(staffName, "Secret12!ab");
        mockMvc.perform(get("/api/reports/profit").param("from", "2026-01-01").param("to", "2026-01-31")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());

        String adminName = PREFIX + "_repa_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        mockMvc.perform(get("/api/reports/profit").param("from", "2026-01-01").param("to", "2026-01-31")
                        .header("Authorization", "Bearer " + loginAccess(adminName, "Secret12!ab")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalProfit").exists());
    }

    @Test
    void role_matrix_admin_staff_customer_for_pos_and_admin_management_endpoints() throws Exception {
        String adminName = PREFIX + "_rm_a_" + UUID.randomUUID();
        String staffName = PREFIX + "_rm_s_" + UUID.randomUUID();
        String customerName = PREFIX + "_rm_u_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        saveUser(staffName, roleStaff);
        saveUser(customerName, roleUser);
        String adminToken = loginAccess(adminName, "Secret12!ab");
        String staffToken = loginAccess(staffName, "Secret12!ab");
        String customerToken = loginAccess(customerName, "Secret12!ab");

        // ADMIN can access admin management APIs.
        mockMvc.perform(get("/api/promotions")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        // STAFF can access POS invoice read surface.
        mockMvc.perform(get("/api/invoices")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isOk());

        // STAFF cannot access report/promotion/inventory/production/payment-event management.
        mockMvc.perform(get("/api/promotions")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/inventory/projections")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/production-recipes")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/payment-events/recent")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());

        // CUSTOMER/ROLE_USER cannot access admin endpoints.
        mockMvc.perform(get("/api/promotions")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/vouchers")
                        .param("page", "0")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());

        // Public storefront APIs remain public.
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk());
    }

    @Test
    void vouchers_admin_surface_only_active_remains_public() throws Exception {
        String adminName = PREFIX + "_v_a_" + UUID.randomUUID();
        String staffName = PREFIX + "_v_s_" + UUID.randomUUID();
        String customerName = PREFIX + "_v_u_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        saveUser(staffName, roleStaff);
        saveUser(customerName, roleUser);
        String adminToken = loginAccess(adminName, "Secret12!ab");
        String staffToken = loginAccess(staffName, "Secret12!ab");
        String customerToken = loginAccess(customerName, "Secret12!ab");

        mockMvc.perform(get("/api/vouchers/active"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/vouchers/1").header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/vouchers/1").header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/vouchers").contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + staffToken)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/vouchers/1").contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + customerToken)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/vouchers/1/toggle").contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + staffToken)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/vouchers/1")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/vouchers/1").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void promotions_detail_requires_admin_public_endpoints_still_open() throws Exception {
        String adminName = PREFIX + "_p_a_" + UUID.randomUUID();
        String staffName = PREFIX + "_p_s_" + UUID.randomUUID();
        String customerName = PREFIX + "_p_u_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        saveUser(staffName, roleStaff);
        saveUser(customerName, roleUser);
        String adminToken = loginAccess(adminName, "Secret12!ab");
        String staffToken = loginAccess(staffName, "Secret12!ab");
        String customerToken = loginAccess(customerName, "Secret12!ab");

        mockMvc.perform(get("/api/promotions/active"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/promotions/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/promotions/pick-best")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[]}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/promotions/1").header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/promotions/1").header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/promotions/1").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void products_admin_get_surface_is_locked_public_catalog_still_works() throws Exception {
        String adminName = PREFIX + "_prod_a_" + UUID.randomUUID();
        String staffName = PREFIX + "_prod_s_" + UUID.randomUUID();
        String customerName = PREFIX + "_prod_u_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        saveUser(staffName, roleStaff);
        saveUser(customerName, roleUser);
        String adminToken = loginAccess(adminName, "Secret12!ab");
        String staffToken = loginAccess(staffName, "Secret12!ab");
        String customerToken = loginAccess(customerName, "Secret12!ab");

        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/products")
                        .param("includeInactive", "true")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products")
                        .param("includeInactive", "true")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        int adminIncludeInactive = mockMvc.perform(get("/api/products")
                        .param("includeInactive", "true")
                        .header("Authorization", "Bearer " + adminToken))
                .andReturn().getResponse().getStatus();
        assertThat(adminIncludeInactive).isNotEqualTo(403);

        int anonNextCode = mockMvc.perform(get("/api/products/next-code").param("categoryId", "1"))
                .andReturn().getResponse().getStatus();
        assertThat(anonNextCode == 401 || anonNextCode == 403).isTrue();
        mockMvc.perform(get("/api/products/next-code").param("categoryId", "1")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products/template")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products/expiry-warnings")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products/expired")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products/low-stock-variants")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/products/1/variants")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/products/variants/by-code/nope")
                        .header("Authorization", "Bearer " + staffToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/products/next-code").param("categoryId", "1")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound());
    }
}
