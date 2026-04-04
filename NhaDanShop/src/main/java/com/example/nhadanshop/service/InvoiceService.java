package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
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
    private final ProductVariantService variantService; // Sprint 0
    private final ProductVariantRepository variantRepo; // Sprint 0 — explicit save

    @Transactional
    public SalesInvoiceResponse createInvoice(SalesInvoiceRequest req) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setCustomerName(req.customerName());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now());

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        Promotion promo = null;
        if (req.promotionId() != null) {
            promo = promotionRepo.findById(req.promotionId()).orElse(null);
            if (promo == null || !promo.isCurrentlyActive()) {
                throw new IllegalArgumentException("Chuong trinh khuyen mai khong ton tai hoac da het han");
            }
        }

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<SalesInvoiceItem> items = new ArrayList<>();

        for (InvoiceItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Khong tim thay san pham ID: " + itemReq.productId()));

            if (!product.getActive())
                throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");

            // [Sprint 0] Resolve variant — null variantId → dùng default variant
            ProductVariant variant = variantService.resolveVariant(itemReq.variantId(), product.getId());

            // Kiểm tra tồn kho theo variant
            if (variant.getStockQty() < itemReq.quantity()) {
                throw new IllegalArgumentException(
                        "San pham '" + product.getName() + "' [" + variant.getVariantCode() + "] " +
                        "khong du hang. Ton kho: " + variant.getStockQty() +
                        ", yeu cau: " + itemReq.quantity());
            }

            // FEFO deduct theo variant_id
            BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
                    product.getId(), variant.getId(), itemReq.quantity());

            // Trừ variant.stockQty
            variant.setStockQty(variant.getStockQty() - itemReq.quantity());
            variant.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(variant);
            // Đồng bộ product.stockQty tổng hợp
            product.setStockQty(Math.max(0, product.getStockQty() - itemReq.quantity()));
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);

            BigDecimal lineDiscPct = itemReq.discountPercent() != null ? itemReq.discountPercent() : BigDecimal.ZERO;
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    lineDiscPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal actualUnitPrice = variant.getSellPrice()
                    .multiply(discountFactor).setScale(0, RoundingMode.HALF_UP);

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.setVariant(variant); // [Sprint 0]
            item.setQuantity(itemReq.quantity());
            item.setOriginalUnitPrice(variant.getSellPrice());
            item.setLineDiscountPercent(lineDiscPct);
            item.setUnitPrice(actualUnitPrice);
            item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
                    ? fefoAvgCost : variant.getCostPrice());

            totalAmount = totalAmount.add(actualUnitPrice.multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        invoice.setTotalAmount(totalAmount);
        invoice.getItems().addAll(items);

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

    private void validatePromotionEligibility(Promotion promo, List<SalesInvoiceItem> items) {
        String appliesTo = promo.getAppliesTo();
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> eligibleIds = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            boolean hasEligible = items.stream().anyMatch(i -> eligibleIds.contains(i.getProduct().getId()));
            if (!hasEligible) {
                String names = promo.getProducts().stream().map(Product::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho san pham: " + names);
            }
        } else if ("CATEGORY".equals(appliesTo)) {
            Set<Long> eligibleCatIds = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            boolean hasEligible = items.stream().anyMatch(i -> eligibleCatIds.contains(i.getProduct().getCategory().getId()));
            if (!hasEligible) {
                String names = promo.getCategories().stream().map(Category::getName).collect(Collectors.joining(", "));
                throw new IllegalArgumentException("Chuong trinh KM '" + promo.getName()
                        + "' chi ap dung cho danh muc: " + names);
            }
        }
    }

    private BigDecimal computePromotionDiscount(Promotion promo, List<SalesInvoiceItem> items, BigDecimal totalAmount) {
        BigDecimal eligibleAmount = computeEligibleAmount(promo, items, totalAmount);
        if (totalAmount.compareTo(promo.getMinOrderValue()) < 0) return BigDecimal.ZERO;
        return switch (promo.getType()) {
            case "PERCENT_DISCOUNT" -> {
                BigDecimal pct = promo.getDiscountValue().divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
                BigDecimal disc = eligibleAmount.multiply(pct).setScale(0, RoundingMode.HALF_UP);
                if (promo.getMaxDiscount() != null && disc.compareTo(promo.getMaxDiscount()) > 0) disc = promo.getMaxDiscount();
                yield disc;
            }
            case "FIXED_DISCOUNT" -> {
                BigDecimal disc = promo.getDiscountValue();
                yield disc.compareTo(eligibleAmount) > 0 ? eligibleAmount : disc;
            }
            default -> BigDecimal.ZERO;
        };
    }

    private BigDecimal computeEligibleAmount(Promotion promo, List<SalesInvoiceItem> items, BigDecimal totalAmount) {
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) return totalAmount;
        if ("PRODUCT".equals(appliesTo)) {
            Set<Long> ids = promo.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            return items.stream().filter(i -> ids.contains(i.getProduct().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        if ("CATEGORY".equals(appliesTo)) {
            Set<Long> ids = promo.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
            return items.stream().filter(i -> ids.contains(i.getProduct().getCategory().getId()))
                    .map(i -> i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        return totalAmount;
    }

    public SalesInvoiceResponse getInvoice(Long id) {
        return DtoMapper.toResponse(invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id)));
    }

    public Page<SalesInvoiceResponse> listInvoices(Pageable pageable) {
        return invoiceRepo.findAllByOrderByInvoiceDateDesc(pageable).map(DtoMapper::toResponse);
    }

    public Page<SalesInvoiceResponse> listInvoicesByDateRange(LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return invoiceRepo.findByInvoiceDateBetweenOrderByInvoiceDateDesc(from, to, pageable).map(DtoMapper::toResponse);
    }

    @Transactional
    public void deleteInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id));
        for (SalesInvoiceItem item : inv.getItems()) {
            Product p = item.getProduct();
            p.setStockQty(p.getStockQty() + item.getQuantity());
            p.setUpdatedAt(LocalDateTime.now());
            productRepo.save(p);
            // [Sprint 0] Restore theo variant nếu có
            Long variantId = item.getVariant() != null ? item.getVariant().getId() : null;
            if (item.getVariant() != null) {
                item.getVariant().setStockQty(item.getVariant().getStockQty() + item.getQuantity());
                variantRepo.save(item.getVariant());
            }
            batchService.restoreStockOnCancel(p.getId(), variantId, item.getQuantity());
        }
        invoiceRepo.delete(inv);
    }
}


