package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.IdempotencyScopes;
import com.example.nhadanshop.service.StockMutationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GATE — Critical Watchlist API/BE: POS scan auth, invoice role matrix, quote validation,
 * idempotent invoice create (anti double stock deduct), lifecycle cancel duplicates,
 * receipt void + stock-adjustment reverse idempotent replays,
 * storefront quote validation, pending confirm idempotent replay, revenue excludes cancelled.
 *
 * Combo virtual stock / full commercial flows remain in {@code Crit007ComboVirtualStockIntegrationTest},
 * {@code Slice7CommercialFlowIntegrationTest}; production deltas in {@code ProductionSlice6IntegrationTest}.
 *
 * @see docs/regression-coverage-matrix.md
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:wlg_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class CriticalWatchlistGateMvcIntegrationTest {

    private static final String PREFIX = "WLIST-" + System.nanoTime();

    @MockBean
    CustomerLoyaltyService customerLoyaltyService;

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
    PendingOrderRepository pendingOrderRepository;
    @Autowired
    StockMutationService stockMutationService;
    @Autowired
    SalesInvoiceRepository salesInvoiceRepository;

    private Role roleAdmin;
    private Role roleUser;

    @BeforeEach
    void seedRoles() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_USER");
            r.setDescription("U");
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

    private User saveUserOnly(String username, String pwd) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(pwd));
        u.setFullName("User");
        u.setActive(true);
        u.getRoles().add(roleUser);
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

    private record Seed(long productId, long variantId, String variantCode) {}

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
        mkBatch(variant, openingStock, LocalDate.now().plusDays(400));
        stockMutationService.syncVariantStockWithBatches(variant.getId());
        return new Seed(product.getId(), variant.getId(), variant.getVariantCode());
    }

    private ProductBatch mkBatch(ProductVariant v, int qty, LocalDate expiry) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(v.getProduct());
        batch.setVariant(v);
        batch.setBatchCode("B-" + PREFIX + "-" + uniq());
        batch.setExpiryDate(expiry);
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(new BigDecimal("9000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        return productBatchRepository.save(batch);
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

    private void persistMerch(LocalDateTime when, SalesInvoice.Status status, Seed s,
                              BigDecimal lineNetRev, BigDecimal unitCostSnapshot) {

        Product p = productRepository.findById(s.productId()).orElseThrow();
        ProductVariant v = variantRepository.findById(s.variantId()).orElseThrow();
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo("W-" + status + "-" + uniq());
        inv.setInvoiceDate(when);
        inv.setStatus(status);
        inv.setTotalAmount(lineNetRev);
        inv.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(p);
        line.setVariant(v);
        line.setQuantity(1);
        line.setOriginalUnitPrice(lineNetRev);
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(lineNetRev);
        line.setUnitCostSnapshot(unitCostSnapshot);
        line.setLineNetRevenue(lineNetRev);
        line.setCommercialAllocationVersion(1);
        inv.getItems().add(line);
        salesInvoiceRepository.save(inv);
    }

    @Test
    void anonymous_pos_scan_returns_unauthorized_or_forbidden() throws Exception {
        int st = mockMvc.perform(get("/api/pos/scan/ANYCODE-" + uniq())).andReturn().getResponse().getStatus();
        assertThat(st).as("POS scan must remain authenticated").isIn(401, 403);
    }

    @Test
    void inactive_variant_scan_is_not_sellable() throws Exception {
        String adminUser = PREFIX + "_adm_iv";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(5, "INA");
        ProductVariant v = variantRepository.findById(s.variantId()).orElseThrow();
        v.setActive(false);
        variantRepository.save(v);

        mockMvc.perform(get("/api/pos/scan/" + s.variantCode()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("variant"))
                .andExpect(jsonPath("$.sellable").value(false));
    }

    @Test
    void role_user_post_invoice_and_patch_cancel_are_forbidden() throws Exception {
        String adminUser = PREFIX + "_adm_pv";
        saveAdmin(adminUser, "Adminpwd1!");
        String adminTok = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(10, "RB");

        JsonNode quoted = objectMapper.readTree(mkAuthenticatedPosQuote(s.productId(), s.variantId(), 1, adminTok));
        String quoteId = quoted.get("quoteId").asText();

        String createBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":null,"quotePublicId":"%s","paymentMethod":"cash"}
                """.formatted(quoteId);

        String plainUser = PREFIX + "_cust_inv";
        saveUserOnly(plainUser, "Userpwd1!");
        String userTok = loginAccess(plainUser, "Userpwd1!");

        mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + userTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isForbidden());

        String invJson = mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + adminTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long invId = objectMapper.readTree(invJson).get("id").asLong();

        mockMvc.perform(patch("/api/invoices/" + invId + "/cancel")
                        .header("Authorization", "Bearer " + userTok)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"nope\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void storefront_quote_zero_quantity_returns_bad_request() throws Exception {
        String adminUser = PREFIX + "_adm_q0";
        saveAdmin(adminUser, "Adminpwd1!");
        Seed s = seedSku(10, "QZ");

        ObjectNode quoteReq = objectMapper.createObjectNode();
        quoteReq.put("source", "storefront");
        quoteReq.putNull("customerId");
        quoteReq.putNull("promotionId");
        quoteReq.putNull("voucherCode");
        quoteReq.putNull("shippingQuoteSnapshot");
        quoteReq.putNull("manualDiscount");
        quoteReq.putNull("requestedRedeemPoints");
        quoteReq.put("vatPercent", 0);

        ObjectNode line = objectMapper.createObjectNode();
        line.put("productId", s.productId());
        line.put("variantId", s.variantId());
        line.put("quantity", 0);
        line.put("discountPercent", 0);
        line.putNull("batchId");
        line.put("rewardLine", false);
        quoteReq.set("lines", objectMapper.createArrayNode().add(line));

        ObjectNode addr = objectMapper.createObjectNode();
        addr.put("receiverName", "x");
        addr.put("phone", "0912345678");
        addr.put("provinceCode", "79");
        addr.put("provinceName", "Ho Chi Minh");
        addr.put("districtCode", "1442");
        addr.put("districtName", "Quan 1");
        addr.put("wardCode", "21211");
        addr.put("wardName", "Ben Nghe");
        addr.put("street", "1");
        addr.putNull("note");
        quoteReq.set("shippingAddress", addr);

        mockMvc.perform(post("/api/sales/quote").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(quoteReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors").exists());
    }

    @Test
    void quote_when_requested_qty_exceeds_sellable_stock_returns_bad_request() throws Exception {
        String adminUser = PREFIX + "_adm_q_oos";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(2, "QOOS");

        ObjectNode line = objectMapper.createObjectNode();
        line.put("productId", s.productId());
        line.put("variantId", s.variantId());
        line.put("quantity", 99);
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

        String errBody = mockMvc.perform(post("/api/sales/quote")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(root)))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode err = objectMapper.readTree(errBody);
        String detail = err.path("detail").asText("");
        assertThat(detail).contains("Không đủ tồn bán được");
        assertThat(detail).contains(s.variantCode());
    }

    /**
     * Quote succeeds against opening stock; a legacy items invoice drains sellable qty before
     * materializing the quoted lines — {@link com.example.nhadanshop.service.InvoiceService#appendCapturedQuoteLine}
     * must reject with insufficient stock (not a generic 400).
     */
    @Test
    void invoice_after_valid_quote_when_stock_depleted_returns_bad_request() throws Exception {
        String adminUser = PREFIX + "_adm_inv_oos";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(10, "IOOS");

        JsonNode quoted = objectMapper.readTree(mkAuthenticatedPosQuote(s.productId(), s.variantId(), 2, token));
        String quoteId = quoted.get("quoteId").asText();

        String drainBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":[{"productId":%d,"quantity":9,"discountPercent":0,"variantId":%d,\
                "comboId":null,"batchId":null}],\
                "quotePublicId":null,"paymentMethod":"cash"}
                """.formatted(s.productId(), s.variantId());

        mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(drainBody))
                .andExpect(status().isCreated());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        assertThat(variantRepository.findById(s.variantId()).orElseThrow().getStockQty()).isEqualTo(1);

        String fromQuoteBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":null,"quotePublicId":"%s","paymentMethod":"cash"}
                """.formatted(quoteId);

        String invErr = mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(fromQuoteBody))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode invErrNode = objectMapper.readTree(invErr);
        String invDetail = invErrNode.path("detail").asText("");
        assertThat(invDetail).contains("Khong du hang variant");
        assertThat(invDetail).contains(s.variantCode());
        assertThat(invDetail).contains("Ton:");
        assertThat(invDetail).contains("can:");
    }

    @Test
    void invoice_create_idempotency_same_key_does_not_double_deduct_variant_stock() throws Exception {
        String adminUser = PREFIX + "_idem_inv";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(40, "ID");

        JsonNode quoted = objectMapper.readTree(mkAuthenticatedPosQuote(s.productId(), s.variantId(), 3, token));
        String quoteId = quoted.get("quoteId").asText();

        String createBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":null,"quotePublicId":"%s","paymentMethod":"cash"}
                """.formatted(quoteId);

        String idemKey = "idem-inv-" + uniq();

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int stockBefore = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();

        String created1 = mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node1 = objectMapper.readTree(created1);

        String created2Body = mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node2 = objectMapper.readTree(created2Body);
        assertThat(node2.get("invoiceNo").asText()).isEqualTo(node1.get("invoiceNo").asText());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int stockAfter = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();
        assertThat(stockAfter).isEqualTo(stockBefore - 3);
    }

    @Test
    void invoice_cancel_duplicate_returns_conflict() throws Exception {
        String adminUser = PREFIX + "_dcc";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(30, "DC");

        JsonNode quoted = objectMapper.readTree(mkAuthenticatedPosQuote(s.productId(), s.variantId(), 1, token));
        String quoteId = quoted.get("quoteId").asText();

        String createBody = """
                {"customerName":"Khách lẻ","customerId":null,"note":null,"promotionId":null,\
                "items":null,"quotePublicId":"%s","paymentMethod":"cash"}
                """.formatted(quoteId);

        String invJson = mockMvc.perform(post("/api/invoices")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        long invId = objectMapper.readTree(invJson).get("id").asLong();

        mockMvc.perform(patch("/api/invoices/" + invId + "/cancel")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"reason1\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/invoices/" + invId + "/cancel")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"repeat\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void receipt_void_idempotent_replay_keeps_inventory_after_void() throws Exception {
        String adminUser = PREFIX + "_rv";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(10, "RV");

        ObjectNode recvItem = objectMapper.createObjectNode()
                .put("productId", s.productId())
                .put("quantity", 15)
                .put("unitCost", 5555)
                .put("discountPercent", 0)
                .put("importUnit", "cai")
                .put("piecesOverride", 1)
                .put("variantId", s.variantId())
                .put("expiryDateOverride", "2030-12-31");

        ObjectNode recvRoot = objectMapper.createObjectNode();
        recvRoot.put("supplierName", PREFIX + "-NCC-RV");
        recvRoot.putNull("supplierId");
        recvRoot.putNull("note");
        recvRoot.put("shippingFee", 0);
        recvRoot.put("vatPercent", 0);
        recvRoot.putArray("comboItems");
        recvRoot.putArray("items").add(recvItem);
        recvRoot.put("receiptDate", "2026-04-05T09:30:00");

        String recvJson = mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recvRoot)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long receiptId = objectMapper.readTree(recvJson).get("id").asLong();

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int afterReceipt = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();

        String voidKey = "void-rcpt-" + uniq();
        mockMvc.perform(patch("/api/receipts/" + receiptId + "/void")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, voidKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int afterVoid1 = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();

        mockMvc.perform(patch("/api/receipts/" + receiptId + "/void")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, voidKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        assertThat(variantRepository.findById(s.variantId()).orElseThrow().getStockQty()).isEqualTo(afterVoid1);

        assertThat(afterVoid1).isEqualTo(afterReceipt - 15);

        mockMvc.perform(patch("/api/receipts/" + receiptId + "/void")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());
    }

    /**
     * Idempotent replay of POST /pending-orders/{id}/confirm mirrors {@link PendingOrderService#confirmOrder}
     * terminal branch when already CONFIRMED.
     */
    @Test
    void pending_confirm_same_idempotency_key_returns_cached_response() throws Exception {
        String adminUser = PREFIX + "_pe";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(36, "PE");

        ProductVariant v = variantRepository.findById(s.variantId()).orElseThrow();
        mkBatch(v, 22, LocalDate.now().plusDays(90));

        ObjectNode quoteLine = objectMapper.createObjectNode();
        quoteLine.put("productId", s.productId());
        quoteLine.put("variantId", s.variantId());
        quoteLine.put("quantity", 1);
        quoteLine.put("discountPercent", 0);
        quoteLine.putNull("batchId");
        quoteLine.put("rewardLine", false);

        ObjectNode addr = objectMapper.createObjectNode();
        addr.put("receiverName", "mvc-guest");
        addr.put("phone", "0912345678");
        addr.put("provinceCode", "79");
        addr.put("provinceName", "Ho Chi Minh");
        addr.put("districtCode", "1442");
        addr.put("districtName", "Quan 1");
        addr.put("wardCode", "21211");
        addr.put("wardName", "Ben Nghe");
        addr.put("street", "97 Test");
        addr.putNull("note");

        ObjectNode quoteReq = objectMapper.createObjectNode();
        quoteReq.put("source", "storefront");
        quoteReq.putNull("customerId");
        quoteReq.putNull("promotionId");
        quoteReq.putNull("voucherCode");
        quoteReq.putNull("shippingQuoteSnapshot");
        quoteReq.putNull("manualDiscount");
        quoteReq.putNull("requestedRedeemPoints");
        quoteReq.put("vatPercent", 0);
        quoteReq.set("shippingAddress", addr);
        quoteReq.set("lines", objectMapper.createArrayNode().add(quoteLine));

        String quoteJson = mockMvc.perform(post("/api/sales/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(quoteReq)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode quoteResp = objectMapper.readTree(quoteJson);
        String quoteId = quoteResp.get("quoteId").asText();

        ObjectNode pendReq = objectMapper.createObjectNode();
        pendReq.putNull("customerId");
        pendReq.put("customerName", PREFIX);
        pendReq.put("customerPhone", "0912345999");
        pendReq.set("shippingAddress", addr);
        pendReq.putNull("note");
        pendReq.put("paymentMethod", "cash_on_delivery");
        pendReq.putNull("lines");
        pendReq.putNull("promotionSnapshot");
        pendReq.putNull("voucherSnapshot");
        pendReq.putNull("shippingQuoteSnapshot");
        pendReq.putNull("pricingBreakdownSnapshot");
        pendReq.putNull("expiresAt");
        pendReq.put("quotePublicId", quoteId);

        String pendJson = mockMvc.perform(post("/api/pending-orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pendReq)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        Long pendingId = objectMapper.readTree(pendJson).get("id").asLong();

        String confirmBody = "{\"note\":null,\"confirmedBy\":\"mvc-watchlist\"}";
        String confirmKey = "pending-con-" + uniq();

        JsonNode resp1 = objectMapper.readTree(mockMvc.perform(post("/api/pending-orders/" + pendingId + "/confirm")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, confirmKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        JsonNode resp2 = objectMapper.readTree(mockMvc.perform(post("/api/pending-orders/" + pendingId + "/confirm")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, confirmKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(resp2.path("invoice").path("id").asLong())
                .isEqualTo(resp1.path("invoice").path("id").asLong());

        assertThat(resp1.path("pendingOrder").path("status").asText()).isEqualTo("confirmed");

        PendingOrder again = pendingOrderRepository.findById(pendingId).orElseThrow();
        assertThat(again.getInvoice()).isNotNull();
    }

    @Test
    void stock_adjustment_reverse_idempotent_second_call_keeps_inventory() throws Exception {
        String adminUser = PREFIX + "_sa";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(120, "SA");

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int stockBaseline = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();

        ObjectNode item = objectMapper.createObjectNode();
        item.put("variantId", s.variantId());
        item.put("actualQty", stockBaseline + 22);
        item.putNull("sourceBatchId");
        item.putNull("note");

        ObjectNode cre = objectMapper.createObjectNode();
        cre.put("reason", "STOCKTAKE");
        cre.put("note", "wk-gate adjustment");
        cre.set("items", objectMapper.createArrayNode().add(item));

        String posted = mockMvc.perform(post("/api/stock-adjustments")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cre)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long adjId = objectMapper.readTree(posted).get("id").asLong();

        mockMvc.perform(put("/api/stock-adjustments/" + adjId + "/confirm").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int afterConfirm = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();
        assertThat(afterConfirm).isEqualTo(stockBaseline + 22);

        String revKey = "rev-adj-" + uniq();

        mockMvc.perform(post("/api/stock-adjustments/" + adjId + "/reverse")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, revKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        int afterRev1 = variantRepository.findById(s.variantId()).orElseThrow().getStockQty();

        mockMvc.perform(post("/api/stock-adjustments/" + adjId + "/reverse")
                        .header("Authorization", "Bearer " + token)
                        .header(IdempotencyScopes.HEADER_NAME, revKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        stockMutationService.syncVariantStockWithBatches(s.variantId());
        assertThat(variantRepository.findById(s.variantId()).orElseThrow().getStockQty()).isEqualTo(afterRev1);

        mockMvc.perform(post("/api/stock-adjustments/" + adjId + "/reverse")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        assertThat(afterRev1).isEqualTo(stockBaseline);
    }

    @Test
    void revenue_total_excludes_cancelled_invoices_via_http() throws Exception {
        String adminUser = PREFIX + "_revCx";
        saveAdmin(adminUser, "Adminpwd1!");
        String token = loginAccess(adminUser, "Adminpwd1!");

        Seed s = seedSku(10, "RVX");

        LocalDateTime day = LocalDateTime.of(2026, 5, 1, 11, 0);

        persistMerch(day, SalesInvoice.Status.COMPLETED, s, new BigDecimal("99000"), new BigDecimal("30000"));

        persistMerch(day, SalesInvoice.Status.CANCELLED, s, new BigDecimal("500000"), new BigDecimal("1"));

        String from = "2026-05-01";
        String json = mockMvc.perform(get("/api/revenue/total")
                        .param("from", from)
                        .param("to", from)
                        .param("period", "daily")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode root = objectMapper.readTree(json);
        assertThat(root.get("totalAmount").decimalValue()).isEqualByComparingTo(BigDecimal.valueOf(99000));
    }
}
