package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class InvoiceService {

    private final SalesInvoiceRepository invoiceRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final InvoiceNumberGenerator numberGen;
    private final ProductBatchService batchService;
    private final PromotionRepository promotionRepo;

    @Transactional
    public SalesInvoiceResponse createInvoice(SalesInvoiceRequest req) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setCustomerName(req.customerName());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now());

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        // Load + validate promotion trước khi xử lý items
        Promotion promo = null;
        if (req.promotionId() != null) {
            promo = promotionRepo.findById(req.promotionId()).orElse(null);
            if (promo == null || !promo.isCurrentlyActive()) {
                throw new IllegalArgumentException(
                        "Chuong trinh khuyen mai khong ton tai hoac da het han");
            }
        }

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<SalesInvoiceItem> items = new ArrayList<>();

        for (InvoiceItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Khong tim thay san pham ID: " + itemReq.productId()));

            if (!product.getActive()) {
                throw new IllegalArgumentException(
                        "San pham '" + product.getName() + "' da ngung kinh doanh");
            }
            if (product.getStockQty() < itemReq.quantity()) {
                throw new IllegalArgumentException(
                        "San pham '" + product.getName() + "' khong du hang. " +
                        "Ton kho: " + product.getStockQty() + ", yeu cau: " + itemReq.quantity());
            }

            BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
                    product.getId(), itemReq.quantity());

            product.setStockQty(product.getStockQty() - itemReq.quantity());
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);

            // Chiết khấu % trên từng dòng
            BigDecimal lineDiscPct = itemReq.discountPercent() != null
                    ? itemReq.discountPercent() : BigDecimal.ZERO;
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    lineDiscPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal actualUnitPrice = product.getSellPrice()
                    .multiply(discountFactor).setScale(0, RoundingMode.HALF_UP);

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setOriginalUnitPrice(product.getSellPrice());
            item.setLineDiscountPercent(lineDiscPct);
            item.setUnitPrice(actualUnitPrice);
            item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
                    ? fefoAvgCost : product.getCostPrice());

            totalAmount = totalAmount.add(
                    actualUnitPrice.multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        invoice.setTotalAmount(totalAmount);
        invoice.getItems().addAll(items);

        // Apply promotion-level discount
        BigDecimal discountAmount = BigDecimal.ZERO;
        if (promo != null) {
            validatePromotionEligibility(promo, items);
            discountAmount = computePromotionDiscount(promo, items, totalAmount);
            invoice.setPromotionId(promo.getId());
            invoice.setPromotionName(promo.getName());
        }
        invoice.setDiscountAmount(discountAmount);

        SalesInvoice saved = invoiceRepo.save(invoice);
        return DtoMapper.toResponse(saved);
    }

    /**
     * Validate hóa đơn có đủ điều kiện áp dụng promotion không.
     * Ném IllegalArgumentException nếu không thỏa.
     */
    private void validatePromotionEligibility(Promotion promo, List<SalesInvoiceItem> items) {
        String appliesTo = promo.getAppliesTo();

        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> eligibleIds = promo.getProducts().stream()
                    .map(p -> p.getId()).collect(Collectors.toSet());
            boolean hasEligible = items.stream()
                    .anyMatch(i -> eligibleIds.contains(i.getProduct().getId()));
            if (!hasEligible) {
                String names = promo.getProducts().stream()
                        .map(p -> p.getName()).collect(Collectors.joining(", "));
                throw new IllegalArgumentException(
                        "Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho san pham: " + names
                        + ". Hoa don khong co san pham nao thuoc danh sach nay.");
            }
        } else if ("CATEGORY".equals(appliesTo)) {
            Set<Long> eligibleCatIds = promo.getCategories().stream()
                    .map(c -> c.getId()).collect(Collectors.toSet());
            boolean hasEligible = items.stream()
                    .anyMatch(i -> eligibleCatIds.contains(
                            i.getProduct().getCategory().getId()));
            if (!hasEligible) {
                String names = promo.getCategories().stream()
                        .map(c -> c.getName()).collect(Collectors.joining(", "));
                throw new IllegalArgumentException(
                        "Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho danh muc: " + names
                        + ". Hoa don khong co san pham nao thuoc danh muc nay.");
            }
        }
        // ALL: không cần validate thêm
    }

    /**
     * Tính discount từ promotion.
     * Chỉ tính trên phần eligible (sản phẩm/danh mục được phép).
     */
    private BigDecimal computePromotionDiscount(Promotion promo,
                                                List<SalesInvoiceItem> items,
                                                BigDecimal totalAmount) {
        BigDecimal eligibleAmount = computeEligibleAmount(promo, items, totalAmount);

        // Kiểm tra đơn tối thiểu
        if (totalAmount.compareTo(promo.getMinOrderValue()) < 0) {
            return BigDecimal.ZERO;
        }

        return switch (promo.getType()) {
            case "PERCENT_DISCOUNT" -> {
                BigDecimal pct = promo.getDiscountValue()
                        .divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
                BigDecimal disc = eligibleAmount.multiply(pct).setScale(0, RoundingMode.HALF_UP);
                if (promo.getMaxDiscount() != null
                        && disc.compareTo(promo.getMaxDiscount()) > 0) {
                    disc = promo.getMaxDiscount();
                }
                yield disc;
            }
            case "FIXED_DISCOUNT" -> {
                BigDecimal disc = promo.getDiscountValue();
                yield disc.compareTo(eligibleAmount) > 0 ? eligibleAmount : disc;
            }
            // BUY_X_GET_Y, FREE_SHIPPING: chỉ ghi nhận tên KM, không trừ tiền tự động
            default -> BigDecimal.ZERO;
        };
    }

    private BigDecimal computeEligibleAmount(Promotion promo,
                                             List<SalesInvoiceItem> items,
                                             BigDecimal totalAmount) {
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) return totalAmount;

        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> ids = promo.getProducts().stream()
                    .map(p -> p.getId()).collect(Collectors.toSet());
            return items.stream()
                    .filter(i -> ids.contains(i.getProduct().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        if ("CATEGORY".equals(appliesTo)) {
            Set<Long> ids = promo.getCategories().stream()
                    .map(c -> c.getId()).collect(Collectors.toSet());
            return items.stream()
                    .filter(i -> ids.contains(i.getProduct().getCategory().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        return totalAmount;
    }

    public SalesInvoiceResponse getInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Khong tim thay hoa don ID: " + id));
        return DtoMapper.toResponse(inv);
    }

    public Page<SalesInvoiceResponse> listInvoices(Pageable pageable) {
        return invoiceRepo.findAllByOrderByInvoiceDateDesc(pageable)
                .map(DtoMapper::toResponse);
    }

    public Page<SalesInvoiceResponse> listInvoicesByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return invoiceRepo.findByInvoiceDateBetweenOrderByInvoiceDateDesc(from, to, pageable)
                .map(DtoMapper::toResponse);
    }

    @Transactional
    public void deleteInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Khong tim thay hoa don ID: " + id));
        for (SalesInvoiceItem item : inv.getItems()) {
            Product p = item.getProduct();
            p.setStockQty(p.getStockQty() + item.getQuantity());
            p.setUpdatedAt(LocalDateTime.now());
            productRepo.save(p);
            batchService.restoreStockOnCancel(p.getId(), item.getQuantity());
        }
        invoiceRepo.delete(inv);
    }
}
