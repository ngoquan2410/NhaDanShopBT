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

/**
 * B2.2 — GET /api/products/variants/search (admin/staff transaction pickers).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:var_tx_search;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class VariantTransactionSearchMvcIntegrationTest {

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

    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        Role roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        String u = "vts_adm_" + System.nanoTime();
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

    private long createCategory() throws Exception {
        String catJson = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CAT-VTS-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(catJson).get("id").asLong();
    }

    private JsonNode createProductWithVariants(long catId, String productCode, String productName, JsonNode... variants)
            throws Exception {
        StringBuilder vars = new StringBuilder();
        for (int i = 0; i < variants.length; i++) {
            if (i > 0) vars.append(",");
            vars.append(variants[i].toString());
        }
        String payload = """
                {
                  "code": "%s",
                  "name": "%s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [%s]
                }
                """.formatted(productCode, productName, catId, vars);

        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp);
    }

    private static JsonNode variantJson(
            ObjectMapper mapper,
            String code,
            String name,
            boolean active,
            boolean sellable,
            boolean isDefault) {
        try {
            String s = """
                    {
                      "variantCode": "%s",
                      "variantName": "%s",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1000,
                      "costPrice": 100,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": %s,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": %s,
                      "isSellable": %s
                    }
                    """
                    .formatted(code, name, isDefault, active, sellable);
            return mapper.readTree(s);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void variant_search_anonymous_forbidden() throws Exception {
        mockMvc.perform(get("/api/products/variants/search")
                        .param("search", "ab")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isForbidden());
    }

    @Test
    void variant_search_by_variant_code_returns_variant() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String vCode = "VTSVC-" + suf;
        JsonNode prod = createProductWithVariants(
                catId,
                "P-VTS-" + suf,
                "Không chứa token variant B",
                variantJson(objectMapper, vCode, "V1", true, true, true),
                variantJson(objectMapper, "VTSOTHER-" + suf, "V2", true, true, false));
        long vid = prod.get("variants").get(0).get("id").asLong();

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", vCode)
                        .param("page", "0")
                        .param("size", "20")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].variantId").value(vid))
                .andExpect(jsonPath("$.content[0].variantCode").value(vCode));
    }

    @Test
    void variant_search_by_variant_name_returns_variant() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String vName = "TênRiêng " + suf;
        JsonNode prod = createProductWithVariants(
                catId,
                "P-VN-" + suf,
                "Prod",
                variantJson(objectMapper, "C1-" + suf, vName, true, true, true));
        long vid = prod.get("variants").get(0).get("id").asLong();

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", vName)
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].variantId").value(vid));
    }

    @Test
    void variant_search_by_product_code_returns_variants() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String pCode = "PCODE-" + suf;
        createProductWithVariants(
                catId,
                pCode,
                "Zzz không dùng mã này để tìm",
                variantJson(objectMapper, "VA-" + suf, "A", true, true, true),
                variantJson(objectMapper, "VB-" + suf, "B", true, true, false));

        String body = mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", pCode)
                        .param("size", "20")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode page = objectMapper.readTree(body);
        assertThat(page.get("totalElements").asInt()).isEqualTo(2);
        assertThat(page.get("content")).hasSize(2);
    }

    @Test
    void variant_search_inactive_excluded_when_activeOnly() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String needle = "VINACT-" + suf;
        createProductWithVariants(
                catId,
                "P-INA-" + suf,
                "P",
                variantJson(objectMapper, needle, "Off", false, true, true));

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("activeOnly", "true")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void variant_search_non_sellable_excluded_when_sellableOnly() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String needle = "VNS-" + suf;
        createProductWithVariants(
                catId,
                "P-NS-" + suf,
                "P",
                variantJson(objectMapper, needle, "NS", true, false, true));

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("sellableOnly", "true")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void variant_search_non_sellable_allowed_when_context_receipt_default_sellable_false() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String needle = "VNSOK-" + suf;
        JsonNode prod = createProductWithVariants(
                catId,
                "P-NSOK-" + suf,
                "P",
                variantJson(objectMapper, needle, "NS", true, false, true));
        long vid = prod.get("variants").get(0).get("id").asLong();

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].variantId").value(vid))
                .andExpect(jsonPath("$.content[0].isSellable").value(false));
    }

    @Test
    void variant_search_pos_context_defaults_sellable_only() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String needle = "VPOS-" + suf;
        createProductWithVariants(
                catId,
                "P-POS-" + suf,
                "P",
                variantJson(objectMapper, needle, "NS", true, false, true));

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("context", "pos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void variant_search_pagination_metadata_correct() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String prefix = "ZZZVTS" + suf;
        for (int i = 0; i < 3; i++) {
            createProductWithVariants(
                    catId,
                    "P-PG-" + suf + "-" + i,
                    "Late sort " + i + " " + suf,
                    variantJson(objectMapper, prefix + "-x" + i, "N", true, true, true));
        }

        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", prefix)
                        .param("page", "0")
                        .param("size", "2")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.number").value(0));
    }

    @Test
    void variant_search_no_duplicate_rows() throws Exception {
        long catId = createCategory();
        String suf = String.valueOf(System.nanoTime());
        String needle = "DUPE-" + suf;
        JsonNode prod = createProductWithVariants(
                catId,
                "P-D-" + suf,
                "Pname " + needle,
                variantJson(objectMapper, "VC-" + suf, needle, true, true, true));

        String body = mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("size", "50")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode page = objectMapper.readTree(body);
        assertThat(page.get("totalElements").asInt()).isEqualTo(1);
    }

    @Test
    void variant_search_short_query_returns_empty() throws Exception {
        mockMvc.perform(get("/api/products/variants/search")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", "x")
                        .param("context", "receipt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content.length()").value(0));
    }
}
