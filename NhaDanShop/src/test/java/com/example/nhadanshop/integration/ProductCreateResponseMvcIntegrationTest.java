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
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:prod_create_resp;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class ProductCreateResponseMvcIntegrationTest {

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

    private Role roleAdmin;
    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        String u = "pcrt_adm_" + System.nanoTime();
        User admin = new User();
        admin.setUsername(u);
        admin.setPassword(passwordEncoder.encode("Secret12!ab"));
        admin.setFullName("A");
        admin.setActive(true);
        admin.getRoles().add(roleAdmin);
        userRepository.save(admin);

        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + u + "\",\"password\":\"Secret12!ab\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        adminToken = objectMapper.readTree(body).get("accessToken").asText();
    }

    @Test
    void post_products_with_initial_variants_returns_variant_ids_in_response() throws Exception {
        String catJson = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CAT-PCR-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long catId = objectMapper.readTree(catJson).get("id").asLong();

        String code = "P-PCR-" + System.nanoTime();
        String payload = """
                {
                  "code": "%s",
                  "name": "Prod PCR",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [{
                    "variantCode": "V-DEF",
                    "variantName": "Mặc định",
                    "sellUnit": "cái",
                    "importUnit": "cái",
                    "piecesPerUnit": 1,
                    "sellPrice": 125000,
                    "costPrice": 5000,
                    "stockQty": 0,
                    "minStockQty": 0,
                    "expiryDays": null,
                    "isDefault": true,
                    "imageUrl": null,
                    "conversionNote": null,
                    "active": true,
                    "isSellable": true
                  }]
                }
                """.formatted(code, catId);

        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.variants.length()").value(1))
                .andExpect(jsonPath("$.variants[0].id").exists())
                .andExpect(jsonPath("$.variants[0].variantCode").value("V-DEF"))
                .andExpect(jsonPath("$.variants[0].sellPrice").value(125000))
                .andExpect(jsonPath("$.variants[0].isDefault").value(true))
                .andExpect(jsonPath("$.variants[0].active").value(true))
                .andExpect(jsonPath("$.variants[0].isSellable").value(true))
                .andReturn().getResponse().getContentAsString();

        JsonNode root = objectMapper.readTree(resp);
        assertThat(root.path("variants").isArray()).isTrue();
        assertThat(root.path("variants").get(0).path("id").asLong()).isPositive();

        long productId = root.get("id").asLong();
        String listJson = mockMvc.perform(get("/api/products").param("search", code).param("page", "0").param("size", "20"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode page = objectMapper.readTree(listJson);
        assertThat(page.path("content").isArray()).isTrue();
        JsonNode match = null;
        for (JsonNode row : page.path("content")) {
            if (row.path("id").asLong() == productId) {
                match = row;
                break;
            }
        }
        assertThat(match).isNotNull();
        assertThat(match.path("variants").isArray()).isTrue();
        assertThat(match.path("variants").get(0).path("id").asLong()).isPositive();
        assertThat(match.path("variants").get(0).path("variantCode").asText()).isEqualTo("V-DEF");
    }
}
