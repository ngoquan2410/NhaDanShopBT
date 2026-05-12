package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.service.StockMutationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slice G: HTTP contract for receipt DELETE conflicts — stable {@code code} on 409
 * (see {@link com.example.nhadanshop.exception.GlobalExceptionHandler#handleBusinessConflict}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:rcp_del_contract;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class ReceiptDeleteConflictMvcIntegrationTest {

    private static final String PREFIX = "RDCON-" + System.nanoTime();

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
    @Autowired
    CategoryRepository categoryRepository;
    @Autowired
    ProductRepository productRepository;
    @Autowired
    ProductVariantRepository variantRepository;
    @Autowired
    ProductBatchRepository productBatchRepository;
    @Autowired
    StockMutationService stockMutationService;

    private Role roleAdmin;

    @BeforeEach
    void seedRoles() {
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

    private record Seed(long productId, long variantId) {}

    private Seed seedSku(int openingStock, String suffix) {
        String u = uniq();
        Category cat = new Category();
        cat.setName(PREFIX + "-CAT-" + u);
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode(PREFIX + "-P-" + suffix + "-" + u);
        product.setName(PREFIX + " Prod " + suffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + suffix + "-" + u);
        variant.setVariantName("V-" + suffix);
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("50000"));
        variant.setCostPrice(new BigDecimal("10000"));
        variant.setStockQty(openingStock);
        variant.setMinStockQty(2);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setImportUnit("cai");
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("B-" + PREFIX + "-" + uniq());
        batch.setExpiryDate(LocalDate.now().plusDays(400));
        batch.setImportQty(openingStock);
        batch.setRemainingQty(openingStock);
        batch.setCostPrice(new BigDecimal("9000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        productBatchRepository.save(batch);
        stockMutationService.syncVariantStockWithBatches(variant.getId());
        return new Seed(product.getId(), variant.getId());
    }

    private String mkAuthenticatedPosQuote(long productId, long variantId, int qty, String adminToken)
            throws Exception {
        ObjectNode line = objectMapper.createObjectNode();
        line.put("productId", productId);
        line.put("variantId", variantId);
        line.put("quantity", qty);
        line.put("discountPercent", 0);
        line.putNull("batchId");
        line.put("rewardLine", false);

        ObjectNode root = objectMapper.createObjectNode();
        root.put("source", "pos");
        root.putNull("customerId");
        root.set("lines", objectMapper.createArrayNode().add(line));
        root.putNull("promotionId");
        root.putNull("voucherCode");
        root.putNull("shippingQuoteSnapshot");
        root.putNull("shippingAddress");
        root.putNull("manualDiscount");
        root.put("vatPercent", 0);
        root.putNull("requestedRedeemPoints");

        return mockMvc.perform(post("/api/sales/quote")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(root)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void downstream_consumed_receipt_delete_409_has_code() throws Exception {
        String adminUser = PREFIX + "_rdc";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");
        Seed s = seedSku(5, "RDC");

        ObjectNode recvItem = objectMapper.createObjectNode()
                .put("productId", s.productId())
                .put("quantity", 10)
                .put("unitCost", 4000)
                .put("discountPercent", 0)
                .put("importUnit", "cai")
                .put("piecesOverride", 1)
                .put("variantId", s.variantId())
                .put("expiryDateOverride", "2030-12-31");

        ObjectNode recvRoot = objectMapper.createObjectNode();
        recvRoot.put("supplierName", PREFIX + "-NCC-RDC");
        recvRoot.putNull("supplierId");
        recvRoot.putNull("note");
        recvRoot.put("shippingFee", 0);
        recvRoot.put("vatPercent", 0);
        recvRoot.putArray("comboItems");
        recvRoot.putArray("items").add(recvItem);
        recvRoot.put("receiptDate", "2026-05-10T10:00:00");

        String recvJson = mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recvRoot)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long receiptId = objectMapper.readTree(recvJson).get("id").asLong();
        stockMutationService.syncVariantStockWithBatches(s.variantId());

        JsonNode quoted = objectMapper.readTree(mkAuthenticatedPosQuote(s.productId(), s.variantId(), 6, token));
        String quoteId = quoted.get("quoteId").asText();
        String createBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":null,"quotePublicId":"%s","paymentMethod":"cash"}
                """.formatted(quoteId);
        mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated());

        mockMvc.perform(delete("/api/receipts/" + receiptId).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("downstream_consumption"))
                .andExpect(jsonPath("$.detail").isString());
    }

    @Test
    void voided_receipt_delete_409_has_voided_code() throws Exception {
        String adminUser = PREFIX + "_rdv";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");
        Seed s = seedSku(3, "RDV");

        ObjectNode recvItem = objectMapper.createObjectNode()
                .put("productId", s.productId())
                .put("quantity", 4)
                .put("unitCost", 3000)
                .put("discountPercent", 0)
                .put("importUnit", "cai")
                .put("piecesOverride", 1)
                .put("variantId", s.variantId())
                .put("expiryDateOverride", "2031-06-15");

        ObjectNode recvRoot = objectMapper.createObjectNode();
        recvRoot.put("supplierName", PREFIX + "-NCC-RDV");
        recvRoot.putNull("supplierId");
        recvRoot.putNull("note");
        recvRoot.put("shippingFee", 0);
        recvRoot.put("vatPercent", 0);
        recvRoot.putArray("comboItems");
        recvRoot.putArray("items").add(recvItem);
        recvRoot.put("receiptDate", "2026-05-10T11:00:00");

        String recvJson = mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recvRoot)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long receiptId = objectMapper.readTree(recvJson).get("id").asLong();

        mockMvc.perform(patch("/api/receipts/" + receiptId + "/void")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/receipts/" + receiptId).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("voided"))
                .andExpect(jsonPath("$.detail").isString());
    }
}
