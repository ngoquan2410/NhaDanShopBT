package com.example.nhadanshop.service;



import com.example.nhadanshop.dto.StockAdjustmentRequest;

import com.example.nhadanshop.dto.StockAdjustmentResponse;

import com.example.nhadanshop.dto.StockAdjustmentReverseRequest;

import com.example.nhadanshop.entity.*;

import com.example.nhadanshop.repository.*;

import jakarta.persistence.EntityNotFoundException;

import lombok.RequiredArgsConstructor;

import lombok.extern.slf4j.Slf4j;

import org.springframework.data.domain.Page;

import org.springframework.data.domain.PageImpl;

import org.springframework.data.domain.Pageable;

import org.springframework.security.core.context.SecurityContextHolder;

import org.springframework.stereotype.Service;

import org.springframework.transaction.annotation.Transactional;



import java.time.LocalDate;

import java.time.LocalDateTime;

import java.time.format.DateTimeFormatter;

import java.util.ArrayList;

import java.util.Comparator;

import java.util.HashMap;

import java.util.List;

import java.util.Map;

import java.util.concurrent.atomic.AtomicInteger;

import java.util.stream.Collectors;



@Slf4j

@Service

@RequiredArgsConstructor

public class StockAdjustmentService {



    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");



    private final StockAdjustmentRepository adjRepo;

    private final ProductVariantRepository variantRepo;

    private final ProductBatchRepository batchRepo;

    private final UserRepository userRepo;

    private final ProductComboService comboService;

    private final StockMutationService stockMutationService;

    private final StockAdjustmentItemBatchAllocationRepository allocRepo;

    private final StockAdjustmentItemRepository itemRepo;



    private final AtomicInteger adjSeq = new AtomicInteger(0);

    private volatile String adjLastDate = "";



    // ── Số phiếu ADJ ─────────────────────────────────────────────────────────

    private synchronized String nextAdjNo() {

        String today = LocalDate.now().format(DATE_FMT);

        if (!today.equals(adjLastDate)) {

            adjLastDate = today;

            String prefix = "ADJ-" + today + "-";

            Integer maxSeq = adjRepo.findMaxSeqForPrefix(prefix, prefix + "%");

            adjSeq.set(maxSeq != null ? maxSeq : 0);

        }

        return "ADJ-" + today + "-" + String.format("%05d", adjSeq.incrementAndGet());

    }



    // ── Tạo phiếu DRAFT ──────────────────────────────────────────────────────

    @Transactional

    public StockAdjustmentResponse create(StockAdjustmentRequest req) {

        StockAdjustment adj = new StockAdjustment();

        adj.setAdjNo(nextAdjNo());

        adj.setReason(StockAdjustment.Reason.valueOf(req.reason().toUpperCase()));

        adj.setNote(req.note());

        adj.setStatus(StockAdjustment.Status.DRAFT);



        String username = SecurityContextHolder.getContext().getAuthentication().getName();

        userRepo.findByUsername(username).ifPresent(adj::setCreatedBy);



        for (StockAdjustmentRequest.ItemRequest ir : req.items()) {

            ProductVariant variant = variantRepo.findById(ir.variantId())

                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + ir.variantId()));

            ProductBatch sourceBatch = null;

            if (ir.sourceBatchId() != null) {

                sourceBatch = batchRepo.findById(ir.sourceBatchId())

                        .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy batch ID: " + ir.sourceBatchId()));

                if (sourceBatch.getVariant() == null || !variant.getId().equals(sourceBatch.getVariant().getId())) {

                    throw new IllegalArgumentException(

                            "Batch ID " + ir.sourceBatchId() + " không thuộc variant ID: " + variant.getId());

                }

            }



            StockAdjustmentItem item = new StockAdjustmentItem();

            item.setAdjustment(adj);

            item.setVariant(variant);

            item.setSourceBatch(sourceBatch);

            int systemQty = variant.getStockQty() != null ? variant.getStockQty() : 0;

            item.setSystemQty(systemQty); // snapshot

