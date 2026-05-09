package com.example.nhadanshop.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.example.nhadanshop.dto.production.ProductionRecipeDtos;
import com.example.nhadanshop.dto.production.ProductionRecipeDtos.*;
import com.example.nhadanshop.exception.ProductionShortageException;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ProductionOrderService {

    public static final String M_CONSUME = "production_consume";
    public static final String M_OUTPUT = "production_output";
    public static final String M_VOID_RESTORE = "production_void_restore";
    public static final String M_VOID_OUTPUT = "production_void_output";

    private final ProductionOrderRepository orderRepo;
    private final ProductionOrderComponentRepository orderComponentRepo;
    private final ProductionOrderAllocationRepository allocationRepo;
    private final ProductionRecipeRepository recipeRepo;
    private final ProductionRecipeComponentRepository recipeComponentRepo;
    private final ProductBatchRepository batchRepo;
    private final ProductVariantRepository variantRepo;
    private final StockMutationService stockMutationService;
    private final InventoryMovementRepository movementRepo;
    private final InvoiceNumberGenerator invoiceNumberGenerator;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private static final Set<String> ORDER_SORT_WHITELIST = Set.of(
            "id", "orderNo", "status", "outputQty", "createdAt");

    @Transactional(readOnly = true)
    public ProductionPreviewResponse preview(ProductionPreviewRequest req) {
        ProductionRecipe recipe = recipeRepo.findById(req.recipeId())
                .orElseThrow(() -> new EntityNotFoundException("recipe " + req.recipeId()));
        validateRecipe(recipe);
        Sim sim = simulate(recipe, req.outputQty(), false);
        BigDecimal overhead = overheadFor(recipe, req.overheadCost());
        BigDecimal unit = sim.consumed.add(overhead)
                .divide(BigDecimal.valueOf(req.outputQty()), 4, RoundingMode.HALF_UP).setScale(2, RoundingMode.HALF_UP);
        LocalDate productionDate = LocalDate.now(clock);
        ProductVariant outVar = recipe.getOutputVariant();
        LocalDate outExpDate = resolveOutputExpiryDate(sim.minExpiry, outVar, productionDate);
        String expIso = outExpDate + "T00:00:00";
        return new ProductionPreviewResponse(
                recipe.getId(),
                req.outputQty(),
                Boolean.TRUE.equals(recipe.getOutputMustBeSellable()),
                overhead,
                sim.consumed,
                unit,
                expIso,
                sim.maxProduce,
                sim.previewRows
        );
    }

    @Transactional
    public ProductionOrderResponse create(CreateProductionOrderRequest req) {
        ProductionRecipe recipe = recipeRepo.findById(req.recipeId())
                .orElseThrow(() -> new EntityNotFoundException("recipe " + req.recipeId()));
        validateRecipe(recipe);

        Sim cheap = simulate(recipe, req.outputQty(), false);
        if (!cheap.feasible) {
            throw new ProductionShortageException("Không đủ tồn nguyên liệu", cheap.shortages());
        }

        for (Long vid : sortedLockVariantIds(recipe)) {
            variantRepo.findByIdForUpdate(vid).orElseThrow(() -> new EntityNotFoundException("variant " + vid));
        }

        Sim locked = simulate(recipe, req.outputQty(), true);
        if (!locked.feasible) {
            throw new ProductionShortageException("Không đủ tồn nguyên liệu (khóa lô)", locked.shortages());
        }

        validateOutputVariant(recipe.getOutputVariant(), Boolean.TRUE.equals(recipe.getOutputMustBeSellable()));

        BigDecimal overhead = overheadFor(recipe, req.overheadCost());
        BigDecimal unitCost = locked.consumed.add(overhead)
                .divide(BigDecimal.valueOf(req.outputQty()), 8, RoundingMode.HALF_UP).setScale(2, RoundingMode.HALF_UP);
        LocalDate productionDate = LocalDate.now(clock);
        LocalDate outExp = resolveOutputExpiryDate(locked.minExpiry, recipe.getOutputVariant(), productionDate);

        ProductionOrder od = new ProductionOrder();
        od.setOrderNo(invoiceNumberGenerator.nextProductionOrderNo());
        od.setRecipe(recipe);
        od.setStatus(ProductionOrder.STATUS_COMPLETED);
        od.setOutputProduct(recipe.getOutputVariant().getProduct());
        od.setOutputVariant(recipe.getOutputVariant());
        od.setOutputQty(req.outputQty());
        od.setOutputMustBeSellable(Boolean.TRUE.equals(recipe.getOutputMustBeSellable()));
        od.setOverheadCost(overhead);
        od.setOutputUnitCost(unitCost);
        od.setOutputExpiryDate(outExp);
        od.setRecipeSnapshotJson(buildRecipeSnapshotJson(recipe));
        od.setNote(req.note());
        od = orderRepo.save(od);

        applyConsumes(od, locked.consumeLines());
        createOutputBatch(od, recipe, unitCost, outExp);

        ProductVariant costUpdate = variantRepo.findById(recipe.getOutputVariant().getId()).orElseThrow();
        costUpdate.setCostPrice(unitCost);
        variantRepo.save(costUpdate);

        return mapOrder(orderRepo.findById(od.getId()).orElseThrow(), true);
    }

    @Transactional
    public ProductionOrderResponse voidOrder(Long id, ProductionOrderVoidRequest req) {
        ProductionOrder od = orderRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("order " + id));
        if (ProductionOrder.STATUS_VOIDED.equals(od.getStatus())) {
            return mapOrder(od, true);
        }
        if (!ProductionOrder.STATUS_COMPLETED.equals(od.getStatus())) {
            throw new IllegalStateException("Chỉ void được order completed");
        }

        ProductBatch out = od.getOutputBatch();
        if (out == null) {
            throw new IllegalStateException("Thiếu output batch");
        }
        if (out.getRemainingQty() != out.getImportQty()) {
            throw new IllegalStateException("Đã tiêu thụ một phần lô thành phẩm — không void được");
        }

        List<ProductionOrderComponent> ocs = orderComponentRepo.findByOrderIdOrderByIdAsc(id);
        SortedSet<Long> vids = new TreeSet<>();
        vids.add(od.getOutputVariant().getId());
        for (ProductionOrderComponent oc : ocs) {
            vids.add(oc.getVariantId());
        }
        for (Long vid : vids) {
            variantRepo.findByIdForUpdate(vid).orElseThrow(() -> new EntityNotFoundException("variant " + vid));
        }

        Map<Long, List<StockMutationService.BatchStockChange>> deltasByVariant = new LinkedHashMap<>();
        for (ProductionOrderComponent oc : ocs) {
            for (ProductionOrderAllocation a : allocationRepo.findByOrderComponent_IdOrderByIdAsc(oc.getId())) {
                deltasByVariant
                        .computeIfAbsent(oc.getVariantId(), k -> new ArrayList<>())
                        .add(StockMutationService.BatchStockChange.delta(a.getBatch().getId(), a.getQty()));
            }
        }
        for (Map.Entry<Long, List<StockMutationService.BatchStockChange>> e : deltasByVariant.entrySet()) {
            if (e.getValue().isEmpty()) continue;
            stockMutationService.updateStockWithBatches(e.getKey(), e.getValue());
        }

        Long outVid = od.getOutputVariant().getId();
        for (ProductionOrderComponent oc : ocs) {
            Long vid = oc.getVariantId();
            for (ProductionOrderAllocation a : allocationRepo.findByOrderComponent_IdOrderByIdAsc(oc.getId())) {
                appendMove(vid, a.getBatch().getId(), a.getQty(), M_VOID_RESTORE,
                        "production-order:" + id + ":void:restore:v:" + vid + ":b:" + a.getBatch().getId(),
                        "void restore " + od.getOrderNo());
            }
            stockMutationService.syncVariantStockWithBatches(vid);
        }

        stockMutationService.updateStockWithBatches(outVid,
                List.of(StockMutationService.BatchStockChange.delta(out.getId(), -od.getOutputQty())));
        appendMove(outVid, out.getId(), -od.getOutputQty(), M_VOID_OUTPUT,
                "production-order:" + id + ":void:output", "void output " + od.getOrderNo());
        stockMutationService.syncVariantStockWithBatches(outVid);

        ProductBatch refreshed = batchRepo.findAllByIdInForUpdate(List.of(out.getId())).stream().findFirst()
                .orElseThrow(() -> new EntityNotFoundException("batch " + out.getId()));
        if (refreshed.getRemainingQty() == 0) {
            refreshed.setStatus(ProductBatch.STATUS_DEPLETED);
            batchRepo.save(refreshed);
        }

        od.setStatus(ProductionOrder.STATUS_VOIDED);
        od.setVoidedAt(LocalDateTime.now(clock));
        od.setVoidReason(req != null && StringUtils.hasText(req.reason()) ? req.reason().trim() : null);
        od = orderRepo.save(od);

        return mapOrder(od, true);
    }

    @Transactional(readOnly = true)
    public ProductionOrderResponse get(Long id) {
        return mapOrder(orderRepo.findById(id).orElseThrow(() -> new EntityNotFoundException("order " + id)), true);
    }

    @Transactional(readOnly = true)
    public Page<ProductionOrderResponse> list(
            Pageable pg,
            String status,
            Long recipeId,
            Long variantId,
            String query,
            LocalDate dateFrom,
            LocalDate dateTo) {
        Pageable safePageable = sanitizePageable(pg);
        String q = StringUtils.hasText(query) ? query.trim() : null;
        String st = normalizeStatus(status);
        LocalDateTime fromDt = dateFrom != null ? dateFrom.atStartOfDay() : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime toDt = dateTo != null ? dateTo.atTime(LocalTime.MAX) : LocalDateTime.of(2100, 12, 31, 23, 59, 59);
        if (q == null) {
            return orderRepo.searchOrdersWithoutText(st, recipeId, variantId, fromDt, toDt, safePageable)
                    .map(o -> mapOrder(o, false));
        }
        return orderRepo.searchOrdersWithText(st, recipeId, variantId, fromDt, toDt, q, safePageable)
                .map(o -> mapOrder(o, false));
    }

    private String normalizeStatus(String status) {
        if (!StringUtils.hasText(status)) {
            return null;
        }
        String normalized = status.trim().toLowerCase(Locale.ROOT);
        if (!ProductionOrder.STATUS_COMPLETED.equals(normalized) && !ProductionOrder.STATUS_VOIDED.equals(normalized)) {
            throw new IllegalArgumentException("status không hợp lệ: " + status);
        }
        return normalized;
    }

    private Pageable sanitizePageable(Pageable pageable) {
        int page = Math.max(0, pageable.getPageNumber());
        int size = Math.min(Math.max(1, pageable.getPageSize()), 100);
        Sort sort = Sort.unsorted();
        for (Sort.Order order : pageable.getSort()) {
            if (ORDER_SORT_WHITELIST.contains(order.getProperty())) {
                sort = sort.and(Sort.by(order));
            }
        }
        if (sort.isUnsorted()) {
            sort = Sort.by(Sort.Order.desc("createdAt"));
        }
        return PageRequest.of(page, size, sort);
    }

    /** Working pool for production FEFO simulation (remaining qty mutated). */
    private static final class MutBatch {
        final long id;
        int rem;
        final LocalDate exp;
        final BigDecimal unitCost;
        final String batchCode;

        MutBatch(ProductBatch b) {
            this.id = b.getId();
            this.rem = b.getRemainingQty();
            this.exp = b.getExpiryDate();
            BigDecimal cp = b.getCostPrice();
            this.unitCost = cp != null ? cp : BigDecimal.ZERO;
            this.batchCode = b.getBatchCode();
        }
    }

    private List<MutBatch> loadPool(Long variantId, boolean locked) {
        LocalDate asOf = LocalDate.now(clock);
        List<ProductBatch> bs = locked ? batchRepo.findProductionInputBatchesForUpdate(variantId, asOf)
                : batchRepo.findProductionInputBatchesForPreview(variantId, asOf);
        List<MutBatch> rows = new ArrayList<>();
        for (ProductBatch b : bs) {
            rows.add(new MutBatch(b));
        }
        return rows;
    }

    private Sim simulate(ProductionRecipe recipe, int outputQty, boolean locked) {
        List<ProductionRecipeComponent> rcs =
                recipeComponentRepo.findByRecipeIdOrderBySortOrderAscIdAsc(recipe.getId());
        if (rcs.isEmpty()) {
            return new Sim(BigDecimal.ZERO, null, false, 0, List.of(), List.of(), List.of());
        }

        Map<Long, List<MutBatch>> pools = new LinkedHashMap<>();
        for (ProductionRecipeComponent rc : rcs) {
            long vid = rc.getVariant().getId();
            pools.putIfAbsent(vid, loadPool(vid, locked));
        }

        Map<Long, Integer> qtyNeededPerRecipeOutput = new HashMap<>();
        for (ProductionRecipeComponent rc : rcs) {
            qtyNeededPerRecipeOutput.merge(rc.getVariant().getId(), rc.getQtyPerOutput(), Integer::sum);
        }
        int maxProduce = Integer.MAX_VALUE;
        for (Map.Entry<Long, Integer> e : qtyNeededPerRecipeOutput.entrySet()) {
            List<MutBatch> pool = pools.get(e.getKey());
            long sumLong = pool.stream().mapToLong(m -> m.rem).sum();
            if (sumLong > Integer.MAX_VALUE) sumLong = Integer.MAX_VALUE;
            int sum = (int) sumLong;
            int per = e.getValue();
            if (per <= 0) {
                maxProduce = 0;
                break;
            }
            maxProduce = Math.min(maxProduce, sum / per);
        }
        if (maxProduce == Integer.MAX_VALUE) {
            maxProduce = 0;
        }

        BigDecimal consumed = BigDecimal.ZERO;
        LocalDate globMin = null;
        boolean feasible = true;
        List<PreviewComponentDto> previewRows = new ArrayList<>();
        List<ConsumeLine> consumeLines = new ArrayList<>();
        List<ProductionShortageDetailDto> shortages = new ArrayList<>();

        for (ProductionRecipeComponent rc : rcs) {
            long vid = rc.getVariant().getId();
            List<MutBatch> pool = pools.get(vid);
            int need;
            try {
                need = Math.multiplyExact(rc.getQtyPerOutput(), outputQty);
            } catch (ArithmeticException ex) {
                feasible = false;
                break;
            }
            int availableBefore = pool.stream().mapToInt(m -> m.rem).sum();
            SubtractResult sr = subtractFefo(pool, need);
            consumed = consumed.add(sr.lineCost());
            if (globMin == null || (sr.lineMinExpiry() != null && sr.lineMinExpiry().isBefore(globMin))) {
                globMin = sr.lineMinExpiry();
            }
            if (!sr.ok()) feasible = false;
            int missingQty = Math.max(0, need - availableBefore);
            if (missingQty > 0) {
                shortages.add(new ProductionShortageDetailDto(
                        rc.getProduct().getId(),
                        vid,
                        rc.getProduct().getName(),
                        rc.getVariant().getVariantName(),
                        rc.getVariant().getVariantCode(),
                        need,
                        availableBefore,
                        missingQty,
                        rc.getUnit()
                ));
            }

            List<PreviewAllocationDto> allocDtos = new ArrayList<>();
            for (Take t : sr.takes()) {
                MutBatch mb = lookup(pool, t.batchId());
                allocDtos.add(new PreviewAllocationDto(
                        t.batchId(),
                        mb != null ? mb.batchCode : "?",
                        t.qty(),
                        mb != null ? mb.unitCost : BigDecimal.ZERO,
                        mb != null && mb.exp != null ? mb.exp.toString() + "T00:00:00" : null
                ));
            }
            previewRows.add(new PreviewComponentDto(
                    rc.getProduct().getId(),
                    vid,
                    rc.getProduct().getName(),
                    rc.getVariant().getVariantName(),
                    rc.getVariant().getVariantCode(),
                    need,
                    availableBefore,
                    missingQty,
                    rc.getUnit(),
                    allocDtos
            ));

            consumeLines.add(new ConsumeLine(rc.getProduct().getId(), vid, rc.getUnit(), need, sr.takes()));
        }

        return new Sim(consumed, globMin, feasible, maxProduce, previewRows, consumeLines, shortages);
    }

    private MutBatch lookup(List<MutBatch> pool, long batchId) {
        for (MutBatch m : pool) {
            if (m.id == batchId) return m;
        }
        return null;
    }

    private record SubtractResult(boolean ok, BigDecimal lineCost, LocalDate lineMinExpiry, List<Take> takes) {}

    private record Take(long batchId, int qty) {}

    private record ConsumeLine(long productId, long variantId, String unit, int requiredQty, List<Take> takes) {}

    private SubtractResult subtractFefo(List<MutBatch> pool, int need) {
        BigDecimal lineCost = BigDecimal.ZERO;
        LocalDate lineMin = null;
        List<Take> takes = new ArrayList<>();
        int remaining = need;
        for (MutBatch b : pool) {
            if (remaining <= 0) break;
            if (b.rem <= 0) continue;
            int take = Math.min(b.rem, remaining);
            if (take <= 0) continue;
            lineCost = lineCost.add(b.unitCost.multiply(BigDecimal.valueOf(take)));
            if (lineMin == null || (b.exp != null && b.exp.isBefore(lineMin))) {
                lineMin = b.exp;
            }
            takes.add(new Take(b.id, take));
            b.rem -= take;
            remaining -= take;
        }
        boolean ok = remaining == 0;
        return new SubtractResult(ok, lineCost, lineMin, takes);
    }

    private record Sim(
            BigDecimal consumed,
            LocalDate minExpiry,
            boolean feasible,
            int maxProduce,
            List<PreviewComponentDto> previewRows,
            List<ConsumeLine> consumeLines,
            List<ProductionShortageDetailDto> shortages
    ) {}

    /**
     * HSD thành phẩm = min(HSD nguyên liệu tiêu hao, ngày SX + HSD chuẩn variant); không sửa {@code expiryDays} trên variant.
     */
    private LocalDate resolveOutputExpiryDate(LocalDate rawMinConsumedExpiry, ProductVariant outputVariant, LocalDate productionDate) {
        Integer shelfDays = outputVariant.getExpiryDays();
        LocalDate shelfCap = (shelfDays != null && shelfDays > 0)
                ? productionDate.plusDays(shelfDays.longValue())
                : null;
        if (rawMinConsumedExpiry != null && shelfCap != null) {
            return rawMinConsumedExpiry.isBefore(shelfCap) ? rawMinConsumedExpiry : shelfCap;
        }
        if (rawMinConsumedExpiry != null) {
            return rawMinConsumedExpiry;
        }
        if (shelfCap != null) {
            return shelfCap;
        }
        return productionDate;
    }

    private void validateRecipe(ProductionRecipe recipe) {
        if (Boolean.TRUE.equals(recipe.getArchived())) {
            throw new IllegalStateException("Công thức đã archive");
        }
        if (!Boolean.TRUE.equals(recipe.getActive())) {
            throw new IllegalStateException("Công thức không active");
        }
        List<ProductionRecipeComponent> rcs =
                recipeComponentRepo.findByRecipeIdOrderBySortOrderAscIdAsc(recipe.getId());
        if (rcs.isEmpty()) {
            throw new IllegalStateException("Công thức không có thành phần");
        }
    }

    private void validateOutputVariant(ProductVariant ov, boolean outputMustBeSellable) {
        if (!Boolean.TRUE.equals(ov.getProduct().getActive())) {
            throw new IllegalArgumentException("SP output phải active");
        }
        if (!Boolean.TRUE.equals(ov.getActive())) {
            throw new IllegalArgumentException("Biến thể output phải active");
        }
        if (outputMustBeSellable && !Boolean.TRUE.equals(ov.getIsSellable())) {
            throw new IllegalArgumentException("Biến thể output không bán được (isSellable=false)");
        }
    }

    private List<Long> sortedLockVariantIds(ProductionRecipe recipe) {
        SortedSet<Long> ids = new TreeSet<>();
        for (ProductionRecipeComponent c : recipeComponentRepo.findByRecipeIdOrderBySortOrderAscIdAsc(recipe.getId())) {
            ids.add(c.getVariant().getId());
        }
        ids.add(recipe.getOutputVariant().getId());
        return new ArrayList<>(ids);
    }

    private BigDecimal overheadFor(ProductionRecipe recipe, BigDecimal explicit) {
        if (explicit != null) {
            return explicit.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal o = recipe.getOverheadCost();
        return (o != null ? o : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private String buildRecipeSnapshotJson(ProductionRecipe recipe) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("recipeId", recipe.getId());
        root.put("recipeCode", recipe.getRecipeCode());
        root.put("name", recipe.getName());
        root.put("outputQty", recipe.getOutputQty());
        ArrayNode comps = root.putArray("components");
        for (ProductionRecipeComponent c : recipeComponentRepo.findByRecipeIdOrderBySortOrderAscIdAsc(recipe.getId())) {
            ObjectNode j = comps.addObject();
            j.put("productId", c.getProduct().getId());
            j.put("variantId", c.getVariant().getId());
            j.put("qtyPerOutput", c.getQtyPerOutput());
            j.put("unit", c.getUnit());
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void applyConsumes(ProductionOrder order, List<ConsumeLine> lines) {
        for (ConsumeLine line : lines) {
            ProductVariant componentVariant = variantRepo.findById(line.variantId())
                    .orElseThrow(() -> new EntityNotFoundException("variant " + line.variantId()));
            ProductionOrderComponent oc = new ProductionOrderComponent();
            oc.setOrder(order);
            oc.setProductId(line.productId());
            oc.setVariantId(line.variantId());
            oc.setUnit(line.unit());
            oc.setProductNameSnapshot(componentVariant.getProduct().getName());
            oc.setVariantNameSnapshot(componentVariant.getVariantName());
            oc.setVariantCodeSnapshot(componentVariant.getVariantCode());
            oc.setRequiredQty(line.requiredQty());
            int sum = line.takes().stream().mapToInt(Take::qty).sum();
            oc.setConsumedQty(sum);
            oc = orderComponentRepo.save(oc);

            List<StockMutationService.BatchStockChange> deltas = new ArrayList<>();
            for (Take t : line.takes()) {
                deltas.add(StockMutationService.BatchStockChange.delta(t.batchId(), -t.qty()));
            }
            if (!deltas.isEmpty()) {
                stockMutationService.updateStockWithBatches(line.variantId(), deltas);
            }
            for (int index = 0; index < line.takes().size(); index++) {
                Take t = line.takes().get(index);
                ProductBatch batch = batchRepo.findById(t.batchId()).orElseThrow();
                ProductionOrderAllocation a = new ProductionOrderAllocation();
                a.setOrderComponent(oc);
                a.setBatch(batch);
                a.setQty(t.qty());
                BigDecimal unitCost = batch.getCostPrice() != null ? batch.getCostPrice() : BigDecimal.ZERO;
                a.setUnitCost(unitCost);
                a.setTotalCostSnapshot(unitCost.multiply(BigDecimal.valueOf(t.qty())).setScale(2, RoundingMode.HALF_UP));
                a.setBatchCodeSnapshot(batch.getBatchCode());
                a.setAllocationIndex(index);
                a.setExpiryDate(batch.getExpiryDate());
                allocationRepo.save(a);
                appendMove(line.variantId(), t.batchId(), -t.qty(), M_CONSUME,
                        "production-order:" + order.getId() + ":consume:v:" + line.variantId() + ":b:" + t.batchId(),
                        "consume " + order.getOrderNo());
            }
            stockMutationService.syncVariantStockWithBatches(line.variantId());
        }
    }

    private void createOutputBatch(ProductionOrder od, ProductionRecipe recipe,
                                   BigDecimal unitCost, LocalDate outExp) {
        ProductVariant ov = recipe.getOutputVariant();
        String code = uniqueBatchCode(od.getOrderNo(),
                ov.getVariantCode() != null ? ov.getVariantCode() : ("V" + ov.getId()));

        ProductBatch nb = new ProductBatch();
        nb.setProduct(ov.getProduct());
        nb.setVariant(ov);
        nb.setReceipt(null);
        nb.setProductionOrder(od);
        nb.setBatchCode(code);
        nb.setExpiryDate(outExp);
        nb.setImportQty(od.getOutputQty());
        nb.setRemainingQty(od.getOutputQty());
        nb.setCostPrice(unitCost.setScale(2, RoundingMode.HALF_UP));
        nb.setStatus(ProductBatch.STATUS_ACTIVE);
        stockMutationService.updateStockWithBatches(ov.getId(),
                List.of(StockMutationService.BatchStockChange.create(nb)));

        ProductBatch saved = batchRepo.findByBatchCode(code)
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy batch output vừa tạo"));
        od.setOutputBatch(saved);
        orderRepo.save(od);

        appendMove(ov.getId(), saved.getId(), od.getOutputQty(), M_OUTPUT,
                "production-order:" + od.getId() + ":output", "output " + od.getOrderNo());
    }

    private String uniqueBatchCode(String orderNo, String variantCode) {
        String sanitized = variantCode.replaceAll("[^A-Za-z0-9_-]", "_");
        String base = ("PO_" + orderNo + "_" + sanitized).replaceAll("\\s+", "_");
        if (base.length() > 70) {
            base = base.substring(0, 70);
        }
        String candidate = base;
        int n = 0;
        while (batchRepo.existsByBatchCode(candidate)) {
            n++;
            String suffix = "_" + n;
            candidate = base.substring(0, Math.min(70 - suffix.length(), base.length())) + suffix;
            if (candidate.length() > 79) {
                candidate = candidate.substring(0, 79);
            }
        }
        return candidate;
    }

    private void appendMove(Long variantId, Long batchId, int qtyDelta, String sourceType, String sourceId, String note) {
        stockMutationService.appendMovement(variantId, batchId, qtyDelta, sourceType, sourceId, note);
    }

    private ProductionOrderResponse mapOrder(ProductionOrder o, boolean withMovements) {
        Long rid = o.getRecipe() != null ? o.getRecipe().getId() : null;
        ProductBatch ob = o.getOutputBatch();

        List<ProductionOrderComponentResponse> comps = orderComponentRepo.findByOrderIdOrderByIdAsc(o.getId()).stream()
                .map(oc -> {
                    List<AllocationResponse> alloc = allocationRepo.findByOrderComponent_IdOrderByIdAsc(oc.getId()).stream()
                            .map(a -> new AllocationResponse(
                                    a.getId(),
                                    a.getBatch().getId(),
                                    StringUtils.hasText(a.getBatchCodeSnapshot()) ? a.getBatchCodeSnapshot() : a.getBatch().getBatchCode(),
                                    a.getQty(),
                                    a.getUnitCost(),
                                    a.getTotalCostSnapshot() != null
                                            ? a.getTotalCostSnapshot()
                                            : a.getUnitCost().multiply(BigDecimal.valueOf(a.getQty())).setScale(2, RoundingMode.HALF_UP),
                                    a.getAllocationIndex(),
                                    a.getExpiryDate() != null ? a.getExpiryDate().toString() + "T00:00:00" : null
                            ))
                            .toList();
                    ProductVariant variant = variantRepo.findById(oc.getVariantId()).orElse(null);
                    Product product = variant != null ? variant.getProduct() : null;
                    return new ProductionOrderComponentResponse(
                            oc.getId(),
                            oc.getProductId(),
                            oc.getVariantId(),
                            StringUtils.hasText(oc.getProductNameSnapshot())
                                    ? oc.getProductNameSnapshot()
                                    : (product != null ? product.getName() : null),
                            StringUtils.hasText(oc.getVariantNameSnapshot())
                                    ? oc.getVariantNameSnapshot()
                                    : (variant != null ? variant.getVariantName() : null),
                            StringUtils.hasText(oc.getVariantCodeSnapshot())
                                    ? oc.getVariantCodeSnapshot()
                                    : (variant != null ? variant.getVariantCode() : null),
                            oc.getRequiredQty(),
                            oc.getConsumedQty(),
                            oc.getUnit(),
                            alloc
                    );
                })
                .toList();

        List<ProductionMovementDto> mv = Collections.emptyList();
        if (withMovements) {
            String prefix = "production-order:" + o.getId() + ":";
            mv = movementRepo.findBySourceIdStartingWithOrderByIdAsc(prefix).stream()
                    .map(m -> new ProductionMovementDto(
                            m.getSourceType(),
                            m.getVariant().getId(),
                            m.getBatch() != null ? m.getBatch().getId() : null,
                            m.getQtyDelta(),
                            m.getSourceId(),
                            m.getCreatedAt() != null ? m.getCreatedAt().toString() : null
                    ))
                    .toList();
        }

        return new ProductionOrderResponse(
                o.getId(),
                o.getOrderNo(),
                o.getStatus(),
                rid,
                o.getRecipeSnapshotJson(),
                o.getOutputProduct().getId(),
                o.getOutputVariant().getId(),
                o.getOutputQty(),
                o.getOutputMustBeSellable(),
                o.getOverheadCost(),
                ob != null ? ob.getId() : null,
                ob != null ? ob.getBatchCode() : null,
                o.getOutputUnitCost(),
                o.getOutputExpiryDate() != null ? o.getOutputExpiryDate().toString() + "T00:00:00" : null,
                comps,
                mv,
                o.getCreatedAt() != null ? o.getCreatedAt().toString() : null,
                o.getNote(),
                o.getVoidedAt() != null ? o.getVoidedAt().toString() : null,
                o.getVoidReason()
        );
    }
}
