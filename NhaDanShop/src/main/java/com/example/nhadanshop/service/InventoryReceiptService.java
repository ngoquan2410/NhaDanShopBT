package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.InventoryReceiptResponse;
import com.example.nhadanshop.dto.ReceiptItemRequest;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class InventoryReceiptService {

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

    @Transactional
    public InventoryReceiptResponse createReceipt(InventoryReceiptRequest req) {

        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGen.nextReceiptNo());
        receipt.setSupplierName(req.supplierName());
        receipt.setNote(req.note());

        // Dùng receiptDate từ request nếu có và không phải tương lai, ngược lại dùng now()
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime receiptDate = (req.receiptDate() != null && !req.receiptDate().isAfter(LocalDate.now()))
                ? req.receiptDate().atStartOfDay()
                : now;
        receipt.setReceiptDate(receiptDate);

        // Sprint 1 S1-3: set supplier FK nếu có supplierId
        if (req.supplierId() != null) {
            supplierRepository.findById(req.supplierId()).ifPresent(receipt::setSupplier);
        }

        BigDecimal shippingFee = safe(req.shippingFee());
        BigDecimal vatPctOrder = safe(req.vatPercent());
        receipt.setShippingFee(shippingFee);

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(receipt::setCreatedBy);

        InventoryReceipt saved = receiptRepo.save(receipt);

        // ── Expand combo items → ReceiptItemRequest đơn lẻ ──────────────────
        List<ReceiptItemRequest> allItems = new ArrayList<>();
        if (req.items() != null) allItems.addAll(req.items());

        if (req.comboItems() != null) {
            for (InventoryReceiptRequest.ComboReceiptRequest cr : req.comboItems()) {
                Product comboProduct = productRepo.findById(cr.comboId())
                        .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy combo ID: " + cr.comboId()));
                if (!comboProduct.isCombo())
                    throw new IllegalArgumentException("ID " + cr.comboId() + " không phải combo");

                List<ProductComboItem> comboItems = comboRepo.findByComboProduct(comboProduct);
                int totalComponentQty = comboItems.stream().mapToInt(ProductComboItem::getQuantity).sum();
                BigDecimal totalComboCost = cr.unitCost().multiply(BigDecimal.valueOf(cr.quantity()));

                for (ProductComboItem ci : comboItems) {
                    BigDecimal ratio = totalComponentQty > 0
                            ? BigDecimal.valueOf(ci.getQuantity())
                              .divide(BigDecimal.valueOf(totalComponentQty), 10, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    BigDecimal componentCost = totalComboCost.multiply(ratio)
                            .divide(BigDecimal.valueOf(cr.quantity()), 2, RoundingMode.HALF_UP);
                    // Combo component: dùng ATOMIC (pieces=1) vì qty đã là bán lẻ
                    allItems.add(new ReceiptItemRequest(
                            ci.getProduct().getId(),
                            ci.getQuantity() * cr.quantity(),
                            componentCost,
                            safe(cr.discountPercent()),
                            null, 1, null, null // importUnit=null, pieces=1, variantId=null, expiryDateOverride=null
                    ));
                }
            }
        }

        if (allItems.isEmpty())
            throw new IllegalArgumentException("Phiếu nhập phải có ít nhất 1 sản phẩm hoặc combo");

        // ── Pass 1: Resolve pieces + tính discountedLineTotal ──────────────
        List<BigDecimal> discountedLineTotals = new ArrayList<>();
        List<Integer>    resolvedPiecesList   = new ArrayList<>();
        List<String>     resolvedImportUnits  = new ArrayList<>();
        BigDecimal totalDiscountedValue = BigDecimal.ZERO;

        for (ReceiptItemRequest itemReq : allItems) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy SP ID: " + itemReq.productId()));

            // ── Resolve pieces: Excel/Request → product_import_units lookup → product default ──
            int pieces;
            String importUnitUsed;

            if (itemReq.importUnit() != null && !itemReq.importUnit().isBlank()) {
                // Có chỉ định ĐV nhập → lookup bảng product_import_units
                String reqUnit = itemReq.importUnit().trim();
                var piu = importUnitRepo.findByProductIdAndImportUnitIgnoreCase(product.getId(), reqUnit);
                if (piu.isPresent()) {
                    // Ưu tiên: nếu request có pieces override → dùng override; else dùng gợi ý từ DB
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : piu.get().getPiecesPerUnit();
                } else {
                    // ĐV chưa đăng ký → dùng pieces từ request hoặc fallback từ default variant
                    ProductVariant dvFb = product.getDefaultVariant();
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : UnitConverter.effectivePieces(reqUnit, dvFb != null ? dvFb.getPiecesPerUnit() : null);
                }
                importUnitUsed = reqUnit;
            } else {
                // Không chỉ định ĐV → dùng default của SP
                var defaultPiu = importUnitRepo.findByProductIdAndIsDefaultTrue(product.getId());
                if (defaultPiu.isPresent()) {
                    pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
                            ? itemReq.piecesOverride()
                            : defaultPiu.get().getPiecesPerUnit();
                    importUnitUsed = defaultPiu.get().getImportUnit();
                } else {
                    // Fallback: đọc từ default variant
                    ProductVariant dv = product.getDefaultVariant();
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
                    .multiply(BigDecimal.valueOf(itemReq.quantity()))
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

            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy SP ID: " + itemReq.productId()));

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

            // Cập nhật variant.costPrice + variant.stockQty
            variant.setCostPrice(finalCostWithVat);
            variant.setStockQty(variant.getStockQty() + addedRetailQty);
            variant.setUpdatedAt(LocalDateTime.now());
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
            batchRepo.save(batch);

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

        InventoryReceiptResponse result = DtoMapper.toResponse(receiptRepo.save(saved));

        // ── Refresh virtual stock của tất cả combo chứa SP vừa nhập ─────────
        // Sau khi stockQty của các SP đơn tăng → min(component/qty) thay đổi
        allItems.stream()
                .map(ReceiptItemRequest::productId)
                .distinct()
                .forEach(comboService::refreshCombosContaining);

        return result;
    }

    public InventoryReceiptResponse getReceipt(Long id) {
        InventoryReceipt r = receiptRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        return DtoMapper.toResponse(r);
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
            receipt.setSupplier(supplier);
            receipt.setSupplierName(supplier.getName());
        } else if (req.supplierName() != null) {
            receipt.setSupplierName(req.supplierName().isBlank() ? null : req.supplierName().trim());
        }
        // Cho phép sửa ngày nhập — không được là ngày tương lai
        if (req.receiptDate() != null) {
            if (req.receiptDate().isAfter(LocalDate.now())) {
                throw new IllegalArgumentException("Ngày nhập không được là ngày tương lai");
            }
            receipt.setReceiptDate(req.receiptDate().atStartOfDay());
        }
        return DtoMapper.toResponse(receiptRepo.save(receipt));
    }

    public Page<InventoryReceiptResponse> listReceipts(Pageable pageable) {
        return receiptRepo.findAllByOrderByReceiptDateDesc(pageable).map(DtoMapper::toResponse);
    }

    public Page<InventoryReceiptResponse> listReceiptsByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return receiptRepo.findByReceiptDateBetweenOrderByReceiptDateDesc(from, to, pageable)
                .map(DtoMapper::toResponse);
    }

    /**
     * Xóa phiếu nhập kho.
     * - Nếu lô hàng đã bán một phần (remainingQty < importQty) → KHÔNG cho xóa.
     * - Nếu chưa bán → xóa batch, rollback stockQty variant, xóa phiếu.
     */
    @Transactional
    public void deleteReceipt(Long id) {
        InventoryReceipt receipt = receiptRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));

        List<ProductBatch> batches = batchRepo.findByReceiptIdOrderByExpiryDateAsc(id);

        // Kiểm tra lô đã bán chưa
        boolean hasSoldBatches = batches.stream()
                .anyMatch(b -> b.getRemainingQty() < b.getImportQty());
        if (hasSoldBatches) {
            throw new IllegalStateException(
                "Không thể xóa phiếu nhập — một số lô hàng đã được bán. " +
                "Hãy tạo phiếu điều chỉnh tồn kho thay thế.");
        }

        // Rollback tồn kho variant
        for (ProductBatch batch : batches) {
            if (batch.getVariant() != null) {
                ProductVariant v = batch.getVariant();
                v.setStockQty(Math.max(0, v.getStockQty() - batch.getImportQty()));
                variantRepo.save(v);
            }
            batchRepo.delete(batch);
        }

        receiptRepo.delete(receipt);
    }

    private String buildBatchCode(String receiptNo, String productCode) {
        String base = "BATCH-" + receiptNo + "-" + productCode;
        if (!batchRepo.existsByBatchCode(base)) return base;
        int suffix = 2;
        while (batchRepo.existsByBatchCode(base + "-" + suffix)) suffix++;
        return base + "-" + suffix;
    }

    private static BigDecimal safe(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
