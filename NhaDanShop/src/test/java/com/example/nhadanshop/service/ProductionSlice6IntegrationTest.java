package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryProjectionResponse;
import com.example.nhadanshop.dto.InventoryStockReport;
import com.example.nhadanshop.dto.InventoryStockReportRow;
import com.example.nhadanshop.dto.production.ProductionRecipeDtos.*;
import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Slice 6 integration tests: Production recipes & completed-on-create production orders.
 * Uses Hibernate schema (Flyway disabled) — same entities as Postgres.
 */
@DataJpaTest(
        showSql = false,
        properties = {
                "spring.flyway.enabled=false",
                "spring.jpa.hibernate.ddl-auto=create-drop"
        }
)
@Import({
        ProductionOrderService.class,
        ProductionRecipeService.class,
        StockMutationService.class,
        InvoiceNumberGenerator.class,
        InventoryProjectionService.class,
        InventoryStockService.class,
        InvoiceService.class,
        ProductBatchService.class,
        ProductVariantService.class,
        ProductComboService.class,
        CustomerService.class,
        PosScanService.class,
        ProductionSlice6IntegrationTest.TestBeans.class
})
class ProductionSlice6IntegrationTest {

    @Autowired
    ProductionOrderService productionOrderService;
    @Autowired
    ProductionRecipeService productionRecipeService;
    @Autowired
    InventoryProjectionService inventoryProjectionService;
    @Autowired
    InventoryStockService inventoryStockService;
    @Autowired
    InvoiceService invoiceService;
    @Autowired
    Clock businessClock;

    @Autowired
    StockMutationService stockMutationService;

    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired ProductBatchRepository batchRepository;
    @Autowired InventoryMovementRepository movementRepository;
    @Autowired ProductionOrderRepository productionOrderRepository;
    @Autowired ProductionOrderAllocationRepository orderAllocationRepository;
    @Autowired SalesInvoiceRepository salesInvoiceRepository;

    @MockBean
    InvoiceNumberGenerator invoiceNumberGenerator;

    @MockBean
    CustomerLoyaltyService customerLoyaltyService;

    @BeforeEach
    void auth() {
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin-test", "n/a", List.of()));
        when(invoiceNumberGenerator.nextInvoiceNo()).thenAnswer(inv -> "INV-S6-" + System.nanoTime());
        when(invoiceNumberGenerator.nextProductionOrderNo()).thenAnswer(inv -> "PROD-S6-" + System.nanoTime());
    }

