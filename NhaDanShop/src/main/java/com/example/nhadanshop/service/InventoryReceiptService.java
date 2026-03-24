package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.InventoryReceiptResponse;
import com.example.nhadanshop.dto.ReceiptItemRequest;
import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.InventoryReceiptItem;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
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

    @Transactional
    public InventoryReceiptResponse createReceipt(InventoryReceiptRequest req) {
        InventoryReceipt receipt = new InventoryReceipt();
        receipt.setReceiptNo(numberGen.nextReceiptNo());
        receipt.setSupplierName(req.supplierName());
        receipt.setNote(req.note());
        receipt.setReceiptDate(LocalDateTime.now());

        // Gán người tạo
        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(receipt::setCreatedBy);

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<InventoryReceiptItem> items = new ArrayList<>();

        // Lưu receipt trước để có ID dùng cho batch_code
        InventoryReceipt saved = receiptRepo.save(receipt);

        for (ReceiptItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));

            // Quy đổi số lượng nhập → đơn vị bán lẻ
            // Nếu importUnit là "bịch"/"hộp" → atomic, không nhân pieces
            // Nếu importUnit là "kg"/"xâu"   → nhân piecesPerImportUnit
            int addedRetailQty = UnitConverter.toRetailQty(
                    product.getImportUnit(),
                    product.getPiecesPerImportUnit(),
                    itemReq.quantity());

            // Cập nhật giá vốn mới nhất và cộng tồn kho
            product.setCostPrice(itemReq.unitCost());
            product.setStockQty(product.getStockQty() + addedRetailQty);
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);

            // ── Tạo lô hàng (Batch) ──────────────────────────────────────────
            LocalDate expiryDate = (product.getExpiryDays() != null && product.getExpiryDays() > 0)
                    ? LocalDate.now().plusDays(product.getExpiryDays())
                    : LocalDate.now().plusYears(10); // Không có expiryDays → 10 năm

            String batchCode = buildBatchCode(saved.getReceiptNo(), product.getCode());

            ProductBatch batch = new ProductBatch();
            batch.setProduct(product);
            batch.setReceipt(saved);
            batch.setBatchCode(batchCode);
            batch.setExpiryDate(expiryDate);
            batch.setImportQty(addedRetailQty);
            batch.setRemainingQty(addedRetailQty);
            batch.setCostPrice(itemReq.unitCost());
            batchRepo.save(batch);
            // ─────────────────────────────────────────────────────────────────

            InventoryReceiptItem item = new InventoryReceiptItem();
            item.setReceipt(saved);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setUnitCost(itemReq.unitCost());

            totalAmount = totalAmount.add(
                    itemReq.unitCost().multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        saved.setTotalAmount(totalAmount);
        saved.getItems().addAll(items);

        return DtoMapper.toResponse(receiptRepo.save(saved));
    }

    public InventoryReceiptResponse getReceipt(Long id) {
        InventoryReceipt r = receiptRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy phiếu nhập ID: " + id));
        return DtoMapper.toResponse(r);
    }

    public Page<InventoryReceiptResponse> listReceipts(Pageable pageable) {
        return receiptRepo.findAllByOrderByReceiptDateDesc(pageable)
                .map(DtoMapper::toResponse);
    }

    public Page<InventoryReceiptResponse> listReceiptsByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return receiptRepo.findByReceiptDateBetweenOrderByReceiptDateDesc(from, to, pageable)
                .map(DtoMapper::toResponse);
    }

    /** Sinh mã lô: BATCH-{receiptNo}-{productCode}, đảm bảo unique */
    private String buildBatchCode(String receiptNo, String productCode) {
        String base = "BATCH-" + receiptNo + "-" + productCode;
        if (!batchRepo.existsByBatchCode(base)) return base;
        // Nếu trùng (nhập lại cùng sản phẩm trong 1 phiếu), thêm suffix
        int suffix = 2;
        while (batchRepo.existsByBatchCode(base + "-" + suffix)) suffix++;
        return base + "-" + suffix;
    }
}
