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
                .andExpect(status().isOk());

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
    void pending_orders_list_admin_only_but_post_create_permits_anonymous_flow() throws Exception {
        mockMvc.perform(get("/api/pending-orders"))
                .andExpect(status().isForbidden());

        String adminName = PREFIX + "_poa_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        String adminTok = loginAccess(adminName, "Secret12!ab");

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

        String adminName = PREFIX + "_repa_" + UUID.randomUUID();
        saveUser(adminName, roleAdmin);
        mockMvc.perform(get("/api/reports/profit").param("from", "2026-01-01").param("to", "2026-01-31")
                        .header("Authorization", "Bearer " + loginAccess(adminName, "Secret12!ab")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalProfit").exists());
    }
}
