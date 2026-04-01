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
    private final ProductComboRepository comboRepo;  // repo của ProductComboItem

    @Transactional
    public InventoryReceiptResponse createReceipt(InventoryReceiptRequest req) {

        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGen.nextReceiptNo());
        receipt.setSupplierName(req.supplierName());
        receipt.setNote(req.note());
        receipt.setReceiptDate(LocalDateTime.now());

        BigDecimal shippingFee = req.shippingFee() != null ? req.shippingFee() : BigDecimal.ZERO;
        receipt.setShippingFee(shippingFee);

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(receipt::setCreatedBy);

        InventoryReceipt saved = receiptRepo.save(receipt);

        // ── Expand combo items → ReceiptItemRequest thông thường ──────────────
        List<ReceiptItemRequest> allItems = new ArrayList<>();
        if (req.items() != null) allItems.addAll(req.items());

        if (req.comboItems() != null) {
            for (InventoryReceiptRequest.ComboReceiptRequest cr : req.comboItems()) {
                // Dùng Product(COMBO) thay vì ProductCombo cũ
                Product comboProduct = productRepo.findById(cr.comboId())
                        .orElseThrow(() -> new EntityNotFoundException(
                                "Không tìm thấy combo ID: " + cr.comboId()));
                if (!comboProduct.isCombo()) {
                    throw new IllegalArgumentException("ID " + cr.comboId() + " không phải combo");
                }

                List<ProductComboItem> comboItems = comboRepo.findByComboProduct(comboProduct);
                int totalComponentQty = comboItems.stream()
                        .mapToInt(ProductComboItem::getQuantity).sum();

                BigDecimal totalComboCost = cr.unitCost()
                        .multiply(BigDecimal.valueOf(cr.quantity()));

                for (ProductComboItem ci : comboItems) {
                    BigDecimal ratio = totalComponentQty > 0
                            ? BigDecimal.valueOf(ci.getQuantity())
                              .divide(BigDecimal.valueOf(totalComponentQty), 10, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    BigDecimal componentCost = totalComboCost.multiply(ratio)
                            .divide(BigDecimal.valueOf(cr.quantity()), 2, RoundingMode.HALF_UP);

                    allItems.add(new ReceiptItemRequest(
                            ci.getProduct().getId(),
                            ci.getQuantity() * cr.quantity(),
                            componentCost,
                            cr.discountPercent(),
                            cr.vatPercent()
                    ));
                }
            }
        }

        if (allItems.isEmpty()) {
            throw new IllegalArgumentException("Phiếu nhập phải có ít nhất 1 sản phẩm hoặc combo");
        }

        // ── Pass 1: tính discountedLineTotal cho từng dòng (dùng phân bổ ship) ─
        List<BigDecimal> discountedLineTotals = new ArrayList<>();
        BigDecimal totalDiscountedValue = BigDecimal.ZERO;

        for (ReceiptItemRequest itemReq : allItems) {
            BigDecimal disc = safe(itemReq.discountPercent());
            BigDecimal discountedUnit = itemReq.unitCost()
                    .multiply(BigDecimal.ONE.subtract(disc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP)));
            BigDecimal discountedLine = discountedUnit.multiply(BigDecimal.valueOf(itemReq.quantity()));
            discountedLineTotals.add(discountedLine);
            totalDiscountedValue = totalDiscountedValue.add(discountedLine);
        }

        // ── Pass 2: tạo items, batch, cập nhật giá vốn ──────────────────────
        BigDecimal totalAmount = BigDecimal.ZERO;
        BigDecimal totalVat    = BigDecimal.ZERO;
        List<InventoryReceiptItem> items = new ArrayList<>();

        for (int i = 0; i < allItems.size(); i++) {
            ReceiptItemRequest itemReq = allItems.get(i);

            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));

            int addedRetailQty = UnitConverter.toRetailQty(
                    product.getImportUnit(),
                    product.getPiecesPerImportUnit(),
                    itemReq.quantity());

            BigDecimal disc = safe(itemReq.discountPercent());
            BigDecimal vatPct = safe(itemReq.vatPercent());

            // discountedUnitCost (trên đơn vị nhập)
            BigDecimal discountedUnitCost = itemReq.unitCost()
                    .multiply(BigDecimal.ONE.subtract(disc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP)))
                    .setScale(2, RoundingMode.HALF_UP);

            // Phân bổ shippingFee
            BigDecimal discountedLine = discountedLineTotals.get(i);
            BigDecimal shippingAllocatedLine = BigDecimal.ZERO;
            if (totalDiscountedValue.compareTo(BigDecimal.ZERO) > 0) {
                shippingAllocatedLine = shippingFee
                        .multiply(discountedLine)
                        .divide(totalDiscountedValue, 2, RoundingMode.HALF_UP);
            }
            BigDecimal shippingPerUnit = addedRetailQty > 0
                    ? shippingAllocatedLine.divide(BigDecimal.valueOf(addedRetailQty), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            // finalCost trước VAT
            BigDecimal finalCostBeforeVat = discountedUnitCost.add(shippingPerUnit).setScale(2, RoundingMode.HALF_UP);

            // VAT phân bổ trên đơn vị bán lẻ
            //   vatAmount(dòng) = discountedLine × vatPct/100
            //   vatPerUnit      = vatAmount / addedRetailQty
            BigDecimal vatAmountLine = discountedLine
                    .multiply(vatPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP))
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal vatPerUnit = addedRetailQty > 0
                    ? vatAmountLine.divide(BigDecimal.valueOf(addedRetailQty), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            // finalCostWithVat = giá vốn cuối (dùng để tính lợi nhuận)
            BigDecimal finalCostWithVat = finalCostBeforeVat.add(vatPerUnit).setScale(2, RoundingMode.HALF_UP);

            totalVat = totalVat.add(vatAmountLine);

            // Cập nhật product
            product.setCostPrice(finalCostWithVat);
            product.setStockQty(product.getStockQty() + addedRetailQty);
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);

            // Tạo Batch
            LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                    ? LocalDate.now().plusDays(product.getExpiryDays())
                    : LocalDate.now().plusYears(10);
            String batchCode = buildBatchCode(saved.getReceiptNo(), product.getCode());
            ProductBatch batch = new ProductBatch();
            batch.setProduct(product);
            batch.setReceipt(saved);
            batch.setBatchCode(batchCode);
            batch.setExpiryDate(expiryDate);
            batch.setImportQty(addedRetailQty);
            batch.setRemainingQty(addedRetailQty);
            batch.setCostPrice(finalCostWithVat);
            batchRepo.save(batch);

            // Tạo ReceiptItem
            InventoryReceiptItem item = new InventoryReceiptItem();
            item.setReceipt(saved);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setUnitCost(itemReq.unitCost());
            item.setDiscountPercent(disc);
            item.setDiscountedCost(discountedUnitCost);
            item.setVatPercent(vatPct);
            item.setVatAllocated(vatPerUnit);
            item.setShippingAllocated(shippingPerUnit);
            item.setFinalCost(finalCostBeforeVat);
            item.setFinalCostWithVat(finalCostWithVat);

            totalAmount = totalAmount.add(
                    itemReq.unitCost().multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        saved.setTotalAmount(totalAmount);
        saved.setTotalVat(totalVat);
        saved.getItems().addAll(items);

        return DtoMapper.toResponse(receiptRepo.save(saved));
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

    private static BigDecimal safe(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
