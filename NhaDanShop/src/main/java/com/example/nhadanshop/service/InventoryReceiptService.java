package com.example.nhadanshop.service;

import com.example.nhadanshop.exception.BusinessConflictException;
import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.InventoryReceiptResponse;
import com.example.nhadanshop.dto.InventoryReceiptVoidRequest;
import com.example.nhadanshop.dto.ReceiptItemRequest;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class InventoryReceiptService {

    private static final String MOVEMENT_TYPE_GOODS_RECEIPT = "goods_receipt";
    private static final String MOVEMENT_TYPE_GOODS_RECEIPT_DELETE = "goods_receipt_delete";
    private static final String MOVEMENT_TYPE_GOODS_RECEIPT_VOID = "goods_receipt_void";

    private final InventoryReceiptRepository receiptRepo;
    private final ProductRepository productRepo;
    private final ProductBatchRepository batchRepo;
    private final UserRepository userRepo;
    private final InvoiceNumberGenerator numberGen;
    private final ProductComboRepository comboRepo;
    private final ProductImportUnitRepository importUnitRepo;
    private final ProductVariantService variantService;
    private final ProductVariantRepository variantRepo;
    private final ProductComboService comboService;
    private final SupplierRepository supplierRepository; // Sprint 1 S1-3
    private final Clock businessClock;
    private final StockMutationService stockMutationService;
    private final InventoryMovementRepository movementRepo;

    @Transactional
    public InventoryReceiptResponse createReceipt(InventoryReceiptRequest req) {

        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGen.nextReceiptNo());
        receipt.setSupplierName(req.supplierName());
        receipt.setNote(req.note());

        // Dùng receiptDate từ request nếu có và không phải tương lai, ngược lại dùng now()
        // Server chạy UTC+7 (Asia/Ho_Chi_Minh) → now() luôn đúng giờ VN
        LocalDateTime now = LocalDateTime.now(businessClock);
        LocalDateTime receiptDate = (req.receiptDate() != null && !req.receiptDate().isAfter(now))
                ? req.receiptDate() : now;
        receipt.setReceiptDate(receiptDate);

        // Sprint 1 S1-3: set supplier FK nếu có supplierId
        if (req.supplierId() != null) {
            supplierRepository.findById(req.supplierId()).ifPresent(supplier -> {
                ActiveEntityGuards.requireActiveSupplierForBinding(supplier, req.supplierId());
                receipt.setSupplier(supplier);
            });
        }

        BigDecimal shippingFee = safe(req.shippingFee());
        BigDecimal vatPctOrder = safe(req.vatPercent());
        receipt.setShippingFee(shippingFee);

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(receipt::setCreatedBy);

        InventoryReceipt saved = receiptRepo.save(receipt);

        List<ReceiptItemRequest> allItems = new ArrayList<>();
        if (req.items() != null) {
            allItems.addAll(req.items());
        }
        expandComboLinesIntoAllItems(req, allItems);

        if (allItems.isEmpty()) {
            throw new IllegalArgumentException("Phiếu nhập phải có ít nhất 1 sản phẩm hoặc combo");
        }

        Set<Long> lineProductIds = allItems.stream()
                .map(ReceiptItemRequest::productId)
                .collect(Collectors.toCollection(HashSet::new));
        List<Product> lineProducts = productRepo.findAllById(lineProductIds);
        if (lineProducts.size() != lineProductIds.size()) {
            Set<Long> have = lineProducts.stream().map(Product::getId).collect(Collectors.toSet());
            Long missing = lineProductIds.stream().filter(id -> !have.contains(id)).findFirst().orElseThrow();
            throw new EntityNotFoundException("Không tìm thấy SP ID: " + missing);
        }
        Map<Long, Product> productById = lineProducts.stream().collect(Collectors.toMap(Product::getId, p -> p));

        List<ProductImportUnit> importUnitsBulk = importUnitRepo.findByProductIdIn(lineProductIds);
        Map<Long, ProductImportUnit> defaultPiuByProductId = new HashMap<>();
        Map<Long, Map<String, ProductImportUnit>> piuByProductNormUnit = new HashMap<>();
        for (ProductImportUnit u : importUnitsBulk) {
            Long pid = u.getProduct().getId();
            if (Boolean.TRUE.equals(u.getIsDefault())) {
                defaultPiuByProductId.putIfAbsent(pid, u);
            }
            String norm = u.getImportUnit() == null ? "" : u.getImportUnit().trim().toLowerCase(Locale.ROOT);
            piuByProductNormUnit.computeIfAbsent(pid, k -> new HashMap<>()).put(norm, u);
        }

        List<ProductVariant> variantsBulk = variantRepo.findByProductIdInWithProduct(lineProductIds);
        Map<Long, ProductVariant> defaultVariantByProductId = new HashMap<>();
        for (ProductVariant v : variantsBulk) {
            if (Boolean.TRUE.equals(v.getIsDefault())) {
                defaultVariantByProductId.putIfAbsent(v.getProduct().getId(), v);
            }
        }

        // ── Pass 1: Resolve pieces + tính discountedLineTotal ──────────────
        List<BigDecimal> discountedLineTotals = new ArrayList<>();
        List<Integer>    resolvedPiecesList   = new ArrayList<>();
        List<String>     resolvedImportUnits  = new ArrayList<>();
        BigDecimal totalDiscountedValue = BigDecimal.ZERO;

        for (ReceiptItemRequest itemReq : allItems) {
            Product product = productById.get(itemReq.productId());

            // ── Resolve pieces: Excel/Request → product_import_units lookup → product default ──
            int pieces;
            String importUnitUsed;

            if (itemReq.importUnit() != null && !itemReq.importUnit().isBlank()) {
                String reqUnit = itemReq.importUnit().trim();
                Optional<ProductImportUnit> piu = findImportUnitInIndex(product.getId(), reqUnit, piuByProductNormUnit);
                if (piu.isPresent()) {
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : piu.get().getPiecesPerUnit();
                } else {
                    ProductVariant dvFb = defaultVariantByProductId.get(product.getId());
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : UnitConverter.effectivePieces(reqUnit, dvFb != null ? dvFb.getPiecesPerUnit() : null);
                }
                importUnitUsed = reqUnit;
            } else {
                ProductImportUnit defaultPiu = defaultPiuByProductId.get(product.getId());
                if (defaultPiu != null) {
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : defaultPiu.getPiecesPerUnit();
                    importUnitUsed = defaultPiu.getImportUnit();
                } else {
                    ProductVariant dv = defaultVariantByProductId.get(product.getId());
                    pieces = dv != null ? UnitConverter.effectivePieces(dv.getImportUnit(), dv.getPiecesPerUnit()) : 1;
                    importUnitUsed = dv != null && dv.getImportUnit() != null ? dv.getImportUnit() : "cai";
                }
            }

            resolvedPiecesList.add(pieces);
            resolvedImportUnits.add(importUnitUsed);

            // ── discountedLine = cơ sở để phân bổ ship + VAT theo tỷ lệ ────
            // Dùng unitCost × quantity (tiền thực trả NCC sau CK) — KHÔNG dùng
            // costPerRetail × retailQty vì làm tròn chia/nhân pieces gây sai số.
            // Tổng VAT = totalDiscountedValue × vatPct% → chia theo tỷ lệ cho từng dòng.
            // Giống hệt cách phân bổ phí ship → luôn nhất quán.
            BigDecimal disc = safe(itemReq.discountPercent());
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    disc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal discountedLine = itemReq.unitCost()
                    .multiply(discountFactor)
                    .multiply(itemReq.quantity())
                    .setScale(4, RoundingMode.HALF_UP);
            discountedLineTotals.add(discountedLine);
            totalDiscountedValue = totalDiscountedValue.add(discountedLine);
        }

        BigDecimal totalVatAmount = totalDiscountedValue
                .multiply(vatPctOrder.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP))
                .setScale(2, RoundingMode.HALF_UP);

        // ── Pass 2: Tạo items, batch, cập nhật tồn kho ───────────────────────
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<InventoryReceiptItem> items = new ArrayList<>();

        for (int i = 0; i < allItems.size(); i++) {
            ReceiptItemRequest itemReq = allItems.get(i);
            int pieces = resolvedPiecesList.get(i);
            String importUnitUsed = resolvedImportUnits.get(i);

            Product product = productById.get(itemReq.productId());

            // ── [BƯỚC 1] Dùng pieces từ snapshot (mới), không từ product ──
            int addedRetailQty = UnitConverter.toRetailQty(pieces, itemReq.quantity());
            BigDecimal costPerRetail = UnitConverter.costPerRetailUnit(itemReq.unitCost(), pieces);

            BigDecimal disc = safe(itemReq.discountPercent());
            BigDecimal discountedUnitCost = costPerRetail
                    .multiply(BigDecimal.ONE.subtract(disc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP)))
                    .setScale(2, RoundingMode.HALF_UP);

            BigDecimal discountedLine = discountedLineTotals.get(i);

            // Phân bổ shipping
            BigDecimal shippingAllocatedLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                shippingAllocatedLine = shippingFee.multiply(discountedLine)
                        .divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal shippingPerUnit = addedRetailQty > 0
                    ? shippingAllocatedLine.divide(BigDecimal.valueOf(addedRetailQty), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            // Phân bổ VAT
            BigDecimal vatAllocatedLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                vatAllocatedLine = totalVatAmount.multiply(discountedLine)
                        .divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal vatPerUnit = addedRetailQty > 0
                    ? vatAllocatedLine.divide(BigDecimal.valueOf(addedRetailQty), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            BigDecimal finalCostBeforeVat = discountedUnitCost.add(shippingPerUnit).setScale(2, RoundingMode.HALF_UP);
            BigDecimal finalCostWithVat   = finalCostBeforeVat.add(vatPerUnit).setScale(2, RoundingMode.HALF_UP);

            // [Sprint 0] Resolve variant — null variantId → default variant
            ProductVariant variant = variantService.resolveVariant(itemReq.variantId(), product.getId());
            Long variantId = variant.getId();
            variant = variantRepo.findByIdForUpdate(variantId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));

            // Cập nhật catalog current price metadata; receipt totals/profit use snapshots below.
            variant.setCostPrice(finalCostWithVat);
            if (itemReq.sellPrice() != null && itemReq.sellPrice().compareTo(BigDecimal.ZERO) > 0) {
                variant.setSellPrice(itemReq.sellPrice());
            }
            if (Boolean.TRUE.equals(itemReq.isSellableExplicit()) && itemReq.isSellable() != null) {
                boolean wantsSellable = Boolean.TRUE.equals(itemReq.isSellable());
                BigDecimal effectiveSell = variant.getSellPrice() != null ? variant.getSellPrice() : BigDecimal.ZERO;
                if (wantsSellable && effectiveSell.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new IllegalArgumentException(
                            "Không thể bật bán lẻ cho variant '" + variant.getVariantCode()
                                    + "' khi giá bán hiện hành bằng 0.");
                }
                variant.setIsSellable(wantsSellable);
            }
            variant.setUpdatedAt(LocalDateTime.now(businessClock));
            variantRepo.save(variant);

            // Tạo Batch — gắn variant
            // Sprint 1 S1-2: ưu tiên expiryDateOverride từ request nếu admin nhập ngày HSD thực tế
            LocalDate expiryDate;
            LocalDate importLocalDate = saved.getReceiptDate().toLocalDate(); // dùng receiptDate, không phải now()
            if (itemReq.expiryDateOverride() != null) {
                expiryDate = itemReq.expiryDateOverride();
            } else if (variant.getExpiryDays() != null && variant.getExpiryDays() > 0) {
                expiryDate = importLocalDate.plusDays(variant.getExpiryDays());
            } else {
                expiryDate = importLocalDate.plusYears(10); // không có HSD → dùng ngày rất xa
            }
            String batchCode = buildBatchCode(saved.getReceiptNo(), variant.getVariantCode());
            ProductBatch batch = new ProductBatch();
            batch.setProduct(product); batch.setVariant(variant); batch.setReceipt(saved);
            batch.setBatchCode(batchCode); batch.setExpiryDate(expiryDate);
            batch.setImportQty(addedRetailQty); batch.setRemainingQty(addedRetailQty);
            batch.setCostPrice(finalCostWithVat);
            stockMutationService.updateStockWithBatches(
                    variant.getId(),
                    List.of(StockMutationService.BatchStockChange.create(batch)));

            Long receiptId = saved.getId();
            appendGoodsReceiptMovement(saved.getReceiptNo(), receiptId, batch);

            // Tạo ReceiptItem — set snapshot + variant
            InventoryReceiptItem item = new InventoryReceiptItem();
            item.setReceipt(saved);
            item.setProduct(product);
            item.setVariant(variant);
            item.setQuantity(itemReq.quantity());
            item.setUnitCost(itemReq.unitCost());
            item.setDiscountPercent(disc);
            item.setDiscountedCost(discountedUnitCost);
            item.setVatPercent(vatPctOrder);
            item.setVatAllocated(vatPerUnit);
            item.setShippingAllocated(shippingPerUnit);
            item.setFinalCost(finalCostBeforeVat);
            item.setFinalCostWithVat(finalCostWithVat);
            // ── Ghi snapshot bất biến ──
            item.setImportUnitUsed(importUnitUsed);
            item.setPiecesUsed(pieces);
            item.setRetailQtyAdded(addedRetailQty);
            // V2: snapshot sellUnit của variant tại thời điểm nhập
            item.setSellUnitSnapshot(variant.getSellUnit());
            // Sprint 1 S1-2: lưu expiryDateOverride nếu có
            item.setExpiryDateOverride(itemReq.expiryDateOverride());

            totalAmount = totalAmount.add(discountedLine);
            items.add(item);
        }

        // totalAmount = giá sau CK (tích lũy) + ship + VAT = tổng thực trả
        BigDecimal grandTotal = totalAmount.add(shippingFee).add(totalVatAmount)
                .setScale(0, RoundingMode.HALF_UP);
        saved.setTotalAmount(grandTotal);
        saved.setTotalVat(totalVatAmount);
        saved.getItems().addAll(items);

        InventoryReceipt savedReceipt = receiptRepo.save(saved);
        // ── Refresh virtual stock của tất cả combo chứa SP vừa nhập ─────────
        // Sau khi stockQty của các SP đơn tăng → min(component/qty) thay đổi
        allItems.stream()
                .map(ReceiptItemRequest::productId)
                .distinct()
                .forEach(comboService::refreshCombosContaining);

        return mapToResponse(savedReceipt);
    }

    public InventoryReceiptResponse getReceipt(Long id) {
        InventoryReceipt r = receiptRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        return mapToResponse(r);
    }

    /**
     * Chỉ cho sửa metadata: ghi chú, nhà cung cấp, và ngày nhập.
     * Không thay đổi tồn kho, giá vốn, hay bất kỳ dữ liệu nghiệp vụ nào khác.
     */
    @Transactional
    public InventoryReceiptResponse updateReceiptMeta(Long id, com.example.nhadanshop.dto.ReceiptMetaUpdateRequest req) {
        InventoryReceipt receipt = receiptRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        if (req.note() != null) {
            receipt.setNote(req.note().isBlank() ? null : req.note().trim());
        }
        if (req.supplierId() != null) {
            Supplier supplier = supplierRepository.findById(req.supplierId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy NCC ID: " + req.supplierId()));
            ActiveEntityGuards.requireActiveSupplierForBinding(supplier, req.supplierId());
            receipt.setSupplier(supplier);
            receipt.setSupplierName(supplier.getName());
        } else if (req.supplierName() != null) {
            receipt.setSupplierName(req.supplierName().isBlank() ? null : req.supplierName().trim());
        }
        // Cho phép sửa ngày nhập — không được là ngày tương lai
        if (req.receiptDate() != null) {
            if (req.receiptDate().isAfter(LocalDateTime.now(businessClock))) {
                throw new IllegalArgumentException("Ngày nhập không được là ngày tương lai");
            }
            receipt.setReceiptDate(req.receiptDate());
        }
        return mapToResponse(receiptRepo.save(receipt));
    }

    public Page<InventoryReceiptResponse> listReceipts(Pageable pageable) {
        return listReceipts(null, null, null, pageable);
    }

    public Page<InventoryReceiptResponse> listReceiptsByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return listReceipts(from, to, null, pageable);
    }

    /**
     * Paginated receipts with optional date bounds and text search (receipt no, supplier name snapshot, note).
     */
    public Page<InventoryReceiptResponse> listReceipts(
            LocalDateTime from, LocalDateTime to, String query, Pageable pageable) {
        String q = (query != null && !query.isBlank()) ? query.trim() : null;
        Pageable pageRequest = PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Order.desc("receiptDate"), Sort.Order.desc("id")));
        Specification<InventoryReceipt> spec = Specification.allOf(
                from == null ? null : (root, cq, cb) -> cb.greaterThanOrEqualTo(root.get("receiptDate"), from),
                to == null ? null : (root, cq, cb) -> cb.lessThanOrEqualTo(root.get("receiptDate"), to),
                q == null ? null : (root, cq, cb) -> {
                    String like = "%" + q.toLowerCase(Locale.ROOT) + "%";
                    return cb.or(
                            cb.like(cb.lower(root.get("receiptNo")), like),
                            cb.like(cb.lower(cb.coalesce(root.get("supplierName"), "")), like),
                            cb.like(cb.lower(cb.coalesce(root.get("note"), "")), like));
                });
        Page<Long> idPage = receiptRepo.findAll(spec, pageRequest).map(InventoryReceipt::getId);
        if (idPage.isEmpty()) {
            return new PageImpl<>(List.of(), pageRequest, idPage.getTotalElements());
        }
        List<Long> ids = idPage.getContent();
        Map<Long, InventoryReceipt> byId = receiptRepo.findAllByIdInWithDetails(ids).stream()
                .collect(Collectors.toMap(InventoryReceipt::getId, r -> r, (a, b) -> a));
        List<InventoryReceipt> ordered = ids.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .toList();
        return mapReceiptPageFromOrdered(ordered, pageRequest, idPage.getTotalElements());
    }

    /**
     * Xóa phiếu nhập kho.
     * - Nếu lô hàng đã bán một phần (remainingQty < importQty) → KHÔNG cho xóa.
     * - Nếu chưa bán → xóa batch, rollback stockQty variant, xóa phiếu.
     */
    /**
     * Hủy (void) phiếu nhập: giữ lịch sử phiếu/lô, chỉ trừ phần còn lại theo từng lô, ghi ledger {@code goods_receipt_void}.
     */
    @Transactional
    public InventoryReceiptResponse voidReceipt(Long id, InventoryReceiptVoidRequest req) {
        InventoryReceipt receipt = receiptRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        if (InventoryReceipt.STATUS_VOIDED.equals(receipt.getStatus())) {
            throw new BusinessConflictException(
                    ReceiptDeleteEligibility.REASON_ALREADY_VOIDED,
                    "Phiếu nhập đã bị hủy (void).");
        }

        // CRIT-003: cùng thứ tự lock với deleteReceipt
        List<Long> variantIdsToLock = batchRepo.findByReceiptIdOrderByExpiryDateAsc(id).stream()
                .map(b -> b.getVariant() != null ? b.getVariant().getId() : null)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
        for (Long variantId : variantIdsToLock) {
            variantRepo.findByIdForUpdate(variantId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
        }
        List<ProductBatch> batches = batchRepo.findByReceiptIdForUpdate(id);

        String reason = req != null && req.reason() != null && !req.reason().isBlank() ? req.reason().trim() : null;
        String voidedBy = req != null && req.voidedBy() != null && !req.voidedBy().isBlank() ? req.voidedBy().trim() : null;

        for (ProductBatch batch : batches) {
            if (batch.getVariant() == null) {
                throw new IllegalStateException("Lô hàng thiếu variant — không thể hủy (void) phiếu.");
            }
            int rem = batch.getRemainingQty();
            long bid = batch.getId();
            String sourceId = "receipt:" + id + ":batch:" + bid + ":void";
            if (movementRepo.existsBySourceTypeAndSourceId(MOVEMENT_TYPE_GOODS_RECEIPT_VOID, sourceId)) {
                throw new IllegalStateException(
                        "Trạng thái ledger không khớp: đã tồn tại bút toán void cho lô này.");
            }
            if (rem <= 0) {
                continue;
            }
            Long variantId = batch.getVariant().getId();
            stockMutationService.updateStockWithBatches(
                    variantId, List.of(StockMutationService.BatchStockChange.delta(bid, -rem)));
            appendGoodsReceiptVoidMovement(receipt, batch, rem, voidedBy, reason);
        }

        LocalDateTime now = LocalDateTime.now(businessClock);
        receipt.setStatus(InventoryReceipt.STATUS_VOIDED);
        receipt.setVoidedAt(now);
        receipt.setVoidedBy(voidedBy);
        receipt.setVoidReason(reason);
        receiptRepo.save(receipt);
        return mapToResponse(receipt);
    }

    @Transactional
    public void deleteReceipt(Long id) {
        // CRIT-003: lock theo thứ tự receipt → variant (sorted) → lô của phiếu, rồi mới kiểm tra “đã bán?”
        // và rollback — tránh cửa sổ race với bán hàng và tránh deadlock với luồng bán (variant rồi mới batch).
        InventoryReceipt receipt = receiptRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        if (InventoryReceipt.STATUS_VOIDED.equals(receipt.getStatus())) {
            throw new BusinessConflictException(
                    ReceiptDeleteEligibility.REASON_VOIDED,
                    "Không thể xóa phiếu đã hủy (void).");
        }

        List<Long> variantIdsToLock = batchRepo.findByReceiptIdOrderByExpiryDateAsc(id).stream()
                .map(b -> b.getVariant() != null ? b.getVariant().getId() : null)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
        for (Long variantId : variantIdsToLock) {
            variantRepo.findByIdForUpdate(variantId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
        }

        List<ProductBatch> batches = batchRepo.findByReceiptIdForUpdate(id);

        ReceiptDeleteEligibility deleteEligibility = ReceiptDeleteEligibility.fromBatches(batches);
        if (!deleteEligibility.canDelete()) {
            throw new BusinessConflictException(
                    ReceiptDeleteEligibility.REASON_DOWNSTREAM_CONSUMPTION,
                    "Không thể xóa phiếu nhập — một số lô hàng đã được bán. " +
                            "Hãy tạo phiếu điều chỉnh tồn kho thay thế.");
        }

        Set<Long> affectedVariantIds = new HashSet<>();
        // Rollback tồn kho variant theo batch và fail fast nếu dữ liệu lệch.
        for (ProductBatch batch : batches) {
            if (batch.getVariant() != null) {
                stockMutationService.updateStockWithBatches(
                        batch.getVariant().getId(),
                        List.of(StockMutationService.BatchStockChange.delta(batch.getId(), -batch.getImportQty())));
                affectedVariantIds.add(batch.getVariant().getId());
                appendGoodsReceiptDeleteMovement(receipt, batch);
            }
            movementRepo.clearBatchReferenceByBatchId(batch.getId());
            batchRepo.delete(batch);
        }

        for (Long variantId : affectedVariantIds) {
            stockMutationService.syncVariantStockWithBatches(variantId);
        }

        receiptRepo.delete(receipt);
    }

    private InventoryReceiptResponse mapToResponse(InventoryReceipt r) {
        List<ProductBatch> batches = batchRepo.findByReceiptIdOrderByExpiryDateAsc(r.getId());
        return DtoMapper.toResponse(r, ReceiptDeleteEligibility.forReceipt(r, batches));
    }

    private Page<InventoryReceiptResponse> mapReceiptPage(Page<InventoryReceipt> page) {
        List<InventoryReceipt> content = page.getContent();
        if (content.isEmpty()) {
            return page.map(this::mapToResponse);
        }
        return mapReceiptPageFromOrdered(content, page.getPageable(), page.getTotalElements());
    }

    private Page<InventoryReceiptResponse> mapReceiptPageFromOrdered(
            List<InventoryReceipt> ordered, Pageable pageable, long totalElements) {
        if (ordered.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, totalElements);
        }
        List<Long> receiptIds = ordered.stream().map(InventoryReceipt::getId).toList();
        List<ProductBatch> allBatches = batchRepo.findByReceipt_IdIn(receiptIds);
        Map<Long, List<ProductBatch>> batchesByReceiptId = allBatches.stream()
                .collect(Collectors.groupingBy(b -> b.getReceipt().getId()));
        List<InventoryReceiptResponse> responses = ordered.stream()
                .map(r -> DtoMapper.toResponse(
                        r,
                        ReceiptDeleteEligibility.forReceipt(
                                r,
                                batchesByReceiptId.getOrDefault(r.getId(), List.of()))))
                .toList();
        return new PageImpl<>(responses, pageable, totalElements);
    }

    /**
     * Inbound stock ledger: one row per created batch, after the batch is persisted in
     * {@link StockMutationService#updateStockWithBatches}. {@code batch_id} on the movement is set;
     * DB uses ON DELETE SET NULL when the batch row is removed later.
     */
    private void appendGoodsReceiptMovement(String receiptNo, Long receiptId, ProductBatch batch) {
        if (batch.getVariant() == null) {
            return;
        }
        int qty = batch.getImportQty();
        stockMutationService.appendMovement(
                batch.getVariant().getId(),
                batch.getId(),
                qty,
                MOVEMENT_TYPE_GOODS_RECEIPT,
                "receipt:" + receiptId + ":batch:" + batch.getId(),
                "receiptNo=" + receiptNo
        );
    }

    /**
     * Receipt-delete rollback: one row per batch before the batch is deleted; then DB may null
     * {@code batch_id} on the movement (and on the original {@code goods_receipt} row) per FK rule.
     */
    private void appendGoodsReceiptDeleteMovement(InventoryReceipt receipt, ProductBatch batch) {
        if (batch.getVariant() == null) {
            return;
        }
        int qty = batch.getImportQty();
        Long bid = batch.getId();
        stockMutationService.appendMovement(
                batch.getVariant().getId(),
                bid,
                -qty,
                MOVEMENT_TYPE_GOODS_RECEIPT_DELETE,
                "receipt:" + receipt.getId() + ":batch:" + bid + ":delete",
                "receiptNo=" + receipt.getReceiptNo() + " delete"
        );
    }

    private void appendGoodsReceiptVoidMovement(
            InventoryReceipt receipt, ProductBatch batch, int qtyRemoved, String voidedByOpt, String reasonOpt) {
        StringBuilder note = new StringBuilder("receipt void receiptNo=").append(receipt.getReceiptNo());
        if (voidedByOpt != null) {
            note.append(" voidedBy=").append(voidedByOpt);
        }
        if (reasonOpt != null) {
            note.append(" reason=").append(reasonOpt);
        }
        stockMutationService.appendMovement(
                batch.getVariant().getId(),
                batch.getId(),
                -qtyRemoved,
                MOVEMENT_TYPE_GOODS_RECEIPT_VOID,
                "receipt:" + receipt.getId() + ":batch:" + batch.getId() + ":void",
                note.toString()
        );
    }

    private String buildBatchCode(String receiptNo, String productCode) {
        String base = "BATCH-" + receiptNo + "-" + productCode;
        if (!batchRepo.existsByBatchCode(base)) return base;
        int suffix = 2;
        while (batchRepo.existsByBatchCode(base + "-" + suffix)) suffix++;
        return base + "-" + suffix;
    }

    /**
     * Prescan combo lines: bulk-load combo products + combo item rows, expand in the same order as legacy loop.
     */
    private void expandComboLinesIntoAllItems(InventoryReceiptRequest req, List<ReceiptItemRequest> allItems) {
        if (req.comboItems() == null || req.comboItems().isEmpty()) {
            return;
        }
        Set<Long> comboIdSet = req.comboItems().stream()
                .map(InventoryReceiptRequest.ComboReceiptRequest::comboId)
                .collect(Collectors.toSet());
        List<Product> comboProducts = productRepo.findAllById(comboIdSet);
        Map<Long, Product> comboProductById = comboProducts.stream()
                .collect(Collectors.toMap(Product::getId, p -> p));
        for (Long cid : comboIdSet) {
            Product cp = comboProductById.get(cid);
            if (cp == null) {
                throw new EntityNotFoundException("Không tìm thấy combo ID: " + cid);
            }
            if (!cp.isCombo()) {
                throw new IllegalArgumentException("ID " + cid + " không phải combo");
            }
        }
        List<ProductComboItem> fetchedComboRows = comboRepo.findByComboProduct_IdIn(comboIdSet);
        Map<Long, List<ProductComboItem>> byComboId = fetchedComboRows.stream()
                .collect(Collectors.groupingBy(ci -> ci.getComboProduct().getId()));
        Map<Long, List<ProductComboItem>> sortedByComboId = new HashMap<>();
        for (Map.Entry<Long, List<ProductComboItem>> e : byComboId.entrySet()) {
            List<ProductComboItem> sorted = new ArrayList<>(e.getValue());
            sorted.sort(Comparator.comparing(ProductComboItem::getId, Comparator.nullsFirst(Long::compareTo)));
            sortedByComboId.put(e.getKey(), sorted);
        }
        for (InventoryReceiptRequest.ComboReceiptRequest cr : req.comboItems()) {
            List<ProductComboItem> comboItems = sortedByComboId.getOrDefault(cr.comboId(), List.of());
            int totalComponentQty = comboItems.stream().mapToInt(ProductComboItem::getQuantity).sum();
            BigDecimal totalComboCost = cr.unitCost().multiply(BigDecimal.valueOf(cr.quantity()));
            for (ProductComboItem ci : comboItems) {
                BigDecimal ratio = totalComponentQty > 0
                        ? BigDecimal.valueOf(ci.getQuantity())
                          .divide(BigDecimal.valueOf(totalComponentQty), 10, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
                BigDecimal componentCost = totalComboCost.multiply(ratio)
                        .divide(BigDecimal.valueOf(cr.quantity()), 2, RoundingMode.HALF_UP);
                allItems.add(new ReceiptItemRequest(
                        ci.getProduct().getId(),
                        BigDecimal.valueOf((long) ci.getQuantity() * cr.quantity()),
                        componentCost,
                        safe(cr.discountPercent()),
                        null, null, null,
                        null, 1, null, null
                ));
            }
        }
    }

    private static Optional<ProductImportUnit> findImportUnitInIndex(
            Long productId,
            String reqUnitTrimmed,
            Map<Long, Map<String, ProductImportUnit>> piuByProductNormUnit) {
        Map<String, ProductImportUnit> row = piuByProductNormUnit.get(productId);
        if (row == null) {
            return Optional.empty();
        }
        String key = reqUnitTrimmed.toLowerCase(Locale.ROOT);
        return Optional.ofNullable(row.get(key));
    }

    private static BigDecimal safe(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
