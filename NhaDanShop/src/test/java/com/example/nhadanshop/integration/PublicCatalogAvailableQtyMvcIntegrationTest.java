package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:public_catalog_qty;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class PublicCatalogAvailableQtyMvcIntegrationTest {

    private static final String[] FORBIDDEN_PUBLIC_FIELDS = {
            "\"costPrice\"", "\"stockQty\"", "\"sellableStockQty\"", "\"minStockQty\"", "\"lowStock\"", "\"expiryDays\"",
            "\"importUnit\"", "\"piecesPerUnit\"", "\"conversionNote\"", "\"remainingQty\"",
            "\"batchId\"", "\"batchCode\"", "\"receiptId\"", "\"receiptNo\"", "\"supplierId\"", "\"supplierName\"",
            "\"movementId\"", "\"inventoryMovement\""
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
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private InventoryReceiptRepository receiptRepository;

    @SpyBean
    private ProductBatchRepository productBatchRepository;

    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        Role roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        String u = "pub_qty_adm_" + System.nanoTime();
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

    private static void assertPublicPayloadSafe(String json) {
        for (String f : FORBIDDEN_PUBLIC_FIELDS) {
            assertThat(json).doesNotContain(f);
        }
    }

    private long createCategory() throws Exception {
        String catJson = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CAT-PUBQTY-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(catJson).get("id").asLong();
    }

    private long createSingleVariantProduct(long catId, String code, String name, String variantCode,
                                            boolean variantActive, boolean sellable) throws Exception {
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
                """.formatted(code, name, catId, variantCode,
                Boolean.toString(variantActive), Boolean.toString(sellable));
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp).get("id").asLong();
    }

    private JsonNode createTwoVariantProduct(long catId, String code, String name, String suffix) throws Exception {
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
                      "variantCode": "V1-%s",
                      "variantName": "Loại 1",
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
                      "variantCode": "V2-%s",
                      "variantName": "Loại 2",
                      "sellUnit": "cái",
                      "importUnit": "cái",
                      "piecesPerUnit": 1,
                      "sellPrice": 1100,
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
                """.formatted(code, name, catId, suffix, suffix);
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(resp);
    }

    private void persistSellableBatch(ProductVariant variant, int remainingQty) {
        Product product = variant.getProduct();
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo("RCP-Q-" + System.nanoTime());
        receipt.setReceiptDate(LocalDateTime.now().minusDays(1));
        receipt.setSupplierName("Seeder");
        receipt.setNote("test");
        receipt.setTotalAmount(BigDecimal.TEN);
        receipt.setStatus(InventoryReceipt.STATUS_CONFIRMED);
        receiptRepository.save(receipt);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(product);
        batch.setVariant(variant);
        batch.setReceipt(receipt);
        batch.setBatchCode("BCH-Q-" + System.nanoTime());
        batch.setExpiryDate(LocalDate.now().plusMonths(3));
        batch.setImportQty(remainingQty);
        batch.setRemainingQty(remainingQty);
        batch.setCostPrice(new BigDecimal("1.00"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        productBatchRepository.save(batch);
    }

    @Test
    void public_catalog_variant_includes_available_qty() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        createSingleVariantProduct(catId, "PQTY-A-" + suffix, "Qty A " + suffix, "VQ-A-" + suffix, true, true);

        mockMvc.perform(get("/api/products")
                        .param("search", "PQTY-A-" + suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].variants[0].availableQty").exists())
                .andExpect(jsonPath("$.content[0].variants[0].availableQty").value(0))
                .andExpect(jsonPath("$.content[0].variants[0].availabilityStatus").value("OUT_OF_STOCK"));
    }

    @Test
    void public_catalog_available_qty_sums_remaining_batches() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "PQTY-SUM-%s",
                                  "name": "Sum %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [{
                                    "variantCode": "VSUM-%s",
                                    "variantName": "V",
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
                                  }]
                                }
                                """.formatted(suffix, suffix, catId, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long vid = objectMapper.readTree(resp).get("variants").get(0).get("id").asLong();
        ProductVariant v = variantRepository.findById(vid).orElseThrow();
        persistSellableBatch(v, 5);
        persistSellableBatch(v, 7);

        mockMvc.perform(get("/api/products/{id}", objectMapper.readTree(resp).get("id").asLong()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variants[0].availableQty").value(12))
                .andExpect(jsonPath("$.variants[0].availabilityStatus").value("IN_STOCK"));
    }

    @Test
    void public_catalog_available_qty_zero_when_no_remaining_batch() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        long pid = createSingleVariantProduct(catId, "PQTY-Z-" + suffix, "Zero " + suffix, "VZ-" + suffix, true, true);

        mockMvc.perform(get("/api/products/{id}", pid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variants[0].availableQty").value(0))
                .andExpect(jsonPath("$.variants[0].availabilityStatus").value("OUT_OF_STOCK"));
    }

    @Test
    void public_catalog_does_not_expose_stock_qty_remaining_qty_batch_internal_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "PQTY-SAFE-%s",
                                  "name": "Safe %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [{
                                    "variantCode": "VSAFE-%s",
                                    "variantName": "V",
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
                                  }]
                                }
                                """.formatted(suffix, suffix, catId, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long vid = objectMapper.readTree(resp).get("variants").get(0).get("id").asLong();
        persistSellableBatch(variantRepository.findById(vid).orElseThrow(), 3);

        String json = mockMvc.perform(get("/api/products")
                        .param("search", "PQTY-SAFE-" + suffix)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].variants[0].availableQty").value(3))
                .andReturn().getResponse().getContentAsString();

        assertPublicPayloadSafe(json);
    }

    @Test
    void public_catalog_available_qty_no_n_plus_one() throws Exception {
        long catId = createCategory();
        String tag = "NPQ-" + System.nanoTime();
        createSingleVariantProduct(catId, tag + "A", "Na " + tag, "V" + tag + "A", true, true);
        createSingleVariantProduct(catId, tag + "B", "Nb " + tag, "V" + tag + "B", true, true);
        createSingleVariantProduct(catId, tag + "C", "Nc " + tag, "V" + tag + "C", true, true);

        clearInvocations(productBatchRepository);
        mockMvc.perform(get("/api/products")
                        .param("search", tag)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(3));

        verify(productBatchRepository, times(1)).sumSellableRemainingQtyByVariantIds(anyList(), any(LocalDate.class));
    }

    @Test
    void public_catalog_only_active_sellable_variants_have_available_qty() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        JsonNode created = createTwoVariantProduct(catId, "PQTY-MV-" + suffix, "Multi " + suffix, suffix);
        long pid = created.get("id").asLong();
        long v1 = created.get("variants").get(0).get("id").asLong();

        persistSellableBatch(variantRepository.findById(v1).orElseThrow(), 4);

        mockMvc.perform(get("/api/products/{id}", pid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variants.length()").value(1))
                .andExpect(jsonPath("$.variants[0].variantCode").value("V1-" + suffix))
                .andExpect(jsonPath("$.variants[0].availableQty").value(4))
                .andExpect(jsonPath("$.variants[0].availabilityStatus").exists());
    }

    @Test
    void public_catalog_low_stock_status_when_qty_below_min_threshold() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "PQTY-LOW-%s",
                                  "name": "Low %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [{
                                    "variantCode": "VLOW-%s",
                                    "variantName": "V",
                                    "sellUnit": "cái",
                                    "importUnit": "cái",
                                    "piecesPerUnit": 1,
                                    "sellPrice": 1000,
                                    "costPrice": 100,
                                    "stockQty": 0,
                                    "minStockQty": 50,
                                    "expiryDays": null,
                                    "isDefault": true,
                                    "imageUrl": null,
                                    "conversionNote": null,
                                    "active": true,
                                    "isSellable": true
                                  }]
                                }
                                """.formatted(suffix, suffix, catId, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long vid = objectMapper.readTree(resp).get("variants").get(0).get("id").asLong();
        persistSellableBatch(variantRepository.findById(vid).orElseThrow(), 10);

        mockMvc.perform(get("/api/products/{id}", objectMapper.readTree(resp).get("id").asLong()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variants[0].availableQty").value(10))
                .andExpect(jsonPath("$.variants[0].availabilityStatus").value("LOW_STOCK"));
    }
}
