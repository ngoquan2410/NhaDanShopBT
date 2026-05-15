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
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
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
        "spring.datasource.url=jdbc:h2:mem:pub_var_avail_batch;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class PublicVariantAvailabilityBatchMvcIntegrationTest {

    private static final String[] FORBIDDEN = {
            "\"stockQty\"", "\"remainingQty\"", "\"costPrice\"", "\"minStockQty\"",
            "\"batchId\"", "\"batchCode\"", "\"receiptId\"", "\"batches\""
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
        String u = "vavail_adm_" + System.nanoTime();
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
                        .content("{\"name\":\"CAT-VAVAIL-" + System.nanoTime() + "\",\"description\":\"t\",\"active\":true}"))
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

    private void persistSellableBatch(ProductVariant variant, int remainingQty) {
        com.example.nhadanshop.entity.Product product = variant.getProduct();
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo("RCP-VAV-" + System.nanoTime());
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
        batch.setBatchCode("BCH-VAV-" + System.nanoTime());
        batch.setExpiryDate(LocalDate.now().plusMonths(3));
        batch.setImportQty(remainingQty);
        batch.setRemainingQty(remainingQty);
        batch.setCostPrice(new BigDecimal("1.00"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        productBatchRepository.save(batch);
    }

    @Test
    void public_variant_availability_batch_returns_available_qty() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        String resp = mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "VAV-%s",
                                  "name": "V %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [{
                                    "variantCode": "VV-%s",
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
        persistSellableBatch(v, 9);

        String json = mockMvc.perform(get("/api/products/variants/availability").param("variantIds", String.valueOf(vid)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].variantId").value(vid))
                .andExpect(jsonPath("$[0].availableQty").value(9))
                .andExpect(jsonPath("$[0].availabilityStatus").value("IN_STOCK"))
                .andExpect(jsonPath("$[0].sellUnit").value("cái"))
                .andReturn().getResponse().getContentAsString();
        for (String f : FORBIDDEN) {
            assertThat(json).doesNotContain(f);
        }
    }

    @Test
    void public_variant_availability_batch_hides_internal_fields() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        long pid = createSingleVariantProduct(catId, "VAV-H-" + suffix, "H " + suffix, "VH-" + suffix, true, true);
        String detail = mockMvc.perform(get("/api/products/{id}", pid))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long vid = objectMapper.readTree(detail).get("variants").get(0).get("id").asLong();
        String json = mockMvc.perform(get("/api/products/variants/availability").param("variantIds", String.valueOf(vid)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (String f : FORBIDDEN) {
            assertThat(json).doesNotContain(f);
        }
    }

    @Test
    void public_variant_availability_batch_filters_inactive_or_non_sellable() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        JsonNode tree = objectMapper.readTree(mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "VAV-NS-%s",
                                  "name": "NS %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [
                                    {
                                      "variantCode": "GOOD-%s",
                                      "variantName": "G",
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
                                      "variantCode": "BAD-%s",
                                      "variantName": "B",
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
                                      "active": false,
                                      "isSellable": true
                                    }
                                  ]
                                }
                                """.formatted(suffix, suffix, catId, suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        long goodVid = tree.get("variants").get(0).get("id").asLong();
        long badVid = tree.get("variants").get(1).get("id").asLong();

        mockMvc.perform(get("/api/products/variants/availability")
                        .param("variantIds", goodVid + "," + badVid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].variantId").value(goodVid));
    }

    @Test
    void public_variant_availability_batch_no_n_plus_one() throws Exception {
        long catId = createCategory();
        String suffix = String.valueOf(System.nanoTime());
        JsonNode tree = objectMapper.readTree(mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "VAV-N1-%s",
                                  "name": "N1 %s",
                                  "categoryId": %d,
                                  "active": true,
                                  "productType": "SINGLE",
                                  "imageUrl": null,
                                  "initialVariants": [
                                    {
                                      "variantCode": "A-%s",
                                      "variantName": "A",
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
                                      "variantCode": "B-%s",
                                      "variantName": "B",
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
                                      "isSellable": true
                                    }
                                  ]
                                }
                                """.formatted(suffix, suffix, catId, suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        long v1 = tree.get("variants").get(0).get("id").asLong();
        long v2 = tree.get("variants").get(1).get("id").asLong();
        ProductVariant pv1 = variantRepository.findById(v1).orElseThrow();
        ProductVariant pv2 = variantRepository.findById(v2).orElseThrow();
        persistSellableBatch(pv1, 2);
        persistSellableBatch(pv2, 3);

        clearInvocations(productBatchRepository);
        mockMvc.perform(get("/api/products/variants/availability").param("variantIds", v1 + "," + v2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        verify(productBatchRepository, times(1)).sumSellableRemainingQtyByVariantIds(anyList(), any(LocalDate.class));
    }
}
