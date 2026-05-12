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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:public_catalog_dto;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class PublicCatalogDtoHardeningMvcIntegrationTest {

    private static final String[] FORBIDDEN_PUBLIC_FIELDS = {
            "costPrice", "stockQty", "sellableStockQty", "minStockQty", "lowStock", "expiryDays",
            "importUnit", "piecesPerUnit", "conversionNote", "active", "isSellable",
            "productId", "productCode", "productName", "createdAt", "updatedAt",
            "remainingQty", "batchCode", "batchId", "receiptId", "receiptNo", "supplierId", "supplierName",
            "movementId", "inventoryMovement"
    };

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
        String u = "pub_dto_adm_" + System.nanoTime();
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
                        .content("{\"name\":\"CAT-PUBDTO-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(catJson).get("id").asLong();
    }

    private long createSingleVariantProduct(long catId, String code, String name, String variantCode, boolean active, boolean sellable)
            throws Exception {
        return createSingleVariantProduct(catId, code, name, variantCode, true, active, sellable);
    }

    private long createSingleVariantProduct(long catId, String code, String name, String variantCode,
                                            boolean productActive, boolean variantActive, boolean sellable)
            throws Exception {
        String payload = """
                {
                  "code": "%s",
                  "name": "%s",
                  "categoryId": %d,
                  "active": %s,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [{
                    "variantCode": "%s",
                    "variantName": "Visible",
                    "sellUnit": "cái",
                    "importUnit": "cái",
                    "piecesPerUnit": 1,
                    "sellPrice": 1000,
                    "costPrice": 100,
                    "stockQty": 0,
                    "minStockQty": 0,
                    "expiryDays": null,
                    "isDefault": true,
                    "imageUrl": null,
                    "conversionNote": null,
                    "active": %s,
                    "isSellable": %s
                  }]
                }
                """.formatted(code, name, catId, Boolean.toString(productActive), variantCode,
                Boolean.toString(variantActive), Boolean.toString(sellable));
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp).get("id").asLong();
    }

    private static void assertPublicPayloadSafe(String json) {
        assertThat(json).doesNotContain(FORBIDDEN_PUBLIC_FIELDS);
    }

    @Test
    void public_products_list_does_not_expose_admin_variant_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "PUBL-" + suffix, "Public List " + suffix, "VAR-" + suffix, true, true);

        String json = mockMvc.perform(get("/api/products")
                        .param("search", "PUBL-" + suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").exists())
                .andExpect(jsonPath("$.content[0].code").exists())
                .andExpect(jsonPath("$.content[0].name").exists())
                .andExpect(jsonPath("$.content[0].variants[0].id").exists())
                .andExpect(jsonPath("$.content[0].variants[0].variantCode").exists())
                .andExpect(jsonPath("$.content[0].variants[0].variantName").exists())
                .andExpect(jsonPath("$.content[0].variants[0].sellPrice").exists())
                .andExpect(jsonPath("$.content[0].variants[0].sellUnit").exists())
                .andReturn().getResponse().getContentAsString();

        assertPublicPayloadSafe(json);
    }

    @Test
    void public_product_detail_does_not_expose_admin_variant_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        long pid = createSingleVariantProduct(catId, "PUBD-" + suffix, "Public Detail " + suffix, "VARD-" + suffix, true, true);

        String json = mockMvc.perform(get("/api/products/{id}", pid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pid))
                .andExpect(jsonPath("$.variants[0].variantCode").value("VARD-" + suffix))
                .andReturn().getResponse().getContentAsString();

        assertPublicPayloadSafe(json);
    }

    @Test
    void public_category_products_does_not_expose_admin_variant_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "PUBC-" + suffix, "Public Category " + suffix, "VARC-" + suffix, true, true);

        String json = mockMvc.perform(get("/api/products/category/{id}", catId)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        assertPublicPayloadSafe(json);
    }

    @Test
    void public_hidden_variants_still_hidden() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "HIDDEN-A-" + suffix, "Hidden non sellable " + suffix, "HVARA-" + suffix, true, false);
        createSingleVariantProduct(catId, "HIDDEN-B-" + suffix, "Hidden inactive " + suffix, "HVARB-" + suffix, false, true);
        createSingleVariantProduct(catId, "VISIBLE-" + suffix, "Visible " + suffix, "VVAR-" + suffix, true, true);

        mockMvc.perform(get("/api/products")
                        .param("search", suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].code").value("VISIBLE-" + suffix))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void public_hidden_product_and_hidden_variant_details_return_not_found() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        long inactiveProductId = createSingleVariantProduct(
                catId, "INACTIVE-P-" + suffix, "Inactive Product " + suffix, "IPVAR-" + suffix, false, true, true);
        long nonSellableProductId = createSingleVariantProduct(
                catId, "NO-PUB-V-" + suffix, "No Public Variant " + suffix, "NPVAR-" + suffix, true, true, false);

        mockMvc.perform(get("/api/products/{id}", inactiveProductId))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/products/{id}", nonSellableProductId))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/products")
                        .param("search", suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void public_search_pagination_still_correct() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "PAGE-A-" + suffix, "Page A " + suffix, "PAVAR-" + suffix, true, true);
        createSingleVariantProduct(catId, "PAGE-B-" + suffix, "Page B " + suffix, "PBVAR-" + suffix, true, true);

        String json = mockMvc.perform(get("/api/products")
                        .param("search", suffix)
                        .param("page", "0")
                        .param("size", "1")
                        .param("sort", "name,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.number").value(0))
                .andReturn().getResponse().getContentAsString();

        assertPublicPayloadSafe(json);
    }

    @Test
    void public_combo_returns_only_public_active_sellable_combos_and_no_internal_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        long componentId = createSingleVariantProduct(
                catId, "COMPC-" + suffix, "Component " + suffix, "COMPV-" + suffix, true, true);

        String activeComboPayload = """
                {
                  "code": "COMBO-PUB-%s",
                  "name": "Public Combo %s",
                  "description": "public combo",
                  "sellPrice": 99000,
                  "active": true,
                  "imageUrl": null,
                  "categoryId": %d,
                  "items": [{"productId": %d, "quantity": 1}]
                }
                """.formatted(suffix, suffix, catId, componentId);
        mockMvc.perform(post("/api/combos")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(activeComboPayload))
                .andExpect(status().isCreated());

        String inactiveComboPayload = """
                {
                  "code": "COMBO-HIDDEN-%s",
                  "name": "Hidden Combo %s",
                  "description": "hidden combo",
                  "sellPrice": 88000,
                  "active": false,
                  "imageUrl": null,
                  "categoryId": %d,
                  "items": [{"productId": %d, "quantity": 1}]
                }
                """.formatted(suffix, suffix, catId, componentId);
        mockMvc.perform(post("/api/combos")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(inactiveComboPayload))
                .andExpect(status().isCreated());

        String json = mockMvc.perform(get("/api/products")
                        .param("productType", "COMBO")
                        .param("search", suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].productType").value("COMBO"))
                .andExpect(jsonPath("$.content[0].code").value("COMBO-PUB-" + suffix))
                .andExpect(jsonPath("$.content[0].variants[0].sellPrice").value(99000))
                .andReturn().getResponse().getContentAsString();

        assertThat(json).doesNotContain("COMBO-HIDDEN-" + suffix);
        assertPublicPayloadSafe(json);
    }

    @Test
    void admin_product_endpoint_still_has_admin_fields_if_expected() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "ADM-" + suffix, "Admin Full " + suffix, "AVAR-" + suffix, true, true);

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", "ADM-" + suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].variants[0].costPrice").exists())
                .andExpect(jsonPath("$.content[0].variants[0].stockQty").exists())
                .andExpect(jsonPath("$.content[0].variants[0].minStockQty").exists());
    }
}
