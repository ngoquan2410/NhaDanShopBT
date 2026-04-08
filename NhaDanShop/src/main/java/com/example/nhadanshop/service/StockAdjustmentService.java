package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StockAdjustmentRequest;
import com.example.nhadanshop.dto.StockAdjustmentResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

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

            StockAdjustmentItem item = new StockAdjustmentItem();
            item.setAdjustment(adj);
            item.setVariant(variant);
            item.setSystemQty(variant.getStockQty() != null ? variant.getStockQty() : 0); // snapshot
            item.setActualQty(ir.actualQty());
            item.setNote(ir.note());
            adj.getItems().add(item);
        }

        return toResponse(adjRepo.save(adj));
    }

    // ── Xác nhận phiếu → cập nhật tồn kho ──────────────────────────────────
    @Transactional
    public StockAdjustmentResponse confirm(Long id) {
        StockAdjustment adj = findOrThrow(id);
        if (adj.getStatus() == StockAdjustment.Status.CONFIRMED)
            throw new IllegalStateException("Phiếu '" + adj.getAdjNo() + "' đã được xác nhận trước đó.");

        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(username).ifPresent(adj::setConfirmedBy);
        adj.setConfirmedAt(LocalDateTime.now());
        adj.setStatus(StockAdjustment.Status.CONFIRMED);

        for (StockAdjustmentItem item : adj.getItems()) {
            ProductVariant variant = item.getVariant();
            int diff = item.getActualQty() - item.getSystemQty(); // diff_qty

            if (diff == 0) continue;

            // Cập nhật tồn kho variant
            int oldStock = variant.getStockQty() != null ? variant.getStockQty() : 0;
            int newStock = Math.max(0, oldStock + diff);
            variant.setStockQty(newStock);
            variant.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(variant);

            if (diff < 0) {
                // Giảm tồn: khấu trừ batch theo FEFO (cũ nhất trước)
                int toDeduct = -diff;
                List<ProductBatch> batches = batchRepo
                        .findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
                                variant.getId(), 0);
                for (ProductBatch batch : batches) {
                    if (toDeduct <= 0) break;
                    int deducted = Math.min(batch.getRemainingQty(), toDeduct);
                    batch.setRemainingQty(batch.getRemainingQty() - deducted);
                    batchRepo.save(batch);
                    toDeduct -= deducted;
                }
                if (toDeduct > 0) {
                    log.warn("ADJ {}: variant {} cần giảm thêm {} nhưng hết batch", adj.getAdjNo(), variant.getVariantCode(), toDeduct);
                }
            } else {
                // Tăng tồn: tạo batch mới với batchCode = ADJ-xxx
                ProductBatch newBatch = new ProductBatch();
                newBatch.setProduct(variant.getProduct());
                newBatch.setVariant(variant);
                newBatch.setBatchCode(adj.getAdjNo() + "-" + variant.getVariantCode());
                // HSD: nếu variant có expiryDays → tính từ hôm nay, không thì xa vô hạn
                newBatch.setExpiryDate(
                        variant.getExpiryDays() != null && variant.getExpiryDays() > 0
                                ? LocalDate.now().plusDays(variant.getExpiryDays())
                                : LocalDate.now().plusYears(10)
                );
                newBatch.setImportQty(diff);
                newBatch.setRemainingQty(diff);
                newBatch.setCostPrice(variant.getCostPrice());
                batchRepo.save(newBatch);
            }

            // Refresh combo virtual stock nếu variant này là thành phần của combo
            comboService.refreshCombosContaining(variant.getProduct().getId());
        }

        log.info("ADJ {} confirmed: {} dòng điều chỉnh", adj.getAdjNo(), adj.getItems().size());
        return toResponse(adjRepo.save(adj));
    }

    // ── Đọc ─────────────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public Page<StockAdjustmentResponse> getAll(Pageable pageable) {
        return adjRepo.findAllByOrderByAdjDateDesc(pageable).map(this::toResponse);
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

    private StockAdjustmentResponse toResponse(StockAdjustment adj) {
        List<StockAdjustmentResponse.ItemResponse> itemResponses = adj.getItems().stream().map(it -> {
            ProductVariant v = it.getVariant();
            return new StockAdjustmentResponse.ItemResponse(
                    it.getId(), v.getId(), v.getVariantCode(), v.getVariantName(),
                    v.getProduct().getCode(), v.getProduct().getName(), v.getSellUnit(),
                    it.getSystemQty(), it.getActualQty(),
                    it.getActualQty() - it.getSystemQty(), // diff
                    it.getNote()
            );
        }).toList();

        return new StockAdjustmentResponse(
                adj.getId(), adj.getAdjNo(), adj.getAdjDate(),
                adj.getReason() != null ? adj.getReason().name() : null,
                adj.getNote(), adj.getStatus().name(),
                adj.getCreatedBy() != null ? adj.getCreatedBy().getUsername() : null,
                adj.getConfirmedBy() != null ? adj.getConfirmedBy().getUsername() : null,
                adj.getConfirmedAt(), itemResponses, adj.getCreatedAt()
        );
    }
}