    /** Recipe CRUD + archive; archived recipe cannot produce. */
    @Test
    void recipes_create_patch_archive_and_orders_reject_archived() {
        ProductVariant out = createVariant(false, true, true, "OUT-ARCH-R");
        ProductVariant raw = createVariant(false, true, true, "RAW-ARCH-R");

        ProductionRecipeResponse created = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-ARCH-" + System.nanoTime(),
                "Arch test",
                out.getProduct().getId(),
                out.getId(),
                10,
                true,
                BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 1, "u", 0)))
        );

        PatchProductionRecipeRequest patch = new PatchProductionRecipeRequest("Renamed recipe", null, null, null, null);
        ProductionRecipeResponse patched = productionRecipeService.patch(created.id(), patch);
        assertEquals("Renamed recipe", patched.name());

        productionRecipeService.archive(created.id());
        ProductionRecipeResponse archivedRec = productionRecipeService.get(created.id());
        assertTrue(archivedRec.archived());

        createBatch(raw, remaining(10), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                productionOrderService.create(new CreateProductionOrderRequest(created.id(), 10, BigDecimal.ZERO, null)));
        assertTrue(ex.getMessage().contains("archive") || ex.getMessage().contains("Đã archive") || ex.getMessage().contains("active"));
    }

    /** Non-sellable raw input OK when active; inactive component variant rejected at recipe save. */
    @Test
    void raw_non_sellable_allowed_but_inactive_component_rejected() {
        ProductVariant rawNs = createVariant(false, true, false, "RAW-NS-" + nano());
        mkSimpleRecipe(rawNs);

        ProductVariant outReject = createVariant(false, true, true, "OUT-REJ-" + nano());
        ProductVariant inactiveRaw = createVariant(false, false, true, "INRAW-" + nano());
        IllegalArgumentException inactiveVar = assertThrows(IllegalArgumentException.class, () ->
                productionRecipeService.create(new CreateProductionRecipeRequest(
                        "RCP-BADVAR-" + nano(), "Bad",
                        outReject.getProduct().getId(), outReject.getId(),
                        10, true, BigDecimal.ZERO,
                        List.of(new ComponentLine(
                                inactiveRaw.getProduct().getId(), inactiveRaw.getId(),
                                1, "u", 0)))));
        assertTrue(inactiveVar.getMessage().contains("active") || inactiveVar.getMessage().contains("kinh doanh"));

        ProductVariant outOk = createVariant(false, true, true, "OUT-NS-" + nano());
        productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-OKNS-" + nano(), "OK ns", outOk.getProduct().getId(), outOk.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(rawNs.getProduct().getId(), rawNs.getId(), 1, "u", 0))));
    }

    /** Batch eligibility: only active, non-expired, positive remaining; blocked/voided/depleted/archived excluded. */
    @Test
    void batch_eligibility_filters_status_and_expiry() {
        ProductVariant raw = createVariant(false, true, true, "RAW-ELIG-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-ELIG-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-ELIG-" + nano(), "E", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 1, "u", 0))));

        createBatch(raw, remaining(5), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        createBatch(raw, remaining(20), cost(1000), LocalDate.now(businessClock).minusDays(1), ProductBatch.STATUS_ACTIVE);
        createBatch(raw, remaining(100), cost(1000), expFuture(), ProductBatch.STATUS_BLOCKED);
        createBatch(raw, remaining(100), cost(1000), expFuture(), ProductBatch.STATUS_VOIDED);
        createBatch(raw, remaining(100), cost(1000), expFuture(), ProductBatch.STATUS_DEPLETED);
        createBatch(raw, remaining(100), cost(1000), expFuture(), ProductBatch.STATUS_ARCHIVED);
        sync(raw.getId());

        ProductionPreviewResponse prev = productionOrderService.preview(new ProductionPreviewRequest(recipe.id(), 5, null));
        assertEquals(1, prev.components().size());
        assertEquals(5, prev.components().getFirst().requiredQty());
        assertEquals(5, prev.components().getFirst().availableQty());
        assertEquals(5, prev.maxProducibleQty());
        assertTrue(prev.components().getFirst().allocations().size() >= 1);

        assertThrows(IllegalStateException.class, () ->
                productionOrderService.create(new CreateProductionOrderRequest(recipe.id(), 10, null, null)));
    }

    /** outputMustBeSellable true rejects isSellable=false output; false allows; does not mutate variant flag. */
    @Test
    void output_must_be_sellable_rules_and_no_flag_mutation() {
        ProductVariant outNs = createVariant(false, true, false, "OUTMUT-" + nano());
        ProductVariant raw = createVariant(false, true, true, "RAWMUT-" + nano());
        createBatch(raw, remaining(50), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        assertThrows(IllegalArgumentException.class, () ->
                productionRecipeService.create(new CreateProductionRecipeRequest(
                        "RCP-BADOUT-" + nano(), "X", outNs.getProduct().getId(), outNs.getId(), 10, true, BigDecimal.ZERO,
                        List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 1, "u", 0)))));

        ProductionRecipeResponse ok = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-OKOUT-" + nano(), "Y", outNs.getProduct().getId(), outNs.getId(), 10, false, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 1, "u", 0))));

        Boolean before = variantRepository.findById(outNs.getId()).orElseThrow().getIsSellable();
        productionOrderService.create(new CreateProductionOrderRequest(ok.id(), 5, BigDecimal.ZERO, null));
        Boolean after = variantRepository.findById(outNs.getId()).orElseThrow().getIsSellable();
        assertEquals(before, after);
    }

    /** Aggregated maxProducibleQty with duplicate component rows for same variant. */
    @Test
    void preview_max_produce_aggregates_duplicate_variant_lines() {
        ProductVariant raw = createVariant(false, true, true, "RAW-DUP-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-DUP-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-DUP-" + nano(), "Dup", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(
                        new ComponentLine(raw.getProduct().getId(), raw.getId(), 3, "u", 0),
                        new ComponentLine(raw.getProduct().getId(), raw.getId(), 2, "u", 1)
                )));

        createBatch(raw, remaining(10), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        ProductionPreviewResponse prev = productionOrderService.preview(new ProductionPreviewRequest(recipe.id(), 1, null));
        // Demand per recipe output unit = 3 + 2 = 5; pool has 10 → floor(10 / 5) = 2
        assertEquals(2, prev.maxProducibleQty());
    }

    /** Full create: consume, output batch, cost, expiry, stock sync, movements, allocations. */
    @Test
    void create_completes_order_with_movements_and_allocations() {
        ProductVariant raw = createVariant(false, true, true, "RAW-FULL-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-FULL-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-FULL-" + nano(), "Full", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 2, "u", 0))));

        createBatch(raw, remaining(4), new BigDecimal("5000"), LocalDate.now(businessClock).plusDays(20), ProductBatch.STATUS_ACTIVE);
        createBatch(raw, remaining(10), new BigDecimal("7000"), LocalDate.now(businessClock).plusDays(5), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        int rawStockBefore = variantRepository.findById(raw.getId()).orElseThrow().getStockQty();
        int outStockBefore = variantRepository.findById(out.getId()).orElseThrow().getStockQty();

        BigDecimal overhead = new BigDecimal("30.00");
        ProductionOrderResponse ord = productionOrderService.create(
                new CreateProductionOrderRequest(recipe.id(), 4, overhead, "note"));

        assertEquals(ProductionOrder.STATUS_COMPLETED, ord.status());
        assertNotNull(ord.outputBatchId());
        assertNotNull(ord.outputBatchCode());

        ProductBatch outBatch = batchRepository.findById(ord.outputBatchId()).orElseThrow();
        assertEquals(ord.id(), outBatch.getProductionOrder().getId());
        assertEquals(4, outBatch.getImportQty());
        assertEquals(4, outBatch.getRemainingQty());

        // FEFO: nearer expiry (+5 d) consumes first — all 8 units from cheaper-date batch @ 7000
        BigDecimal expectedConsumed = new BigDecimal("7000").multiply(BigDecimal.valueOf(8));
        BigDecimal expectedUnit = expectedConsumed.add(overhead)
                .divide(BigDecimal.valueOf(4), 2, java.math.RoundingMode.HALF_UP);
        assertEquals(0, ord.outputUnitCost().compareTo(expectedUnit));

        assertEquals(LocalDate.now(businessClock).plusDays(5), outBatch.getExpiryDate());

        assertEquals(rawStockBefore - 8, variantRepository.findById(raw.getId()).orElseThrow().getStockQty());
        assertEquals(outStockBefore + 4, variantRepository.findById(out.getId()).orElseThrow().getStockQty());

        long consumeMoves = movementRepository.findAll().stream()
                .filter(m -> ProductionOrderService.M_CONSUME.equals(m.getSourceType())).count();
        long outputMoves = movementRepository.findAll().stream()
                .filter(m -> ProductionOrderService.M_OUTPUT.equals(m.getSourceType())).count();
        assertTrue(consumeMoves >= 1);
        assertEquals(1, outputMoves);

        assertTrue(orderAllocationRepository.count() > 0);
    }

    /** Insufficient stock: no order row, no movements. */
    @Test
    void create_fails_cleanly_when_insufficient_stock() {
        ProductVariant raw = createVariant(false, true, true, "RAW-LOW-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-LOW-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-LOW-" + nano(), "Low", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 10, "u", 0))));

        createBatch(raw, remaining(3), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        long movesBefore = movementRepository.count();
        long ordersBefore = productionOrderRepository.count();

        assertThrows(IllegalStateException.class, () ->
                productionOrderService.create(new CreateProductionOrderRequest(recipe.id(), 1, null, null)));

        assertEquals(movesBefore, movementRepository.count());
        assertEquals(ordersBefore, productionOrderRepository.count());
    }

    /** Void restores raw, drains output, writes void movements; second void idempotent; partial output rejects void. */
    @Test
    void void_order_restores_idempotent_void_rejects_partial_output() {
        ProductVariant raw = createVariant(false, true, true, "RAW-VOID-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-VOID-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-VOID-" + nano(), "V", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 5, "u", 0))));

        createBatch(raw, remaining(20), cost(1111), LocalDate.now(businessClock).plusDays(9), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        ProductBatch rawB = batchRepository.findProductionInputBatchesForPreview(raw.getId(), LocalDate.now(businessClock)).getFirst();

        ProductionOrderResponse ord = productionOrderService.create(
                new CreateProductionOrderRequest(recipe.id(), 2, BigDecimal.ZERO, null));
        assertEquals(10, batchRepository.findById(rawB.getId()).orElseThrow().getRemainingQty());

        ProductionOrderVoidRequest voidReq = new ProductionOrderVoidRequest("mistake", null);
        ProductionOrderResponse voided = productionOrderService.voidOrder(ord.id(), voidReq);

        assertEquals(ProductionOrder.STATUS_VOIDED, voided.status());
        assertEquals(20, batchRepository.findById(rawB.getId()).orElseThrow().getRemainingQty());

        ProductBatch outB = batchRepository.findById(ord.outputBatchId()).orElseThrow();
        assertEquals(0, outB.getRemainingQty());
        assertEquals(ProductBatch.STATUS_DEPLETED, outB.getStatus());

        long vr = movementRepository.findAll().stream()
                .filter(m -> ProductionOrderService.M_VOID_RESTORE.equals(m.getSourceType())).count();
        assertTrue(vr >= 1);
        long vo = movementRepository.findAll().stream()
                .filter(m -> ProductionOrderService.M_VOID_OUTPUT.equals(m.getSourceType())).count();
        assertEquals(1, vo);

        ProductionOrderResponse voidAgain = productionOrderService.voidOrder(ord.id(), voidReq);
        assertEquals(ProductionOrder.STATUS_VOIDED, voidAgain.status());

        ProductionOrderResponse ord2 = productionOrderService.create(
                new CreateProductionOrderRequest(recipe.id(), 1, BigDecimal.ZERO, null));
        ProductBatch outBatch2 = batchRepository.findById(ord2.outputBatchId()).orElseThrow();
        outBatch2.setRemainingQty(outBatch2.getImportQty() - 1);
        batchRepository.save(outBatch2);

        assertThrows(IllegalStateException.class, () -> productionOrderService.voidOrder(ord2.id(), voidReq));
    }

    /** Inventory period report closing stock aligns with variant stockQty after production (checklist 49). */
    @Test
    void inventory_stock_report_closing_matches_stock_after_production() {
        ProductVariant raw = createVariant(false, true, true, "RAW-INVREP-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-INVREP-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-INVREP-" + nano(),
                "Inv rep",
                out.getProduct().getId(),
                out.getId(),
                10,
                true,
                BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 2, "u", 0))));

        createBatch(raw, remaining(20), cost(2000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        productionOrderService.create(new CreateProductionOrderRequest(recipe.id(), 4, BigDecimal.ZERO, null));

        LocalDate today = LocalDate.now(businessClock);
        LocalDate from = today.withDayOfMonth(1);
        LocalDate to = today;

        InventoryStockReport report = inventoryStockService.getStockReport(from, to);
        ProductVariant rawV = variantRepository.findById(raw.getId()).orElseThrow();
        ProductVariant outV = variantRepository.findById(out.getId()).orElseThrow();

        InventoryStockReportRow ordOut = report.rows().stream()
                .filter(r -> out.getId().equals(r.variantId())).findFirst().orElseThrow();
        assertEquals(outV.getStockQty(), ordOut.closingStock());

        InventoryStockReportRow ordRaw = report.rows().stream()
                .filter(r -> raw.getId().equals(r.variantId())).findFirst().orElseThrow();
        assertEquals(rawV.getStockQty(), ordRaw.closingStock());
    }

    /** Combined list filters: recipe by name/code fragment; order by order number and recipe id. */
    @Test
    void production_recipe_and_order_list_filters() {
        ProductVariant raw = createVariant(false, true, true, "RAW-FLT-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-FLT-" + nano());
        String codeFrag = "RCP-FLT-" + nano();
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                codeFrag,
                "FilterMe " + nano(),
                out.getProduct().getId(),
                out.getId(),
                10,
                true,
                BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 2, "u", 0))));
        createBatch(raw, remaining(30), cost(2000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());
        ProductionOrderResponse ord = productionOrderService.create(
                new CreateProductionOrderRequest(recipe.id(), 1, BigDecimal.ZERO, null));

        assertEquals(1,
                productionRecipeService.list(null, null, null, null, "FilterMe", PageRequest.of(0, 20)).getTotalElements());
        assertEquals(1,
                productionRecipeService.list(null, null, null, out.getId(), codeFrag, PageRequest.of(0, 20)).getTotalElements());

        assertEquals(1, productionOrderService.list(
                PageRequest.of(0, 20),
                ProductionOrder.STATUS_COMPLETED,
                null,
                null,
                ord.orderNo(),
                null,
                null).getTotalElements());

        assertEquals(1, productionOrderService.list(
                PageRequest.of(0, 20),
                ProductionOrder.STATUS_COMPLETED,
                recipe.id(),
                null,
                null,
                null,
                null).getTotalElements());
    }

    /** Inventory projection onHand reflects consumption and output creation. */
    @Test
    void inventory_projection_reflects_production_moves() {
        ProductVariant raw = createVariant(false, true, true, "RAW-PRJ-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-PRJ-" + nano());
        ProductionRecipeResponse recipe = productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-PRJ-" + nano(), "Proj", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 10, "u", 0))));

        createBatch(raw, remaining(30), cost(2000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        InventoryProjectionResponse beforeRaw = inventoryProjectionService.getProjection(raw.getId());
        InventoryProjectionResponse beforeOut = inventoryProjectionService.getProjection(out.getId());

        ProductionOrderResponse ord = productionOrderService.create(
                new CreateProductionOrderRequest(recipe.id(), 2, BigDecimal.ZERO, null));

        InventoryProjectionResponse afterRaw = inventoryProjectionService.getProjection(raw.getId());
        InventoryProjectionResponse afterOut = inventoryProjectionService.getProjection(out.getId());

        assertEquals(beforeRaw.onHand() - 20, afterRaw.onHand());
        assertEquals(beforeOut.onHand() + ord.outputQty(), afterOut.onHand());

        productionOrderService.voidOrder(ord.id(), new ProductionOrderVoidRequest("cleanup", null));
        InventoryProjectionResponse endRaw = inventoryProjectionService.getProjection(raw.getId());
        InventoryProjectionResponse endOut = inventoryProjectionService.getProjection(out.getId());
        assertEquals(beforeRaw.onHand(), endRaw.onHand());
        assertEquals(beforeOut.onHand(), endOut.onHand());
    }

    /** Preview does not mutate stock or append movements (read-only FEFO). */
    @Test
    void preview_is_read_only() {
        ProductVariant raw = createVariant(false, true, true, "RAW-RDO-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-RDO-" + nano());
        ProductionRecipeResponse recipe = mkSimpleRecipeWithOutput(out, raw);

        createBatch(raw, remaining(20), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        ProductBatch b = batchRepository.findProductionInputBatchesForPreview(raw.getId(), LocalDate.now(businessClock)).getFirst();
        int remainingBefore = b.getRemainingQty();
        long mvBefore = movementRepository.count();

        productionOrderService.preview(new ProductionPreviewRequest(recipe.id(), 3, null));

        assertEquals(remainingBefore, batchRepository.findById(b.getId()).orElseThrow().getRemainingQty());
        assertEquals(mvBefore, movementRepository.count());
    }

    /** Slice 6B: selling the production output batch by exact batchId uses weighted output unit cost. */
    @Test
    void slice6b_exact_invoice_uses_production_output_batch_cost() {
        ProductVariant raw = createVariant(false, true, true, "RAW-S6B-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-S6B-" + nano());
        ProductionRecipeResponse recipe = mkSimpleRecipeWithOutput(out, raw);

        createBatch(raw, remaining(100), cost(3000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        ProductionOrderResponse ord = productionOrderService.create(new CreateProductionOrderRequest(recipe.id(), 2, BigDecimal.ZERO, null));
        assertNotNull(ord.outputBatchId());

        ProductBatch outBatch = batchRepository.findById(ord.outputBatchId()).orElseThrow();
        sync(out.getId());

        SalesInvoiceResponse inv = invoiceService.createInvoice(new SalesInvoiceRequest(
                null, null, null, null,
                List.of(new InvoiceItemRequest(out.getProduct().getId(), 1, null, out.getId(), null, ord.outputBatchId())), null));

        SalesInvoice persisted = salesInvoiceRepository.findById(inv.id()).orElseThrow();
        SalesInvoiceItem line = persisted.getItems().getFirst();
        assertEquals(0, outBatch.getCostPrice().compareTo(line.getUnitCostSnapshot()));
        assertEquals(1, line.getBatchAllocations().size());
        assertEquals(ord.outputBatchId(), line.getBatchAllocations().getFirst().getBatch().getId());
    }

    /** Inactive raw product: batches exist but production input query ignores them. */
    @Test
    void simulate_ignores_batches_when_raw_product_not_active() {
        ProductVariant raw = createVariant(false, true, true, "RAW-PINA-" + nano());
        ProductVariant out = createVariant(false, true, true, "OUT-PINA-" + nano());
        ProductionRecipeResponse recipe = mkSimpleRecipeWithOutput(out, raw);
        createBatch(raw, remaining(100), cost(1000), expFuture(), ProductBatch.STATUS_ACTIVE);
        sync(raw.getId());

        Product inactive = raw.getProduct();
        inactive.setActive(false);
        productRepository.save(inactive);

        ProductionPreviewResponse prev = productionOrderService.preview(new ProductionPreviewRequest(recipe.id(), 1, null));
        assertEquals(0, prev.maxProducibleQty());
        assertEquals(0, prev.components().getFirst().availableQty());
    }

    // --- helpers -------------------------------------------------------------

    @TestConfiguration
    static class TestBeans {
        @Bean
        Clock businessClock() {
            return Clock.fixed(Instant.parse("2026-06-15T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }

    private static String nano() {
        return String.valueOf(System.nanoTime());
    }

    private LocalDate expFuture() {
        return LocalDate.now(businessClock).plusDays(365);
    }

    private ProductVariant createVariant(boolean productInactive, boolean variantActive, boolean sellable, String sku) {
        Category cat = new Category();
        cat.setName("Cat-" + sku);
        cat.setDescription("prod6");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product product = new Product();
        product.setCode("PC-" + sku);
        product.setName("Pn " + sku);
        product.setCategory(cat);
        product.setActive(!productInactive);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(sku);
        v.setVariantName("V " + sku);
        v.setSellUnit("unit");
        v.setPiecesPerUnit(1);
        v.setSellPrice(new BigDecimal("100000"));
        v.setCostPrice(new BigDecimal("50000"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(variantActive);
        v.setIsDefault(true);
        v.setIsSellable(sellable);
        return variantRepository.save(v);
    }

    private ProductionRecipeResponse mkSimpleRecipe(ProductVariant raw) {
        ProductVariant out = createVariant(false, true, true, "ROUT-" + nano());
        return productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-SIMPLE-" + nano(), "Simple", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 1, "unit", 0))));
    }

    private ProductionRecipeResponse mkSimpleRecipeWithOutput(ProductVariant out, ProductVariant raw) {
        return productionRecipeService.create(new CreateProductionRecipeRequest(
                "RCP-RDO-" + nano(), "Rdo", out.getProduct().getId(), out.getId(), 10, true, BigDecimal.ZERO,
                List.of(new ComponentLine(raw.getProduct().getId(), raw.getId(), 5, "u", 0))));
    }

    private static int remaining(int r) {
        return r;
    }

    private static BigDecimal cost(int c) {
        return BigDecimal.valueOf(c);
    }

    private ProductBatch createBatch(ProductVariant variant, int remainingQty, BigDecimal cost,
                                     LocalDate expiry, String status) {
        ProductBatch b = new ProductBatch();
        b.setProduct(variant.getProduct());
        b.setVariant(variant);
        b.setBatchCode("BAT-" + System.nanoTime());
        b.setExpiryDate(expiry);
        b.setImportQty(remainingQty);
        b.setRemainingQty(remainingQty);
        b.setCostPrice(cost);
        b.setStatus(status);
        return batchRepository.save(b);
    }

    private void sync(Long variantId) {
        stockMutationService.syncVariantStockWithBatches(variantId);
    }
}
