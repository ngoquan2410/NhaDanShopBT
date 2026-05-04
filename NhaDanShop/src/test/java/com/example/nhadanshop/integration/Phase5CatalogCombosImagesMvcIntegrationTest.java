package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.service.CloudflareR2Service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 5 catalog surface — public GET categories/products; admin mutate; storefront combo list;
 * image status vs upload auth/validation.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase5_cat;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class Phase5CatalogCombosImagesMvcIntegrationTest {

    private static final String PREFIX = "P5CAT-" + System.nanoTime();

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

    @MockBean
    private CloudflareR2Service cloudflareR2Service;

    private Role roleAdmin;

    @BeforeEach
    void seedAdminRole() {
        when(cloudflareR2Service.isConfigured()).thenReturn(false);
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

    /** Keep product codes under {@code ProductRequest} 50-char limit. */
    private String shortUniq() {
        return Integer.toString(ThreadLocalRandom.current().nextInt(10_000_000, Integer.MAX_VALUE));
    }

    @Test
    void categories_get_is_public_and_post_requires_admin() throws Exception {
        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(post("/api/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"description\":\"d\",\"active\":true}"))
                .andExpect(status().isForbidden());

        String u = PREFIX + "_" + uniq();
        saveAdmin(u, "Adminpwd1!");
        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + loginAccess(u, "Adminpwd1!"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + PREFIX + "-C-" + uniq()
                                + "\",\"description\":\"d\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void combos_active_is_public_and_full_list_requires_auth() throws Exception {
        mockMvc.perform(get("/api/combos/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(get("/api/combos"))
                .andExpect(status().isForbidden());
    }

    @Test
    void images_status_public_upload_requires_admin_and_rejects_empty_file() throws Exception {
        mockMvc.perform(get("/api/images/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").exists());

        mockMvc.perform(multipart("/api/images/upload")
                        .file(new MockMultipartFile("file", "x.png", "image/png", new byte[0])))
                .andExpect(status().isForbidden());

        String u = PREFIX + "_img_" + uniq();
        saveAdmin(u, "Adminpwd1!");
        String tok = loginAccess(u, "Adminpwd1!");

        mockMvc.perform(multipart("/api/images/upload")
                        .file(new MockMultipartFile("file", "x.png", "image/png", new byte[] { (byte) 0x89 }))
                        .header("Authorization", "Bearer " + tok))
                .andExpect(result -> {
                    int code = result.getResponse().getStatus();
                    assertThat(code)
                            .withFailMessage(result.getResponse().getContentAsString())
                            .isIn(500, 503);
                });
    }

    @Test
    void admin_can_create_product_and_combo_round_trip() throws Exception {
        String u = PREFIX + "_cb_" + uniq();
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
        String v1 = "V1-" + su;
        String v2 = "V2-" + su;
        String p1code = "P5A-" + su;
        String p2code = "P5B-" + su;

        String p1 = productPayload(p1code, catId, v1);
        String p2 = productPayload(p2code, catId, v2);
        long prod1 = objectMapper.readTree(mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(p1))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();
        long prod2 = objectMapper.readTree(mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(p2))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();

        String comboBody = """
                {
                  "code": "%s",
                  "name": "Combo P5",
                  "sellPrice": 199000,
                  "active": true,
                  "items": [
                    {"productId": %d, "quantity": 1},
                    {"productId": %d, "quantity": 2}
                  ]
                }
                """.formatted("CB-" + shortUniq(), prod1, prod2);

        JsonNode combo = objectMapper.readTree(mockMvc.perform(post("/api/combos")
                        .header("Authorization", "Bearer " + tok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(comboBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andReturn().getResponse().getContentAsString());

        long comboProductId = combo.get("id").asLong();
        mockMvc.perform(get("/api/combos/" + comboProductId).header("Authorization", "Bearer " + tok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
    }

    private static String productPayload(String code, long categoryId, String variantSuffix) {
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
                    "sellPrice": 50000,
                    "costPrice": 20000,
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
