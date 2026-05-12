package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:hotfix_receipt_invoice_list;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=HotfixReceiptInvoiceJwtSecretAtLeast32CharsLong!!",
        "casso.webhook-secure-token=test-secure-token",
        "ghn.token=",
        "ghn.shop-id="
})
class HotfixReceiptInvoiceListMvcIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired ProductBatchRepository batchRepository;
    @Autowired InventoryReceiptRepository receiptRepository;
    @Autowired SalesInvoiceRepository invoiceRepository;

    private String adminToken;
    private Product product;
    private ProductVariant variant;

    @BeforeEach
    void setUp() throws Exception {
        Role roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("Admin");
            return roleRepository.save(r);
        });
        String username = "hotfix_list_" + UUID.randomUUID();
        User admin = new User();
        admin.setUsername(username);
        admin.setPassword(passwordEncoder.encode("Secret12!ab"));
        admin.setFullName("Hotfix List Admin");
        admin.setActive(true);
        admin.getRoles().add(roleAdmin);
        userRepository.save(admin);
        String login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"Secret12!ab\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        adminToken = objectMapper.readTree(login).get("accessToken").asText();

        seedCatalogReceiptAndInvoice();
    }

    @Test
    void receipts_list_search_noMatch_and_voided_rows_return_page_200() throws Exception {
        mockMvc.perform(get("/api/receipts")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(20));

        mockMvc.perform(get("/api/receipts")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20")
                        .param("search", "RCP-HOTFIX"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/receipts")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20")
                        .param("search", "NO_MATCH_HOTFIX"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void invoices_list_sort_query_status_and_invalid_optional_snapshot_return_page_200() throws Exception {
        mockMvc.perform(get("/api/invoices")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "1")
                        .param("sort", "invoiceDate,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(1));

        mockMvc.perform(get("/api/invoices")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "invoiceDate,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/invoices")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20")
                        .param("q", "NO_MATCH_HOTFIX"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));

        mockMvc.perform(get("/api/invoices")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("page", "0")
                        .param("size", "20")
                        .param("status", "active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    private void seedCatalogReceiptAndInvoice() {
        Category category = new Category();
        category.setName("HOTFIX_CAT_" + UUID.randomUUID());
        category.setDescription("hotfix");
        category.setActive(true);
        category = categoryRepository.save(category);

        product = new Product();
        product.setCode("HOTFIX_PROD_" + System.nanoTime());
        product.setName("Hotfix product");
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("HOTFIX_VAR_" + System.nanoTime());
        variant.setVariantName("Hotfix variant");
        variant.setSellUnit("cai");
        variant.setImportUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("15000"));
        variant.setCostPrice(new BigDecimal("7000"));
        variant.setStockQty(10);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsSellable(true);
        variant.setIsDefault(true);
        variant = variantRepository.save(variant);

        InventoryReceipt confirmed = createReceipt("RCP-HOTFIX-001", InventoryReceipt.STATUS_CONFIRMED);
        createBatchForReceipt(confirmed, "BATCH-HOTFIX-001", 10, 10);
        createReceipt("RCP-HOTFIX-VOID", InventoryReceipt.STATUS_VOIDED);

        createInvoice("INV-HOTFIX-001", SalesInvoice.Status.COMPLETED, "{not-valid-json");
        createInvoice("INV-HOTFIX-CANCEL", SalesInvoice.Status.CANCELLED, null);
    }

    private InventoryReceipt createReceipt(String receiptNo, String status) {
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(receiptNo);
        receipt.setReceiptDate(LocalDateTime.now().minusDays(1));
        receipt.setSupplierName("RCP Supplier");
        receipt.setNote("receipt note");
        receipt.setTotalAmount(new BigDecimal("70000"));
        receipt.setStatus(status);

        InventoryReceiptItem item = new InventoryReceiptItem();
        item.setReceipt(receipt);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(10);
        item.setUnitCost(new BigDecimal("7000"));
        item.setDiscountPercent(BigDecimal.ZERO);
        item.setDiscountedCost(new BigDecimal("7000"));
        item.setFinalCost(new BigDecimal("7000"));
        item.setFinalCostWithVat(new BigDecimal("7000"));
        item.setRetailQtyAdded(10);
        item.setPiecesUsed(1);
        item.setImportUnitUsed("cai");
        receipt.getItems().add(item);
        return receiptRepository.save(receipt);
    }

    private ProductBatch createBatchForReceipt(InventoryReceipt receipt, String code, int importQty, int remainingQty) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(product);
        batch.setVariant(variant);
        batch.setReceipt(receipt);
        batch.setBatchCode(code);
        batch.setExpiryDate(LocalDate.now().plusMonths(6));
        batch.setImportQty(importQty);
        batch.setRemainingQty(remainingQty);
        batch.setCostPrice(new BigDecimal("7000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        return batchRepository.save(batch);
    }

    private void createInvoice(String invoiceNo, SalesInvoice.Status status, String invalidPricingSnapshot) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(invoiceNo);
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setCustomerName("Hotfix Customer");
        invoice.setCustomerPhone("0900000000");
        invoice.setPaymentMethod("cash");
        invoice.setTotalAmount(new BigDecimal("15000"));
        invoice.setDiscountAmount(BigDecimal.ZERO);
        invoice.setStatus(status);
        invoice.setPricingBreakdownSnapshotJson(invalidPricingSnapshot);

        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(1);
        item.setOriginalUnitPrice(new BigDecimal("15000"));
        item.setUnitPrice(new BigDecimal("15000"));
        item.setUnitCostSnapshot(new BigDecimal("7000"));
        invoice.getItems().add(item);
        invoiceRepository.save(invoice);
    }
}


