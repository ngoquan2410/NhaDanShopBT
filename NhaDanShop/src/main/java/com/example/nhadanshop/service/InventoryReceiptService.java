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
    private final ProductVariantService variantService; // Sprint 0
    private final ProductVariantRepository variantRepo;  // Sprint 0 — explicit save
    private final ProductComboService comboService;      // Combo KiotViet — refresh virtual stock

    @Transactional
    public InventoryReceiptResponse createReceipt(InventoryReceiptRequest req) {

        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGen.nextReceiptNo());
        receipt.setSupplierName(req.supplierName());
        receipt.setNote(req.note());
        receipt.setReceiptDate(LocalDateTime.now());

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
                            null, 1, null  // importUnit=null, pieces=1 (ATOMIC), variantId=null→default
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
            LocalDate expiryDate = (variant.getExpiryDays() != null && variant.getExpiryDays() > 0)
                    ? LocalDate.now().plusDays(variant.getExpiryDays())
                    : LocalDate.now().plusYears(10);
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
            item.setVariant(variant); // [Sprint 0]
            item.setQuantity(itemReq.quantity());
            item.setUnitCost(itemReq.unitCost());
            item.setDiscountPercent(disc);
            item.setDiscountedCost(discountedUnitCost);
            item.setVatPercent(vatPctOrder);
            item.setVatAllocated(vatPerUnit);
            item.setShippingAllocated(shippingPerUnit);
            item.setFinalCost(finalCostBeforeVat);
            item.setFinalCostWithVat(finalCostWithVat);
            // ── [BƯỚC 1] Ghi snapshot bất biến ──
            item.setImportUnitUsed(importUnitUsed);
            item.setPiecesUsed(pieces);
            item.setRetailQtyAdded(addedRetailQty);

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

    public Page<InventoryReceiptResponse> listReceipts(Pageable pageable) {
        return receiptRepo.findAllByOrderByReceiptDateDesc(pageable).map(DtoMapper::toResponse);
    }

    public Page<InventoryReceiptResponse> listReceiptsByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return receiptRepo.findByReceiptDateBetweenOrderByReceiptDateDesc(from, to, pageable)
                .map(DtoMapper::toResponse);
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
