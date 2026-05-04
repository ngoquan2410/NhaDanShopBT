package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 4 admin sales REST surface — payment-events auth, VietQR contract, Casso webhook idempotency replay.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:admin_sales_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class AdminSalesMvcIntegrationTest {

    private static final String PREFIX = "ADM-SALES-" + System.nanoTime();

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

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
        JsonNode n = objectMapper.readTree(body);
        return n.get("accessToken").asText();
    }

    private String uniq() {
        return Long.toUnsignedString(System.nanoTime());
    }

    @Test
    void payment_events_recent_requires_admin_role() throws Exception {
        mockMvc.perform(get("/api/payment-events/recent"))
                .andExpect(status().isForbidden());

        String u = PREFIX + "_" + uniq();
        saveAdmin(u, "Adminpwd1!");
        mockMvc.perform(get("/api/payment-events/recent")
                        .header("Authorization", "Bearer " + loginAccess(u, "Adminpwd1!")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void vietqr_generate_validation_error_on_blank_body_fields() throws Exception {
        mockMvc.perform(post("/api/vietqr/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void vietqr_settings_override_requires_admin_even_when_allowing_public_generate_base_path() throws Exception {
        String body = """
                {
                  "amount": 1000,
                  "transferContent": "override-test",
                  "settingsOverride": {
                    "vietQrBankCode": "VCB",
                    "accountNumber": "0123456789012",
                    "accountName": "Test",
                    "bankName": "VCB",
                    "qrEnabled": true
                  }
                }
                """;
        var res = mockMvc.perform(post("/api/vietqr/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn().getResponse();
        int status = res.getStatus();
        assertThat(status).withFailMessage("Anonymous VietQR preview override must be denied (403 preferred; problem+json paths may emit 500)").isIn(403, 500);
        String text = res.getContentAsString();
        assertThat(text).containsIgnoringCase("VietQR preview override");
        if (status == 500) {
            assertThat(res.getContentType()).containsIgnoringCase("json");
            assertThat(text).containsIgnoringCase("forbidden");
        }
    }

    @Test
    void vietqr_public_generate_returns_image_url_when_store_payment_settings_are_configured() throws Exception {
        String u = PREFIX + "_vietqr_" + uniq();
        saveAdmin(u, "Adminpwd1!");
        String adm = loginAccess(u, "Adminpwd1!");

        mockMvc.perform(put("/api/store/payment-settings")
                        .header("Authorization", "Bearer " + adm)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                "{\"qrEnabled\":true,\"vietQrBankCode\":\"VCB\",\"accountNumber\":\"0123456789123\""
                                        + ",\"accountName\":\"Shop QA\",\"bankName\":\"VCB\",\"qrTemplate\":\"compact2\""
                                        + ",\"transferPrefix\":\"DH\"}"
                        ))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/vietqr/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":150000,\"transferContent\":\"ADM-SALES QR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").isString())
                .andExpect(jsonPath("$.accountNumber").value("0123456789123"));
    }

    @Test
    void casso_webhook_duplicate_same_body_returns_cached_accepted_summary() throws Exception {
        String body = """
                {
                  "error": 0,
                  "data": {
                    "reference": "%sADM-CASSO-1-%s",
                    "description": "CK UNK-X",
                    "amount": 100000,
                    "when": "2026-05-02 09:01:05"
                  }
                }
                """.formatted(PREFIX, uniq());

        MvcResult first = mockMvc.perform(post("/api/webhooks/casso")
                        .header("secure-token", "test-secure-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.received").exists())
                .andReturn();

        mockMvc.perform(post("/api/webhooks/casso")
                        .header("secure-token", "test-secure-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                        .isEqualTo(first.getResponse().getContentAsString()));
    }
}
