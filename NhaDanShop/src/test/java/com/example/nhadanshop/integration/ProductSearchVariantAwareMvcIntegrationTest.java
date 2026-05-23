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
 * Slice B: /api/products?search= variant-aware parent-product search (EXISTS on
 * ProductVariant), aligned count query, no duplicate Product rows per page.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:prod_search_var;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class ProductSearchVariantAwareMvcIntegrationTest {

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
        String u = "psva_adm_" + System.nanoTime();
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
                        .content("{\"name\":\"CAT-PSVA-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(catJson).get("id").asLong();
    }

    private String createSingleProduct(long catId, String productCode, String v1Code, String v1Name, String v2Code, String v2Name)
            throws Exception {
        String payload = """
                {
                  "code": "%s",
                  "name": "Prod PSVA %s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [
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
                      "isDefault": true,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": true,
                      "isSellable": true
                    },
                    {
                      "variantCode": "%s",
                      "variantName": "%s",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 2000,
                      "costPrice": 200,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": false,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": true,
                      "isSellable": true
                    }
                  ]
                }
                """.formatted(productCode, System.nanoTime(), catId, v1Code, v1Name, v2Code, v2Name);

        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp).get("id").asText();
    }

    private String createSingleVariantProduct(
            long catId,
            String productCode,
            String productName,
            String variantCode,
            String variantName,
            boolean variantActive,
            boolean isSellable)
            throws Exception {
        String payload = """
                {
                  "code": "%s",
                  "name": "%s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [{
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
                    "isDefault": true,
                    "imageUrl": null,
                    "conversionNote": null,
                    "active": %s,
                    "isSellable": %s
                  }]
                }
                """
                .formatted(
                        productCode,
                        productName,
                        catId,
                        variantCode,
                        variantName,
                        Boolean.toString(variantActive),
                        Boolean.toString(isSellable));

        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp).get("id").asText();
    }

    @Test
    void search_nonSellableVariantCode_anonymous_doesNotMatchVariantExists_publicCatalogSafe() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "NSPUB-" + suffix;
        String productCode = "P-NS-" + suffix;
        createSingleVariantProduct(
                catId, productCode, "Prod không chứa needle", needle, "Variant NS", true, false);

        mockMvc.perform(get("/api/products")
                        .param("search", needle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void search_nonSellableVariantCode_asAdmin_findsParent() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "NSADM-" + suffix;
        String productCode = "P-NSA-" + suffix;
        String id = createSingleVariantProduct(
                catId, productCode, "Prod admin NS", needle, "Variant NS", true, false);

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(Long.parseLong(id)))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void search_inactiveVariantCode_anonymous_doesNotMatchVariantExists() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "INVPUB-" + suffix;
        String productCode = "P-INV-" + suffix;
        createSingleVariantProduct(
                catId, productCode, "Prod inactive var", needle, "Variant off", false, true);

        mockMvc.perform(get("/api/products")
                        .param("search", needle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void search_inactiveVariantCode_asAdmin_findsParent() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "INVADM-" + suffix;
        String productCode = "P-INVA-" + suffix;
        String id = createSingleVariantProduct(
                catId, productCode, "Prod admin inactive var", needle, "Variant off", false, true);

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", needle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(Long.parseLong(id)))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void search_byVariantCode_returnsParentProduct_publicEndpoint() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String variantCode = "RBCT-V-" + suffix;
        String productCode = "NOT-RBCT-" + suffix;
        String id = createSingleProduct(catId, productCode, variantCode, "Line A", "OTHER-" + suffix, "Line B");

        String pageJson = mockMvc.perform(get("/api/products")
                        .param("search", variantCode)
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "name,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(Long.parseLong(id)))
                .andExpect(jsonPath("$.content[0].code").value(productCode))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andReturn().getResponse().getContentAsString();

        JsonNode root = objectMapper.readTree(pageJson);
        assertThat(root.get("totalElements").asInt()).isEqualTo(1);
        assertThat(root.get("size").asInt()).isEqualTo(20);
        assertThat(root.get("number").asInt()).isZero();
    }

    @Test
    void search_byVariantName_returnsParentProduct() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String uniqueName = "Tên variant độc nhất " + suffix;
        String productCode = "PN-VN-" + suffix;
        createSingleProduct(catId, productCode, "VC-" + suffix, uniqueName, "VC2-" + suffix, "Other");

        mockMvc.perform(get("/api/products")
                        .param("search", uniqueName)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].code").value(productCode))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void search_byProductCode_stillWorks() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String productCode = "PCODE-" + suffix;
        createSingleProduct(catId, productCode, "V1-" + suffix, "N1", "V2-" + suffix, "N2");

        mockMvc.perform(get("/api/products")
                        .param("search", productCode)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].code").value(productCode))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void search_matchingTwoVariants_returnsOneParentRow() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String shared = "SHR-" + suffix;
        String productCode = "DUP-" + suffix;
        createSingleProduct(catId, productCode, "A-" + shared, "N1", "B-" + shared, "N2");

        mockMvc.perform(get("/api/products")
                        .param("search", shared)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void search_twoProductsSameVariantSubstring_totalElementsTwo() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "NEEDLE-" + suffix;
        createSingleProduct(catId, "P1-" + suffix, "V-" + needle + "-1", "x", "VX-1", "y");
        createSingleProduct(catId, "P2-" + suffix, "V-" + needle + "-2", "x", "VX-2", "y");

        mockMvc.perform(get("/api/products")
                        .param("search", needle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void search_with_categoryId_filters() throws Exception {
        long cat1 = createCategory();
        long cat2 = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String needle = "CATF-" + suffix;
        createSingleProduct(cat1, "P-A-" + suffix, "VA-" + needle, "n", "VB", "n2");
        createSingleProduct(cat2, "P-B-" + suffix, "VC-" + needle, "n", "VD", "n2");

        mockMvc.perform(get("/api/products")
                        .param("search", needle)
                        .param("categoryId", String.valueOf(cat1))
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].code").value("P-A-" + suffix))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void anonymous_searchByProductCode_returnsOnlyPublicVisibleVariants() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String productCode = "PVSAFE-" + suffix;
        String variantVisible = "PVSAFE-VIS-" + suffix;
        String variantInactive = "PVSAFE-INACT-" + suffix;
        String variantNonSellable = "PVSAFE-NS-" + suffix;
        String productName = "Public Variant Safe " + suffix;
        String payload = """
                {
                  "code": "%s",
                  "name": "%s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [
                    {
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
                      "active": true,
                      "isSellable": true
                    },
                    {
                      "variantCode": "%s",
                      "variantName": "Inactive",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1000,
                      "costPrice": 100,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": false,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": false,
                      "isSellable": true
                    },
                    {
                      "variantCode": "%s",
                      "variantName": "Non sellable",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1000,
                      "costPrice": 100,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": false,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": true,
                      "isSellable": false
                    }
                  ]
                }
                """.formatted(productCode, productName, catId, variantVisible, variantInactive, variantNonSellable);

        mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/products")
                        .param("search", productCode)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].variants.length()").value(1))
                .andExpect(jsonPath("$.content[0].variants[0].variantCode").value(variantVisible));
    }

    @Test
    void anonymous_productWithNoPublicVisibleVariants_isNotReturnedAndTotalsAligned() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String onlyHiddenCode = "PVHIDDEN-" + suffix;
        String visibleCode = "PVVISIBLE-" + suffix;
        String commonNeedle = "PVMIX-" + suffix;
        createSingleVariantProduct(
                catId, onlyHiddenCode, "Hidden " + commonNeedle, "HVAR-" + suffix, "Hidden Var", true, false);
        createSingleVariantProduct(
                catId, visibleCode, "Visible " + commonNeedle, "VVAR-" + suffix, "Visible Var", true, true);

        mockMvc.perform(get("/api/products")
                        .param("search", commonNeedle)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].code").value(visibleCode))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void admin_searchByProductCode_stillReceivesAllVariantRows() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String productCode = "PVADMIN-" + suffix;
        String payload = """
                {
                  "code": "%s",
                  "name": "Admin Variant Rows %s",
                  "categoryId": %d,
                  "active": true,
                  "productType": "SINGLE",
                  "imageUrl": null,
                  "initialVariants": [
                    {
                      "variantCode": "PVADMIN-VIS-%s",
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
                      "active": true,
                      "isSellable": true
                    },
                    {
                      "variantCode": "PVADMIN-INACT-%s",
                      "variantName": "Inactive",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1000,
                      "costPrice": 100,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": false,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": false,
                      "isSellable": true
                    },
                    {
                      "variantCode": "PVADMIN-NS-%s",
                      "variantName": "Non sellable",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1000,
                      "costPrice": 100,
                      "stockQty": 0,
                      "minStockQty": 0,
                      "expiryDays": null,
                      "isDefault": false,
                      "imageUrl": null,
                      "conversionNote": null,
                      "active": true,
                      "isSellable": false
                    }
                  ]
                }
                """.formatted(productCode, suffix, catId, suffix, suffix, suffix);

        mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", productCode)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].variants.length()").value(3))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void admin_forSaleOnly_filtersNonSellableVariantsAndProductsWithoutSellableVariants() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String visibleCode = "POSVIS-" + suffix;
        String hiddenCode = "POSHID-" + suffix;
        createSingleVariantProduct(
                catId, hiddenCode, "Hidden POS " + suffix, "POSHIDV-" + suffix, "Hidden", true, false);
        createSingleVariantProduct(
                catId, visibleCode, "Visible POS " + suffix, "POSVISV-" + suffix, "Visible", true, true);

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("search", "POS")
                        .param("forSaleOnly", "true")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].code").value(visibleCode))
                .andExpect(jsonPath("$.content[0].variants.length()").value(1))
                .andExpect(jsonPath("$.content[0].variants[0].isSellable").value(true))
                .andExpect(jsonPath("$.totalElements").value(1));
    }
}
