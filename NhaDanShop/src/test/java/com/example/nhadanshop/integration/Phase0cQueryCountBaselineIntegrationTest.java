package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.SalesQuoteLineRequest;
import com.example.nhadanshop.dto.SalesQuoteRequest;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.PendingOrderItem;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.entity.StockAdjustment;
import com.example.nhadanshop.entity.StockAdjustmentItem;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.StockAdjustmentRepository;
import com.example.nhadanshop.service.CustomerLoyaltyService;
import com.example.nhadanshop.service.CustomerService;
import com.example.nhadanshop.service.InventoryReceiptService;
import com.example.nhadanshop.service.PendingOrderService;
import com.example.nhadanshop.service.ProductComboService;
import com.example.nhadanshop.service.PromotionService;
import com.example.nhadanshop.service.SalesQuoteService;
import com.example.nhadanshop.service.StockAdjustmentService;
import com.example.nhadanshop.service.StockMutationService;
import com.example.nhadanshop.tooling.HibernateStatementStatsHelper;
import jakarta.persistence.EntityManager;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 0C: Hibernate {@link Statistics#getPrepareStatementCount()} baselines for perf planning.
 * Dataset sizes N ∈ {10, 50, 100} where feasible. Results are also summarized in
 * {@code docs/performance/evidence/phase0c_query_baseline.md} after running this class.
 */
@SpringBootTest
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase0c_qc;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=phase0c-baseline",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase0cQueryCountBaselineIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(Phase0cQueryCountBaselineIntegrationTest.class);

    private static final String PREFIX = "P0QC-" + System.nanoTime();

    @MockBean
    CustomerLoyaltyService customerLoyaltyService;

    @Autowired
    EntityManager entityManager;
    @Autowired
    CustomerRepository customerRepository;
    @Autowired
    CustomerService customerService;
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
    @Autowired
    ProductComboService productComboService;
    @Autowired
    SalesQuoteService salesQuoteService;
    @Autowired
    PendingOrderRepository pendingOrderRepository;
    @Autowired
    SalesInvoiceRepository salesInvoiceRepository;
    @Autowired
    PendingOrderService pendingOrderService;
    @Autowired
    StockAdjustmentRepository stockAdjustmentRepository;
    @Autowired
    StockAdjustmentService stockAdjustmentService;
    @Autowired
    PromotionRepository promotionRepository;
    @Autowired
    PromotionService promotionService;
    @Autowired
    InventoryReceiptRepository inventoryReceiptRepository;
    @Autowired
    InventoryReceiptService inventoryReceiptService;

    private Statistics stats() {
        return HibernateStatementStatsHelper.statistics(entityManager);
    }

    private void flushClearResetStats() {
        entityManager.flush();
        entityManager.clear();
        Statistics s = stats();
        s.clear();
    }

    private long measurePreparedStatements(Runnable action) {
        Statistics s = stats();
        s.clear();
        action.run();
        entityManager.flush();
        return HibernateStatementStatsHelper.prepareStatementCount(s);
    }

    private Category mkCategory(String suffix) {
        Category cat = new Category();
        cat.setName(PREFIX + suffix);
        cat.setActive(true);
        return categoryRepository.save(cat);
    }

    private ProductVariant mkVariantWithBatch(String suffix, Category cat) {
        Product product = new Product();
        product.setCode(PREFIX + "-P-" + suffix);
        product.setName("Prod " + suffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-V-" + suffix);
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("10000"));
        variant.setCostPrice(new BigDecimal("5000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);

        ProductBatch batch = new ProductBatch();
        batch.setProduct(product);
        batch.setVariant(variant);
        batch.setBatchCode(PREFIX + "-B-" + suffix);
        batch.setExpiryDate(LocalDate.now().plusDays(60));
        batch.setImportQty(100);
        batch.setRemainingQty(100);
        batch.setCostPrice(new BigDecimal("5000"));
        batch.setStatus(ProductBatch.STATUS_ACTIVE);
        productBatchRepository.save(batch);
        stockMutationService.syncVariantStockWithBatches(variant.getId());
        return variantRepository.findById(variant.getId()).orElseThrow();
    }

    /** Variant without batches — for receipt list baseline where each receipt owns a new batch row. */
    private ProductVariant mkVariantBare(String suffix, Category cat) {
        Product product = new Product();
        product.setCode(PREFIX + "-PB-" + suffix);
        product.setName("ProdBare " + suffix);
        product.setCategory(cat);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(PREFIX + "-VB-" + suffix);
        variant.setVariantName("V");
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(new BigDecimal("10000"));
        variant.setCostPrice(new BigDecimal("5000"));
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsDefault(true);
        variant.setIsSellable(true);
        return variantRepository.save(variant);
    }

    @ParameterizedTest(name = "GET /api/customers equivalent: CustomerService.getAll with N={0} active customers")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: customer list query count scales with N (expect ~3N+1 pattern)")
    void baseline_customers_getAll_statementCount(int n) {
        for (int i = 0; i < n; i++) {
            Customer c = new Customer();
            c.setCode(PREFIX + "-CUST-" + i);
            c.setName("Cust " + i);
            c.setActive(true);
            customerRepository.save(c);
        }
        flushClearResetStats();
        long stmts = measurePreparedStatements(() -> assertThat(customerService.getAll()).hasSize(n));
        log.info("PHASE0C\tcustomers\tN={}\tpageSize=n/a(list)\tprepareStatements={}", n, stmts);
        assertThat(stmts).isPositive();
    }

    @ParameterizedTest(name = "GET /api/combos equivalent: ProductComboService.listAll with N={0} combos")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: combo list query count scales with N (per-combo item loads)")
    void baseline_combos_listAll_statementCount(int n) {
        Category cat = mkCategory("CAT-COMBO");
        ProductVariant component = mkVariantWithBatch("COMP", cat);
        Long componentProductId = component.getProduct().getId();
        for (int i = 0; i < n; i++) {
            productComboService.create(new ProductComboRequest(
                    PREFIX + "-CB-" + i,
                    "Combo " + i,
                    null,
                    new BigDecimal("99999"),
                    true,
                    null,
                    cat.getId(),
                    List.of(new ProductComboRequest.ComboItemRequest(componentProductId, 1))
            ));
        }
        flushClearResetStats();
        long stmts = measurePreparedStatements(() -> assertThat(productComboService.listAll()).hasSize(n));
        log.info("PHASE0C\tcombos_listAll\tN={}\tpageSize=n/a(list)\tprepareStatements={}", n, stmts);
        assertThat(stmts).isPositive();
    }

    @ParameterizedTest(name = "POST /api/sales/quote: SalesQuoteService.quote with {0} identical lines")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: storefront quote statement count vs line count")
    void baseline_sales_quote_storefront_statementCount(int lineCount) {
        Category cat = mkCategory("CAT-QUOTE");
        ProductVariant v = mkVariantWithBatch("Q", cat);
        ProductBatch batch = productBatchRepository
                .findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(v.getId(), 0)
                .getFirst();
        List<SalesQuoteLineRequest> lines = IntStream.range(0, lineCount)
                .mapToObj(i -> new SalesQuoteLineRequest(
                        v.getProduct().getId(), v.getId(), 1, BigDecimal.ZERO, batch.getId(), false))
                .toList();
        ShippingAddressDto addr = new ShippingAddressDto(
                "A", "0909123456", "79", "HCM", "760", "Q1",
                "26734", "Xa", "1", null, null);
        var req = new SalesQuoteRequest(
                "storefront", null, lines, null, null, null, addr, null, BigDecimal.ZERO);
        flushClearResetStats();
        long stmts = measurePreparedStatements(() -> assertThat(salesQuoteService.quote(req).lines()).hasSize(lineCount));
        log.info("PHASE0C\tsales_quote\tN_lines={}\tpageSize=n/a\tprepareStatements={}", lineCount, stmts);
        assertThat(stmts).isPositive();
        // Phase 3B: QuoteContext preload — bounded vs legacy ~N+6 (see phase3b_sales_quote_quotecontext_report.md)
        assertThat(stmts).isLessThanOrEqualTo(12);
    }

    @ParameterizedTest(name = "GET /api/pending-orders: listAdminPage pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: pending admin page query count vs rows per page")
    void baseline_pending_orders_admin_page_statementCount(int pageSize) {
        Category cat = mkCategory("CAT-PEND");
        ProductVariant v = mkVariantWithBatch("PEND", cat);
        for (int i = 0; i < pageSize; i++) {
            PendingOrder o = new PendingOrder();
            o.setOrderNo(PREFIX + "-PO-" + i);
            o.setPaymentMethod("bank_transfer");
            o.setStatus(PendingOrder.Status.PENDING_PAYMENT);
            o.setTotalAmount(new BigDecimal("1000"));
            o.setExpiresAt(LocalDateTime.now().plusDays(1));
            PendingOrderItem li = new PendingOrderItem();
            li.setPendingOrder(o);
            li.setProduct(v.getProduct());
            li.setVariant(v);
            li.setLineId("L" + i);
            li.setProductNameSnapshot("P");
            li.setQuantity(1);
            li.setUnitPrice(BigDecimal.TEN);
            li.setLineSubtotal(BigDecimal.TEN);
            li.setRewardLine(false);
            o.getItems().add(li);
            pendingOrderRepository.save(o);
        }
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() ->
                assertThat(pendingOrderService.listAdminPage(0, pageSize, null, null, null, pageable)
                        .getContent()).hasSize(pageSize));
        log.info("PHASE0C\tpending_orders_admin\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isPositive();
        assertThat(stmts).isLessThanOrEqualTo(5);
    }

    /**
     * Phase 2B: each row is CONFIRMED with a linked {@link SalesInvoice} that has multiple line items in the DB.
     * List path must not load invoice/items (statement count bounded; {@code invoice} field null on list DTO).
     */
    @ParameterizedTest(name = "GET /api/pending-orders: listAdminPage with linked invoices pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 2B: pending admin list with invoice FK + heavy invoice rows stays bounded")
    void baseline_pending_orders_admin_page_with_linked_invoices_statementCount(int pageSize) {
        Category cat = mkCategory("CAT-PEND-INV");
        ProductVariant v = mkVariantWithBatch("PENDINV", cat);
        for (int i = 0; i < pageSize; i++) {
            PendingOrder o = new PendingOrder();
            o.setOrderNo(PREFIX + "-POI-" + i);
            o.setPaymentMethod("bank_transfer");
            o.setStatus(PendingOrder.Status.PENDING_PAYMENT);
            o.setTotalAmount(new BigDecimal("1000"));
            o.setExpiresAt(LocalDateTime.now().plusDays(1));
            PendingOrderItem li = new PendingOrderItem();
            li.setPendingOrder(o);
            li.setProduct(v.getProduct());
            li.setVariant(v);
            li.setLineId("L" + i);
            li.setProductNameSnapshot("P");
            li.setQuantity(1);
            li.setUnitPrice(BigDecimal.TEN);
            li.setLineSubtotal(BigDecimal.TEN);
            li.setRewardLine(false);
            o.getItems().add(li);
            pendingOrderRepository.save(o);

            SalesInvoice inv = new SalesInvoice();
            inv.setInvoiceNo(PREFIX + "-INV-" + i);
            inv.setInvoiceDate(LocalDateTime.now());
            inv.setTotalAmount(new BigDecimal("1000"));
            inv.setDiscountAmount(BigDecimal.ZERO);
            inv.setLoyaltyDiscountAmount(BigDecimal.ZERO);
            inv.setLoyaltyRedeemedPoints(0L);
            inv.setVatPercent(BigDecimal.ZERO);
            inv.setSourceType(SalesInvoice.SourceType.ONLINE_PENDING);
            inv.setStatus(SalesInvoice.Status.COMPLETED);
            inv.setPendingOrderId(o.getId());
            for (int k = 0; k < 3; k++) {
                SalesInvoiceItem sii = new SalesInvoiceItem();
                sii.setInvoice(inv);
                sii.setProduct(v.getProduct());
                sii.setVariant(v);
                sii.setQuantity(1);
                sii.setOriginalUnitPrice(BigDecimal.TEN);
                sii.setUnitPrice(BigDecimal.TEN);
                sii.setLineDiscountPercent(BigDecimal.ZERO);
                sii.setUnitCostSnapshot(BigDecimal.ONE);
                sii.setRewardLine(false);
                inv.getItems().add(sii);
            }
            salesInvoiceRepository.save(inv);

            o.setInvoice(inv);
            o.setStatus(PendingOrder.Status.CONFIRMED);
            pendingOrderRepository.save(o);
        }
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() -> {
            var page = pendingOrderService.listAdminPage(0, pageSize, null, null, null, pageable);
            assertThat(page.getContent()).hasSize(pageSize);
            assertThat(page.getTotalElements()).isEqualTo(pageSize);
            for (var row : page.getContent()) {
                assertThat(row.invoice()).as("list omits nested invoice per Phase 2B").isNull();
            }
        });
        log.info("PHASE0C\tpending_orders_admin_with_invoice\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isLessThanOrEqualTo(5);
    }

    @ParameterizedTest(name = "GET /api/stock-adjustments: getAll pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: stock adjustment list query count vs page rows")
    void baseline_stock_adjustments_page_statementCount(int pageSize) {
        Category cat = mkCategory("CAT-ADJ");
        ProductVariant v = mkVariantWithBatch("ADJ", cat);
        for (int i = 0; i < pageSize; i++) {
            StockAdjustment adj = new StockAdjustment();
            adj.setAdjNo(PREFIX + "-ADJ-" + i);
            adj.setAdjDate(LocalDateTime.now());
            adj.setReason(StockAdjustment.Reason.OTHER);
            adj.setStatus(StockAdjustment.Status.DRAFT);
            StockAdjustmentItem it = new StockAdjustmentItem();
            it.setAdjustment(adj);
            it.setVariant(v);
            it.setSystemQty(10);
            it.setActualQty(8);
            adj.getItems().add(it);
            stockAdjustmentRepository.save(adj);
        }
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() ->
                assertThat(stockAdjustmentService.getAll(pageable).getContent()).hasSize(pageSize));
        log.info("PHASE0C\tstock_adjustments\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isPositive();
    }

    @ParameterizedTest(name = "GET /api/promotions: list pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: promotion admin list query count vs page rows")
    void baseline_promotions_page_statementCount(int pageSize) {
        LocalDateTime start = LocalDateTime.now().minusDays(1);
        LocalDateTime end = LocalDateTime.now().plusDays(30);
        for (int i = 0; i < pageSize; i++) {
            Promotion p = new Promotion();
            p.setName(PREFIX + "-PR-" + i);
            p.setType("PERCENT_DISCOUNT");
            p.setDiscountValue(new BigDecimal("5"));
            p.setMinOrderValue(BigDecimal.ZERO);
            p.setStartDate(start);
            p.setEndDate(end);
            p.setActive(true);
            p.setAppliesTo("ALL");
            promotionRepository.save(p);
        }
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() ->
                assertThat(promotionService.list(null, pageSize, null, null, null, false, pageable).getContent())
                        .hasSize(pageSize));
        log.info("PHASE0C\tpromotions\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isPositive();
    }

    @ParameterizedTest(name = "GET /api/receipts: listReceipts pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 0C: receipt list query count vs page rows (no batches attached)")
    void baseline_receipts_page_statementCount(int pageSize) {
        for (int i = 0; i < pageSize; i++) {
            InventoryReceipt r = new InventoryReceipt();
            r.setReceiptNo(PREFIX + "-RCP-" + i);
            r.setReceiptDate(LocalDateTime.now());
            r.setTotalAmount(BigDecimal.ZERO);
            r.setShippingFee(BigDecimal.ZERO);
            r.setTotalVat(BigDecimal.ZERO);
            r.setStatus(InventoryReceipt.STATUS_CONFIRMED);
            inventoryReceiptRepository.save(r);
        }
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() ->
                assertThat(inventoryReceiptService.listReceipts(pageable).getContent()).hasSize(pageSize));
        log.info("PHASE0C\treceipts\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isPositive();
    }

    /**
     * Phase 4 evidence: each receipt has at least one {@link ProductBatch} row linked (realistic inbound rows).
     */
    @ParameterizedTest(name = "GET /api/receipts: listReceipts with batches attached pageSize={0}")
    @ValueSource(ints = {10, 50, 100})
    @DisplayName("Phase 4 evidence: receipt list query count with receipt-owned batches")
    void baseline_receipts_page_with_batches_statementCount(int pageSize) {
        Category cat = mkCategory("CAT-RCP-BATCH");
        ProductVariant v = mkVariantBare("RCP-BATCH", cat);
        for (int i = 0; i < pageSize; i++) {
            InventoryReceipt r = new InventoryReceipt();
            r.setReceiptNo(PREFIX + "-RCPB-" + i);
            r.setReceiptDate(LocalDateTime.now());
            r.setTotalAmount(BigDecimal.ZERO);
            r.setShippingFee(BigDecimal.ZERO);
            r.setTotalVat(BigDecimal.ZERO);
            r.setStatus(InventoryReceipt.STATUS_CONFIRMED);
            r = inventoryReceiptRepository.save(r);

            ProductBatch b = new ProductBatch();
            b.setProduct(v.getProduct());
            b.setVariant(v);
            b.setReceipt(r);
            b.setBatchCode(PREFIX + "-RCPB-B-" + i);
            b.setExpiryDate(LocalDate.now().plusDays(30));
            b.setImportQty(5);
            b.setRemainingQty(5);
            b.setCostPrice(new BigDecimal("1000"));
            b.setStatus(ProductBatch.STATUS_ACTIVE);
            productBatchRepository.save(b);
        }
        stockMutationService.syncVariantStockWithBatches(v.getId());
        flushClearResetStats();
        Pageable pageable = PageRequest.of(0, pageSize);
        long stmts = measurePreparedStatements(() ->
                assertThat(inventoryReceiptService.listReceipts(pageable).getContent()).hasSize(pageSize));
        log.info("PHASE0C\treceipts_with_batches\tN_rows={}\tpageSize={}\tprepareStatements={}",
                pageSize, pageSize, stmts);
        assertThat(stmts).isPositive();
    }
}
