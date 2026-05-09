package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
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

import java.util.concurrent.ThreadLocalRandom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 5 commercial — promotion/voucher endpoints, POS quote with combo line (snapshot/allocation smoke).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase5_com;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class Phase5CommercialPromotionsVouchersMvcIntegrationTest {

    private static final String PREFIX = "P5COM-" + System.nanoTime();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ProductVariantRepository variantRepository;

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

    private String shortUniq() {
        return Integer.toString(ThreadLocalRandom.current().nextInt(10_000_000, Integer.MAX_VALUE));
    }

    @Test
    void promotions_evaluate_validation_errors_on_bad_body() throws Exception {
        mockMvc.perform(post("/api/promotions/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void promotions_admin_list_requires_auth_vouchers_active_is_public() throws Exception {
        mockMvc.perform(get("/api/promotions?page=0&size=5"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/vouchers/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void pos_quote_with_combo_line_returns_pricing_snapshot() throws Exception {
        String u = PREFIX + "_adm_" + uniq();
        saveAdmin(u, "Adminpwd1!");
        String tok = loginAccess(u, "Adminpwd1!");

        String catJson = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + PREFIX + "-CAT-" + uniq()
                                + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long catId = objectMapper.readTree(catJson).get("id").asLong();

        String su = shortUniq();
        String vx = "VX-" + su;
        String vy = "VY-" + su;
        String p1code = "PCA-" + su;
        String p2code = "PCB-" + su;

        String p1json = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleProduct(p1code, catId, vx)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode p1root = objectMapper.readTree(p1json);
        long prod1 = p1root.get("id").asLong();
        long var1 = p1root.get("variants").get(0).get("id").asLong();

        String p2json = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleProduct(p2code, catId, vy)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode p2root = objectMapper.readTree(p2json);
        long prod2 = p2root.get("id").asLong();
        long var2 = p2root.get("variants").get(0).get("id").asLong();

        String receiptBody = """
                {
                  "supplierName": "NCC-P5-COM",
                  "shippingFee": 0,
                  "vatPercent": 0,
                  "comboItems": [],
                  "items": [
                    {"productId": %d, "quantity": 100, "unitCost": 1000, "discountPercent": 0, "importUnit": "cai", "piecesOverride": 1, "variantId": %d, "expiryDateOverride": "2030-12-31"},
                    {"productId": %d, "quantity": 100, "unitCost": 1000, "discountPercent": 0, "importUnit": "cai", "piecesOverride": 1, "variantId": %d, "expiryDateOverride": "2030-12-31"}
                  ],
                  "receiptDate": "2026-04-05T09:30:00"
                }
                """.formatted(prod1, var1, prod2, var2);
        mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody))
                .andExpect(status().isCreated());

        String comboBody = """
                {
                  "code": "%s",
                  "name": "Combo Quote P5",
                  "sellPrice": 155000,
                  "active": true,
                  "items": [
                    {"productId": %d, "quantity": 1},
                    {"productId": %d, "quantity": 1}
                  ]
                }
                """.formatted("PCQ-" + shortUniq(), prod1, prod2);

        JsonNode combo = objectMapper.readTree(mockMvc.perform(post("/api/combos")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(comboBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        long comboId = combo.get("id").asLong();
        long comboVarId = variantRepository.findByProductIdAndIsDefaultTrue(comboId).orElseThrow().getId();

        String comboReceiptBody = """
                {
                  "supplierName": "NCC-P5-COMBO",
                  "shippingFee": 0,
                  "vatPercent": 0,
                  "comboItems": [],
                  "items": [
                    {"productId": %d, "quantity": 20, "unitCost": 1000, "discountPercent": 0, "importUnit": "cai", "piecesOverride": 1, "variantId": %d, "expiryDateOverride": "2030-12-31"}
                  ],
                  "receiptDate": "2026-04-05T10:00:00"
                }
                """.formatted(comboId, comboVarId);
        mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(comboReceiptBody))
                .andExpect(status().isCreated());

        String quoteBody = """
                {
                  "source": "pos",
                  "lines": [{
                    "productId": %d,
                    "variantId": %d,
                    "quantity": 1,
                    "discountPercent": 0,
                    "rewardLine": false
                  }]
                }
                """.formatted(comboId, comboVarId);

        mockMvc.perform(post("/api/sales/quote")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quoteId").isString())
                .andExpect(jsonPath("$.lines").isArray())
                .andExpect(jsonPath("$.pricingBreakdownSnapshot.subtotal").exists());
    }

    private static String singleProduct(String code, long categoryId, String variantSuffix) {
        return """
                {
                  "code": "%s",
                  "name": "Prod %s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "initialVariants": [{
                    "variantCode": "%s",
                    "variantName": "Mặc định",
                    "sellUnit": "cái",
                    "importUnit": "cái",
                    "piecesPerUnit": 1,
                    "sellPrice": 90000,
                    "costPrice": 30000,
                    "stockQty": 0,
                    "minStockQty": 0,
                    "isDefault": true,
                    "active": true,
                    "isSellable": true
                  }]
                }
                """.formatted(code, variantSuffix, categoryId, variantSuffix);
    }
}