            item.setActualQty(ir.actualQty());

            assertReasonAllowsDiff(adj.getReason(), ir.actualQty() - systemQty, "tao phieu " + adj.getAdjNo());

            if (ir.actualQty() > systemQty) {

                assertProductAndVariantActiveForStockIncrease(

                        variant, "tạo phiếu tăng tồn");

            }

            item.setNote(ir.note());

            adj.getItems().add(item);

        }



        return toResponse(adjRepo.save(adj));

    }



    // ── Xác nhận phiếu → cập nhật tồn kho (+ allocation trace, post V16) ────

    @Transactional

    public StockAdjustmentResponse confirm(Long id) {

        StockAdjustment adj = findOrThrowForUpdate(id);

        if (adj.getStatus() == StockAdjustment.Status.CONFIRMED)

            throw new IllegalStateException("Phiếu '" + adj.getAdjNo() + "' đã được xác nhận trước đó.");



        // Lock order rule (deadlock guard): lock variant first, then lock source batch list sorted by batchId ASC.

        String username = SecurityContextHolder.getContext().getAuthentication().getName();

        userRepo.findByUsername(username).ifPresent(adj::setConfirmedBy);

        adj.setConfirmedAt(LocalDateTime.now());

        adj.setStatus(StockAdjustment.Status.CONFIRMED);



        for (StockAdjustmentItem item : adj.getItems()) {

            ProductVariant variant = variantRepo.findByIdForUpdate(item.getVariant().getId())

                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + item.getVariant().getId()));

            int currentSystemQty = variant.getStockQty() != null ? variant.getStockQty() : 0;

            int snapshotSystemQty = item.getSystemQty() != null ? item.getSystemQty() : 0;

            if (currentSystemQty != snapshotSystemQty) {

                throw new IllegalStateException("ADJ " + adj.getAdjNo() + ": tồn kho hiện tại của variant "

                        + variant.getVariantCode() + " đã thay đổi (snapshot=" + snapshotSystemQty

                        + ", current=" + currentSystemQty + "). Vui lòng kiểm kê lại và tạo phiếu điều chỉnh mới.");

            }

            int diff = item.getActualQty() - snapshotSystemQty; // diff_qty

            assertReasonAllowsDiff(adj.getReason(), diff, "xac nhan phieu " + adj.getAdjNo());



            if (diff == 0) {

                continue;

            }

            if (diff > 0) {

                assertProductAndVariantActiveForStockIncrease(

                        variant, "xác nhận phiếu tăng tồn (ADJ " + adj.getAdjNo() + ")");

            }



            if (diff < 0) {

                int toDeduct = -diff;

                ProductBatch sourceBatch = item.getSourceBatch();

                if (sourceBatch != null) {

                    List<ProductBatch> lockedSourceBatches = lockSourceBatchesInDeterministicOrder(List.of(sourceBatch.getId()));

                    ProductBatch lockedSourceBatch = lockedSourceBatches.stream().findFirst()

                            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy batch ID: " + sourceBatch.getId()));

                    if (lockedSourceBatch.getVariant() == null

                            || !variant.getId().equals(lockedSourceBatch.getVariant().getId())) {

                        throw new IllegalArgumentException(

                                "Batch ID " + lockedSourceBatch.getId() + " không thuộc variant ID: " + variant.getId());

                    }

                    assertSourceBatchStatusAllowedForExplicitNegative(lockedSourceBatch, adj.getAdjNo());

                    if (toDeduct > lockedSourceBatch.getRemainingQty()) {

                        throw new IllegalStateException("ADJ " + adj.getAdjNo() + ": batch " + lockedSourceBatch.getBatchCode()

                                + " không đủ tồn để giảm " + toDeduct);

                    }

                    stockMutationService.updateStockWithBatches(

                            variant.getId(),

                            List.of(StockMutationService.BatchStockChange.delta(lockedSourceBatch.getId(), -toDeduct)));

                    saveConfirmAllocationTrace(item, lockedSourceBatch.getId(), -toDeduct);

                } else {

                    // Giảm tồn không chọn lô: currentAdjustable (active|blocked, remaining>0), FEFO theo expiry+id

                    List<ProductBatch> batches = batchRepo

                            .findCurrentAdjustableByVariantIdForUpdate(variant.getId());

                    List<StockMutationService.BatchStockChange> changes = new ArrayList<>();

                    for (ProductBatch batch : batches) {

                        if (toDeduct <= 0) break;

                        int deducted = Math.min(batch.getRemainingQty(), toDeduct);

                        changes.add(StockMutationService.BatchStockChange.delta(batch.getId(), -deducted));

                        toDeduct -= deducted;

                    }

                    if (toDeduct > 0) {

                        throw new IllegalStateException("ADJ " + adj.getAdjNo() + ": variant " + variant.getVariantCode()

                                + " không đủ tồn điều chỉnh được (lô trạng thái active/blocked) để giảm thêm "

                                + toDeduct + " — không tính bán hàng, không tính lô voided/depleted/archived.");

                    }

                    stockMutationService.updateStockWithBatches(variant.getId(), changes);

                    for (StockMutationService.BatchStockChange ch : changes) {

                        if (ch == null || ch.newBatch() != null) {

                            continue;

                        }

                        if (ch.batchId() == null || ch.deltaRemainingQty() == null) {

                            continue;

                        }

                        saveConfirmAllocationTrace(item, ch.batchId(), ch.deltaRemainingQty());

                    }

                }

            } else {

                // Tăng tồn: tạo batch mới với batchCode = ADJ-xxx

                ProductBatch newBatch = new ProductBatch();

                newBatch.setProduct(variant.getProduct());

                newBatch.setVariant(variant);

                newBatch.setBatchCode(adj.getAdjNo() + "-" + variant.getVariantCode());

                newBatch.setExpiryDate(

                        variant.getExpiryDays() != null && variant.getExpiryDays() > 0

                                ? LocalDate.now().plusDays(variant.getExpiryDays())

                                : LocalDate.now().plusYears(10)

                );

                newBatch.setImportQty(diff);

                newBatch.setRemainingQty(diff);

                newBatch.setCostPrice(variant.getCostPrice());

                stockMutationService.updateStockWithBatches(

                        variant.getId(),

                        List.of(StockMutationService.BatchStockChange.create(newBatch)));

                ProductBatch created = batchRepo.findByBatchCode(adj.getAdjNo() + "-" + variant.getVariantCode())

                        .orElseThrow(() -> new IllegalStateException(

                                "ADJ " + adj.getAdjNo() + ": không tìm thấy lô vừa tạo cho variant " + variant.getVariantCode()));

                saveConfirmAllocationTrace(item, created.getId(), diff);

            }



            comboService.refreshCombosContaining(variant.getProduct().getId());

        }



        log.info("ADJ {} confirmed: {} dòng điều chỉnh", adj.getAdjNo(), adj.getItems().size());

        return toResponse(adjRepo.save(adj));

    }



    private void saveConfirmAllocationTrace(StockAdjustmentItem item, long batchId, int qtyDelta) {

        ProductBatch b = batchRepo.getReferenceById(batchId);

        StockAdjustmentItemBatchAllocation row = new StockAdjustmentItemBatchAllocation();

        row.setAdjustmentItem(item);

        row.setBatch(b);

        row.setQtyDelta(qtyDelta);

        allocRepo.save(row);

    }



    /**

     * Đảo phiếu đã xác nhận: tạo phiếu đảo mới, cập nhật tồn theo trace hoặc fallback tất định (không đoán FEFO).

     */

    @Transactional

    public StockAdjustmentResponse reverse(Long id, StockAdjustmentReverseRequest request) {

        if (request == null) {

            request = new StockAdjustmentReverseRequest(null, null);

        }

        StockAdjustment orig = findOrThrowForUpdate(id);

        if (orig.getStatus() != StockAdjustment.Status.CONFIRMED) {

            throw new IllegalStateException("Chỉ có thể đảo phiếu đã xác nhận.");

        }

        if (orig.getReversesOriginal() != null) {

            throw new IllegalStateException("Không thể đảo phiếu đảo (reversal).");

        }

        if (orig.getReversalAdjustment() != null || orig.getReversedAt() != null) {

            throw new IllegalStateException("Phiếu này đã được đảo trước đó.");

        }

        if (orig.getItems() == null || orig.getItems().isEmpty()) {

            throw new IllegalStateException("Phiếu gốc không có dòng chi tiết.");

        }



        List<StockAdjustmentItem> origItems = new ArrayList<>(orig.getItems());

        List<Long> itemIds = origItems.stream().map(StockAdjustmentItem::getId).toList();

        List<StockAdjustmentItemBatchAllocation> traceList = allocRepo.findByAdjustmentItemIdIn(itemIds);

        boolean hasTrace = !traceList.isEmpty();

        if (hasTrace) {

            validateTraceSumsMatchLineDiffs(orig, traceList);

        }



        if (hasTrace) {

            prevalidateTraceInverses(traceList);

        } else {

            prevalidateLegacyDeterministicOrThrow(orig, origItems);

        }



        String uname = SecurityContextHolder.getContext().getAuthentication().getName();

        String reversedByLabel = (request.reversedBy() != null && !request.reversedBy().isBlank())

                ? request.reversedBy().trim() : uname;



        LocalDateTime now = LocalDateTime.now();

        StockAdjustment rev = new StockAdjustment();

        rev.setAdjNo(nextAdjNo());

        rev.setAdjDate(now);

        rev.setReason(StockAdjustment.Reason.OTHER);

        String note = "Reversal of " + orig.getAdjNo();

        if (request.reason() != null && !request.reason().isBlank()) {

            note = note + " — " + request.reason().trim();

        }

        if (note.length() > 500) {

            note = note.substring(0, 500);

        }

        rev.setNote(note);

        rev.setStatus(StockAdjustment.Status.CONFIRMED);

        rev.setReversesOriginal(orig);

        rev.setCreatedAt(now);

        rev.setUpdatedAt(now);

        userRepo.findByUsername(uname).ifPresent(rev::setCreatedBy);

        userRepo.findByUsername(uname).ifPresent(rev::setConfirmedBy);

        rev.setConfirmedAt(now);

        rev = adjRepo.save(rev);



        for (StockAdjustmentItem oItem : origItems) {

            ProductVariant v = variantRepo.findByIdForUpdate(oItem.getVariant().getId())

                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + oItem.getVariant().getId()));

            int sys = nz(v.getStockQty());

            int origDiff = nz(oItem.getActualQty()) - nz(oItem.getSystemQty());

            StockAdjustmentItem rItem = new StockAdjustmentItem();

            rItem.setAdjustment(rev);

            rItem.setVariant(v);

            rItem.setSourceBatch(oItem.getSourceBatch());

            rItem.setSystemQty(sys);

            rItem.setActualQty(sys - origDiff);

            rItem.setNote(oItem.getNote());

            rev.getItems().add(rItem);

            rItem = itemRepo.saveAndFlush(rItem);



            if (origDiff == 0) {

                continue;

            }



            List<StockMutationService.BatchStockChange> toApply;

            if (hasTrace) {

                toApply = buildInverseForItemFromTrace(oItem, traceList);

            } else {

                toApply = buildLegacyInverseForItem(oItem, orig);

            }

            if (toApply.isEmpty()) {

                continue;

            }

            stockMutationService.updateStockWithBatches(v.getId(), toApply);

            for (StockMutationService.BatchStockChange ch : toApply) {

                if (ch == null || ch.newBatch() != null) {

                    continue;

                }

                if (ch.batchId() == null || ch.deltaRemainingQty() == null) {

                    continue;

                }

                saveConfirmAllocationTrace(rItem, ch.batchId(), ch.deltaRemainingQty());

            }

            comboService.refreshCombosContaining(v.getProduct().getId());

        }



        orig.setReversalAdjustment(rev);

        orig.setReversedAt(now);

        orig.setReversedBy(reversedByLabel);

        if (request.reason() != null && !request.reason().isBlank()) {

            orig.setReversalReason(request.reason().trim());

        } else {

            orig.setReversalReason(null);

        }

        adjRepo.save(orig);

        return toResponse(rev);

    }



    private static int nz(Integer x) {

        return x == null ? 0 : x;

    }



    private void validateTraceSumsMatchLineDiffs(StockAdjustment orig, List<StockAdjustmentItemBatchAllocation> traceList) {

        Map<Long, Integer> sumByItem = traceList.stream()
                .collect(Collectors.groupingBy(
                        a -> a.getAdjustmentItem().getId(),
                        Collectors.summingInt(StockAdjustmentItemBatchAllocation::getQtyDelta)
                ));

        for (StockAdjustmentItem o : orig.getItems()) {

            int d = nz(o.getActualQty()) - nz(o.getSystemQty());

            int s = sumByItem.getOrDefault(o.getId(), 0);

            if (d == 0 && s != 0) {

                throw new IllegalStateException("Trace tồn tại dòng mà diff dòng tính từ system/actual bằng 0: conflict.");

            }

            if (d != 0 && s != d) {

                throw new IllegalStateException("Trace không khớp diff dòng (item " + o.getId() + "): tổng trace="

                        + s + ", diff dòng=" + d + ". Không thể đảo theo policy.");

            }

        }

    }



    private void prevalidateTraceInverses(List<StockAdjustmentItemBatchAllocation> traceList) {

        for (StockAdjustmentItemBatchAllocation t : traceList) {

            int inv = -t.getQtyDelta();

            if (inv == 0) {

                continue;

            }

            long bid = t.getBatch().getId();

            ProductBatch b = batchRepo.findById(bid)

                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy batch ID: " + bid));

            if (inv < 0) {

                if (b.getRemainingQty() < -inv) {

                    throw new IllegalStateException("Không thể đảo: batch " + b.getBatchCode()

                            + " cần giảm " + (-inv) + " (theo từng lô) nhưng remaining=" + b.getRemainingQty()

                            + " — không bù từ lô khác hoặc từ tồn tổng variant.");

                }

            }

        }

    }



    private void prevalidateLegacyDeterministicOrThrow(StockAdjustment orig, List<StockAdjustmentItem> origItems) {

        for (StockAdjustmentItem o : origItems) {

            int d = nz(o.getActualQty()) - nz(o.getSystemQty());

            if (d == 0) {

                continue;

            }

            if (d > 0) {

                String code = orig.getAdjNo() + "-" + o.getVariant().getVariantCode();

                ProductBatch b = batchRepo.findByBatchCode(code).orElseThrow(() ->

                        new IllegalStateException("Không thể đảo (legacy): không tìm thấy lô tạo từ phiếu tăng tồn: " + code));

                if (b.getVariant() == null || !o.getVariant().getId().equals(b.getVariant().getId())) {

                    throw new IllegalStateException("Batch đảo lệch variant.");

                }

                if (b.getRemainingQty() < d) {

                    throw new IllegalStateException("Không thể đảo: lô tạo từ phiếu tăng không còn đủ " + d

                            + " kiện remaining=" + b.getRemainingQty() + " (bắt buộc cùng lô, không tách phần).");

                }

            } else if (d < 0) {

                if (o.getSourceBatch() == null) {

                    throw new IllegalStateException("Phiếu cũ giảm tồn theo FEFO không có bản ghi phân bổ lô; không thể đảo tất định. Không dùng FEFO hiện tại để đoán lô.");

                }

            }

        }

    }



    private List<StockMutationService.BatchStockChange> buildInverseForItemFromTrace(

            StockAdjustmentItem oItem, List<StockAdjustmentItemBatchAllocation> traceList) {

        List<StockAdjustmentItemBatchAllocation> forItem = traceList.stream()

                .filter(t -> t.getAdjustmentItem().getId().equals(oItem.getId()))

                .toList();

        Map<Long, Integer> byBatch = new HashMap<>();

        for (StockAdjustmentItemBatchAllocation t : forItem) {

            long bid = t.getBatch().getId();

            int inv = -t.getQtyDelta();

            if (inv != 0) {

                byBatch.merge(bid, inv, Integer::sum);

            }

        }

        return byBatch.entrySet().stream()

                .map(e -> StockMutationService.BatchStockChange.delta(e.getKey(), e.getValue()))

                .toList();

    }



    private List<StockMutationService.BatchStockChange> buildLegacyInverseForItem(StockAdjustmentItem oItem, StockAdjustment orig) {

        int d = nz(oItem.getActualQty()) - nz(oItem.getSystemQty());

        if (d == 0) {

            return List.of();

        }

        if (d > 0) {

            String code = orig.getAdjNo() + "-" + oItem.getVariant().getVariantCode();

            ProductBatch b = batchRepo.findByBatchCode(code).orElseThrow();

            if (b.getRemainingQty() < d) {

                throw new IllegalStateException("Lô tạo từ phiếu tăng không còn đủ tồn để đảo cùng lô.");

            }

            return List.of(StockMutationService.BatchStockChange.delta(b.getId(), -d));

        }

        if (oItem.getSourceBatch() == null) {

            throw new IllegalStateException("Không thể đảo legacy: thiếu source batch.");

        }

        int addBack = -d;

        return List.of(StockMutationService.BatchStockChange.delta(oItem.getSourceBatch().getId(), addBack));

    }



    // ── Đọc ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)

    public Page<StockAdjustmentResponse> getAll(Pageable pageable) {

        Page<Long> idPage = adjRepo.findIdsByOrderByAdjDateDescIdDesc(pageable);

        if (idPage.isEmpty()) {

            return new PageImpl<>(List.of(), pageable, idPage.getTotalElements());

        }

        List<StockAdjustment> rows = adjRepo.findAllByIdInWithDetails(idPage.getContent());

        Map<Long, Integer> orderIndex = new HashMap<>();

        List<Long> orderedIds = idPage.getContent();

        for (int i = 0; i < orderedIds.size(); i++) {

            orderIndex.put(orderedIds.get(i), i);

        }

        rows.sort(Comparator.comparingInt(a -> orderIndex.getOrDefault(a.getId(), Integer.MAX_VALUE)));

        List<StockAdjustmentResponse> content = rows.stream().map(this::toResponse).toList();

        return new PageImpl<>(content, pageable, idPage.getTotalElements());

    }

    private void assertReasonAllowsDiff(StockAdjustment.Reason reason, int diff, String context) {
        if (diff <= 0) {
            return;
        }
        if (reason == StockAdjustment.Reason.DAMAGED
                || reason == StockAdjustment.Reason.EXPIRED
                || reason == StockAdjustment.Reason.LOST) {
            throw new IllegalArgumentException(
                    "Ly do " + reason + " chi duoc giam ton. Khong duoc tang ton khi " + context + ".");
        }
    }



    @Transactional(readOnly = true)

    public StockAdjustmentResponse getById(Long id) {

        return toResponse(findOrThrow(id));

    }



    // ── Xóa DRAFT ────────────────────────────────────────────────────────────

    @Transactional

    public void delete(Long id) {

        StockAdjustment adj = findOrThrow(id);

        if (adj.getStatus() == StockAdjustment.Status.CONFIRMED)

            throw new IllegalStateException("Không thể xóa phiếu đã xác nhận.");

        adjRepo.delete(adj);

    }



    private StockAdjustment findOrThrow(Long id) {

        return adjRepo.findById(id)

                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu điều chỉnh ID: " + id));

    }



    private StockAdjustment findOrThrowForUpdate(Long id) {

        return adjRepo.findByIdForUpdate(id)

                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu điều chỉnh ID: " + id));

    }



    private List<ProductBatch> lockSourceBatchesInDeterministicOrder(List<Long> sourceBatchIds) {

        List<Long> sortedIds = sourceBatchIds == null

                ? List.of()

                : sourceBatchIds.stream()

                .filter(oid -> oid != null)

                .distinct()

                .sorted()

                .toList();

        if (sortedIds.isEmpty()) {

            return List.of();

        }

        return batchRepo.findAllByIdInForUpdate(sortedIds).stream()

                .sorted(Comparator.comparing(ProductBatch::getId))

                .toList();

    }



    /**
     * Explicit sourceBatch negative: only {@code active} or {@code blocked} (expired physical lot still ok).
     * Rejects voided, depleted, archived, null/blank, and any other value.
     */

    private void assertSourceBatchStatusAllowedForExplicitNegative(ProductBatch batch, String adjNo) {

        String s = batch.getStatus();

        if (s == null || s.isBlank()) {

            throw new IllegalStateException(

                    "ADJ " + adjNo + ": lô " + batch.getBatchCode()

                            + " thiếu status hợp lệ; chỉ chọn lô trạng thái active hoặc blocked.");

        }

        if (ProductBatch.STATUS_ACTIVE.equals(s) || ProductBatch.STATUS_BLOCKED.equals(s)) {

            return;

        }

        throw new IllegalStateException(

                "ADJ " + adjNo + ": lô " + batch.getBatchCode() + " có status '" + s

                        + "'; không thể giảm tồn theo lô chọn (chỉ active hoặc blocked; hết hạn theo HSD vẫn giảm được nếu thuộc status đó).");

    }



    /** For actual &gt; snapshot (increase system stock). Unsourced/explicit <em>negative</em> on inactive catalog remains allowed. */

    private void assertProductAndVariantActiveForStockIncrease(ProductVariant variant, String actionLabel) {

        if (!Boolean.TRUE.equals(variant.getActive())) {

            throw new IllegalStateException(

                    "Không " + actionLabel + " khi biến thể đã ngừng kinh doanh; chỉ giảm tồn / điều chỉnh trừ được phép nếu chưa bật lại sản phẩm.");

        }

        Product p = variant.getProduct();

        if (p == null || !Boolean.TRUE.equals(p.getActive())) {

            throw new IllegalStateException(

                    "Không " + actionLabel + " khi sản phẩm đã ngừng kinh doanh; chỉ giảm tồn / điều chỉnh trừ được phép nếu chưa bật lại sản phẩm.");

        }

    }



    private StockAdjustmentResponse toResponse(StockAdjustment adj) {

        List<StockAdjustmentResponse.ItemResponse> itemResponses = adj.getItems().stream().map(it -> {

            ProductVariant v = it.getVariant();

            return new StockAdjustmentResponse.ItemResponse(

                    it.getId(), v.getId(), v.getVariantCode(), v.getVariantName(),

                    v.getProduct().getCode(), v.getProduct().getName(), v.getSellUnit(),

                    it.getSystemQty(), it.getActualQty(),

                    it.getActualQty() - it.getSystemQty(), // diff

                    it.getSourceBatch() != null ? it.getSourceBatch().getId() : null,

                    it.getNote()

            );

        }).toList();



        return new StockAdjustmentResponse(

                adj.getId(), adj.getAdjNo(), adj.getAdjDate(),

                adj.getReason() != null ? adj.getReason().name() : null,

                adj.getNote(), adj.getStatus().name(),

                adj.getCreatedBy() != null ? adj.getCreatedBy().getUsername() : null,

                adj.getConfirmedBy() != null ? adj.getConfirmedBy().getUsername() : null,

                adj.getConfirmedAt(), itemResponses, adj.getCreatedAt(),

                adj.getReversedAt(), adj.getReversedBy(), adj.getReversalReason(),

                adj.getReversalAdjustment() != null ? adj.getReversalAdjustment().getId() : null,

                adj.getReversesOriginal() != null ? adj.getReversesOriginal().getId() : null

        );

    }

}


