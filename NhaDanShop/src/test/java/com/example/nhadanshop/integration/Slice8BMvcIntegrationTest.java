package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.StockMutationService;
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
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slice8B FE-BE honesty — POS scan stock, receipt variantSellPrice, revenue/profit filtered by productIds (MockMvc).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:slice8b_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class Slice8BMvcIntegrationTest {

    private static final String PREFIX = "S8BMVC-" + System.nanoTime();

    @MockBean CustomerLoyaltyService customerLoyaltyService;

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired SalesInvoiceRepository salesInvoiceRepository;
    @Autowired StockMutationService stockMutationService;
    @Autowired ProductBatchRepository productBatchRepository;

    private Role roleAdmin;

    @BeforeEach
    void seedAdminRole() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> roleRepository.save(newRole("ROLE_ADMIN")));
    }

    private Role newRole(String name) {
        Role r = new Role();
        r.setName(name);
        r.setDescription(name);
        return r;
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

    private Login login(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode n = objectMapper.readTree(body);
        return new Login(n.get("accessToken").asText());
    }

    private record Login(String access) {}

    private String uniq() {
        return Long.toUnsignedString(System.nanoTime());
    }

    private ProductSeed seedProduct(BigDecimal sellPrice, int openingStock, String variantCodeSuffix) {
        String u = uniq();
        Category cat = new Category();
        cat.setName(PREFIX + "-CAT-" + u);
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode(PREFIX + "-P-" + variantCodeSuffix + "-" + u);
        product.setName(PREFIX + " Prod " + variantCodeSuffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + variantCodeSuffix + "-" + u);
        variant.setVariantName("V-" + variantCodeSuffix);
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(sellPrice);
        variant.setCostPrice(new BigDecimal("1000"));
        variant.setStockQty(openingStock);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setImportUnit("cai");
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);
        return new ProductSeed(product.getId(), variant.getId(), variant.getVariantCode(), sellPrice, openingStock);
    }

    private record ProductSeed(long productId, long variantId, String variantCode, BigDecimal sellPrice, int openingStock) {}

    @Test
    void pos_scan_reflects_stock_qty_after_receipt_and_receipt_returns_variantSellPrice() throws Exception {
        String u = PREFIX + "_adm";
        saveAdmin(u, "Adminpwd1!");
        String token = login(u, "Adminpwd1!").access;

        ProductSeed seed = seedProduct(new BigDecimal("888777"), 6, "A");

        int beforeReceipt = variantRepository.findById(seed.variantId()).orElseThrow().getStockQty();

        mockMvc.perform(get("/api/pos/scan/" + seed.variantCode()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("variant"))
                .andExpect(jsonPath("$.productId").value(seed.productId()))
                .andExpect(jsonPath("$.variantId").value(seed.variantId()))
                .andExpect(jsonPath("$.price").value(888777))
                .andExpect(jsonPath("$.variantStockQty").value(beforeReceipt));

        String receiptBody = """
                {
                  "supplierName": "%s",
                  "supplierId": null,
                  "note": null,
                  "shippingFee": 0,
                  "vatPercent": 0,
                  "comboItems": [],
                  "items": [{
                    "productId": %d,
                    "quantity": 4,
                    "unitCost": 5000,
                    "discountPercent": 0,
                    "importUnit": "cai",
                    "piecesOverride": 1,
                    "variantId": %d,
                    "expiryDateOverride": "2030-12-31"
                  }],
                  "receiptDate": "2026-04-05T09:30:00"
                }
                """.formatted(PREFIX + "-NCC", seed.productId(), seed.variantId());

        String receiptJson = mockMvc.perform(post("/api/receipts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode created = objectMapper.readTree(receiptJson);
        long receiptId = created.get("id").asLong();

        mockMvc.perform(get("/api/receipts/" + receiptId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].variantSellPrice").value(888777));

        int afterReceipt = variantRepository.findById(seed.variantId()).orElseThrow().getStockQty();

        JsonNode scanAfter = objectMapper.readTree(mockMvc.perform(get("/api/pos/scan/" + seed.variantCode())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.price").value(888777))
                .andExpect(jsonPath("$.kind").value("variant"))
                .andReturn().getResponse().getContentAsString());

        assertThat(scanAfter.path("variantStockQty").asInt()).isEqualTo(afterReceipt);
    }

    @Test
    void revenue_and_profit_product_ids_filter_use_merchandise_lines_only() throws Exception {
        String u = PREFIX + "_adm2";
        saveAdmin(u, "Adminpwd1!");
        String token = login(u, "Adminpwd1!").access;

        ProductSeed a = seedProduct(new BigDecimal("100"), 10, "PA");
        ProductSeed b = seedProduct(new BigDecimal("200"), 10, "PB");

        LocalDateTime sale = LocalDateTime.of(2026, 9, 1, 14, 0);
        persistInvoiceMerchNet("INV-S8-A", sale, a.productId(), a.variantId(), 1,
                new BigDecimal("77000"), new BigDecimal("30000"));
        persistInvoiceMerchNet("INV-S8-B", sale, b.productId(), b.variantId(), 1,
                new BigDecimal("120000"), new BigDecimal("40000"));

        String from = "2026-09-01";
        String to = "2026-09-01";

        String totalJson = mockMvc.perform(get("/api/revenue/total")
                        .param("from", from)
                        .param("to", to)
                        .param("period", "daily")
                        .param("productIds", String.valueOf(a.productId()))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode total = objectMapper.readTree(totalJson);
        assertThat(total.get("totalAmount").asDouble()).isEqualTo(77000.0);
        JsonNode rows = total.get("rows");
        assertThat(rows.isArray()).isTrue();
        assertThat(rows.get(0).get("invoiceCount").asInt()).isEqualTo(1);
        assertThat(rows.get(0).get("itemsSold").asInt()).isEqualTo(1);

        mockMvc.perform(get("/api/reports/profit")
                        .param("from", from)
                        .param("to", to)
                        .param("productIds", String.valueOf(a.productId()))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRevenue").value(77000))
                .andExpect(jsonPath("$.totalCost").value(30000))
                .andExpect(jsonPath("$.totalProfit").value(47000));

        mockMvc.perform(get("/api/revenue/by-product")
                        .param("from", from)
                        .param("to", to)
                        .param("period", "daily")
                        .param("productIds", String.valueOf(a.productId()))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productId").value(a.productId()))
                .andExpect(jsonPath("$[0].merchandiseNetRevenue").value(77000))
                .andExpect(jsonPath("$[0].merchandiseCost").value(30000))
                .andExpect(jsonPath("$[0].merchandiseNetProfit").value(47000));
    }

    @Test
    void guest_can_get_store_payment_settings_public_endpoint() throws Exception {
        mockMvc.perform(get("/api/store/payment-settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shopName").exists());
    }

    @Test
    void pos_scan_unknown_code_returns_blocked_response_not_exception() throws Exception {
        String u = PREFIX + "_adm_scan_blk";
        saveAdmin(u, "Adminpwd1!");
        String token = login(u, "Adminpwd1!").access;
        mockMvc.perform(get("/api/pos/scan/__NO_VARIANT__-" + uniq())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("variant"))
                .andExpect(jsonPath("$.sellable").value(false))
                .andExpect(jsonPath("$.blockReason").exists())
                .andExpect(jsonPath("$.blockReason").value(org.hamcrest.Matchers.containsString("NOT_FOUND")));
    }

    @Test
    void http_storefront_quote_pending_confirm_invoice_totals_match_quote_snapshot() throws Exception {
        String u = PREFIX + "_adm_po";
        saveAdmin(u, "Adminpwd1!");
        String token = login(u, "Adminpwd1!").access;

        ProductSeed seed = seedProduct(new BigDecimal("99000"), 20, "Q");
        ProductVariant vSeed = variantRepository.findById(seed.variantId()).orElseThrow();
        ProductBatch stockBatch = mkBatchRecord(vSeed, 80);
        stockMutationService.syncVariantStockWithBatches(seed.variantId());

        com.fasterxml.jackson.databind.node.ObjectNode addr = objectMapper.createObjectNode();
        addr.put("receiverName", "mvc-guest");
        addr.put("phone", "0912345678");
        addr.put("provinceCode", "79");
        addr.put("provinceName", "Ho Chi Minh");
        addr.put("districtCode", "1442");
        addr.put("districtName", "Quan 1");
        addr.put("wardCode", "21211");
        addr.put("wardName", "Ben Nghe");
        addr.put("street", "99 Test");
        addr.putNull("note");

        com.fasterxml.jackson.databind.node.ObjectNode line = objectMapper.createObjectNode();
        line.put("productId", seed.productId());
        line.put("variantId", seed.variantId());
        line.put("quantity", 1);
        line.put("discountPercent", 0);
        line.put("batchId", stockBatch.getId());
        line.put("rewardLine", false);

        com.fasterxml.jackson.databind.node.ArrayNode lines = objectMapper.createArrayNode();
        lines.add(line);

        com.fasterxml.jackson.databind.node.ObjectNode quoteReq = objectMapper.createObjectNode();
        quoteReq.put("source", "storefront");
        quoteReq.putNull("customerId");
        quoteReq.putNull("promotionId");
        quoteReq.putNull("voucherCode");
        quoteReq.putNull("shippingQuoteSnapshot");
        quoteReq.putNull("manualDiscount");
        quoteReq.putNull("requestedRedeemPoints");
        quoteReq.put("vatPercent", 0);
        quoteReq.set("lines", lines);
        quoteReq.set("shippingAddress", addr);

        String quoteJson = mockMvc.perform(post("/api/sales/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(quoteReq)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode quoteResp = objectMapper.readTree(quoteJson);
        String quoteId = quoteResp.get("quoteId").asText();
        JsonNode quoteTotNode = quoteResp.path("pricingBreakdownSnapshot").path("total");
        assertThat(quoteTotNode.isMissingNode()).isFalse();
        BigDecimal quoteTotal = quoteTotNode.decimalValue();

        com.fasterxml.jackson.databind.node.ObjectNode pend = objectMapper.createObjectNode();
        pend.putNull("customerId");
        pend.put("customerName", "Guest MVC");
        pend.put("customerPhone", "0912345678");
        pend.set("shippingAddress", addr);
        pend.putNull("note");
        pend.put("paymentMethod", "cash_on_delivery");
        pend.putNull("lines");
        pend.putNull("promotionSnapshot");
        pend.putNull("voucherSnapshot");
        pend.putNull("shippingQuoteSnapshot");
        pend.putNull("pricingBreakdownSnapshot");
        pend.putNull("expiresAt");
        pend.put("quotePublicId", quoteId);

        String pendingJson = mockMvc.perform(post("/api/pending-orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pend)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long pendingId = objectMapper.readTree(pendingJson).get("id").asLong();

        String confirmBody = "{\"note\":null,\"confirmedBy\":\"mvc-slice8b\"}";
        String confirmJson = mockMvc.perform(post("/api/pending-orders/" + pendingId + "/confirm")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode confirm = objectMapper.readTree(confirmJson);
        BigDecimal invTotal = confirm.path("invoice").path("finalAmount").decimalValue();
        long invoiceId = confirm.path("invoice").path("id").asLong();

        assertThat(invTotal.stripTrailingZeros()).isEqualByComparingTo(quoteTotal.stripTrailingZeros());

        String invPage = mockMvc.perform(get("/api/invoices")
                        .param("size", "100")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode invRoot = objectMapper.readTree(invPage);
        boolean foundListed = false;
        for (JsonNode row : invRoot.path("content")) {
            if (row.path("id").asLong() == invoiceId) {
                foundListed = true;
                break;
            }
        }
        assertThat(foundListed).as("GET /api/invoices should include confirmed invoice id").isTrue();

        mockMvc.perform(get("/api/pending-orders").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/pending-orders/" + pendingId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("confirmed"));
    }

    @Test
    void post_receipts_without_auth_returns_unauthorized() throws Exception {
        var result = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"supplierName\":\"X\",\"supplierId\":null,\"note\":null,\"shippingFee\":0,\"vatPercent\":0,\"comboItems\":[],\"items\":[],\"receiptDate\":\"2026-01-01T00:00:00\"}"))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isIn(401, 403);
    }

    private ProductBatch mkBatchRecord(ProductVariant v, int qty) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(v.getProduct());
        batch.setVariant(v);
        batch.setBatchCode("B-" + PREFIX + "-" + System.nanoTime());
        batch.setExpiryDate(LocalDate.now().plusDays(90));
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(new BigDecimal("1000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        return productBatchRepository.save(batch);
    }

    private void persistInvoiceMerchNet(
            String invNo,
            LocalDateTime when,
            long productId,
            long variantId,
            int qty,
            BigDecimal lineNetRev,
            BigDecimal unitCost) {
        Product product = productRepository.findById(productId).orElseThrow();
        ProductVariant variant = variantRepository.findById(variantId).orElseThrow();
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNo(invNo + "-" + System.nanoTime());
        inv.setInvoiceDate(when);
        inv.setStatus(SalesInvoice.Status.COMPLETED);
        inv.setTotalAmount(lineNetRev);
        inv.setDiscountAmount(BigDecimal.ZERO);
        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setInvoice(inv);
        line.setProduct(product);
        line.setVariant(variant);
        line.setQuantity(qty);
        line.setOriginalUnitPrice(lineNetRev);
        line.setLineDiscountPercent(BigDecimal.ZERO);
        line.setUnitPrice(lineNetRev);
        line.setUnitCostSnapshot(unitCost);
        line.setLineNetRevenue(lineNetRev);
        line.setCommercialAllocationVersion(1);
        inv.getItems().add(line);
        salesInvoiceRepository.save(inv);
    }
}
