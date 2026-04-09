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
    private final ProductComboRepository comboItemRepo; // Combo KiotViet
    private final ProductComboService comboService;     // Combo KiotViet — refreshVirtualStock
    private final CustomerRepository customerRepository; // Sprint 2
    private final CustomerService customerService;       // Sprint 2

    @Transactional
    public SalesInvoiceResponse createInvoice(SalesInvoiceRequest req) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now());

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        // Sprint 2: set customer FK + snapshot name
        if (req.customerId() != null) {
            customerRepository.findById(req.customerId()).ifPresent(customer -> {
                invoice.setCustomer(customer);
                invoice.setCustomerName(customer.getName()); // snapshot
            });
        }
        // Fallback: nhập tay tên KH (khách vãng lai)
        if (invoice.getCustomerName() == null && req.customerName() != null) {
            invoice.setCustomerName(req.customerName());
        }

        Promotion promo = null;
        if (req.promotionId() != null) {
            promo = promotionRepo.findById(req.promotionId()).orElse(null);
            if (promo == null || !promo.isCurrentlyActive()) {
                throw new IllegalArgumentException("Chuong trinh khuyen mai khong ton tai hoac da het han");
            }
        }

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<SalesInvoiceItem> items = new ArrayList<>();

        // Tập hợp product_id bị ảnh hưởng để refresh combo virtual stock sau khi lưu
        Set<Long> affectedProductIds = new java.util.HashSet<>();

        for (InvoiceItemRequest itemReq : req.items()) {

            // ── Combo KiotViet: expand combo → nhiều line items ──────────────
            if (itemReq.comboId() != null) {
                totalAmount = totalAmount.add(
                    expandComboToItems(itemReq.comboId(), itemReq.quantity(),
                                       invoice, items, affectedProductIds));
                continue;
            }

            // ── Sản phẩm đơn (SINGLE) ────────────────────────────────────────
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Khong tim thay san pham ID: " + itemReq.productId()));

            if (!product.getActive())
                throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");

            if (product.isCombo())
                throw new IllegalArgumentException(
                    "San pham '" + product.getName() + "' la combo. " +
                    "Vui long dung comboId de ban combo theo mo hinh KiotViet.");

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

            // Trừ variant.stockQty (single source of truth)
            variant.setStockQty(variant.getStockQty() - itemReq.quantity());
            variant.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(variant);
            affectedProductIds.add(product.getId());

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
            // comboSourceId = null (bán lẻ thường)

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

        // ── Refresh virtual stock của tất cả combo chứa SP bị ảnh hưởng ──────
        affectedProductIds.forEach(comboService::refreshCombosContaining);

        // Sprint 2: cộng total_spend cho KH nếu có
        if (saved.getCustomer() != null) {
            customerService.addSpend(saved.getCustomer().getId(),
                    saved.getTotalAmount().subtract(saved.getDiscountAmount()));
        }

        return DtoMapper.toResponse(saved);
    }

    // ── Combo KiotViet: Expand combo → nhiều line items ───────────────────────

    /**
     * Expand 1 combo (comboQty lần) thành nhiều SalesInvoiceItem.
     * Mỗi thành phần → 1 invoice item riêng.
     * Tất cả item đều có combo_source_id = comboId để trace.
     * Giá bán từng item = 0 (combo được tính tổng ở combo level)
     * → Hóa đơn chỉ tính tiền theo giá combo: combQty × combo.sellPrice
     *
     * KiotViet model:
     *   - Ghi nhận kho: trừ từng thành phần × qty
     *   - Ghi nhận doanh thu: theo giá combo (không phải tổng thành phần)
     *   - Hiển thị HĐ: gom lại theo comboSourceId để show 1 dòng "Combo X × N"
     */
    private BigDecimal expandComboToItems(Long comboId, int comboQty,
                                           SalesInvoice invoice,
                                           List<SalesInvoiceItem> items,
                                           Set<Long> affectedProductIds) {
        // Load combo
        Product combo = productRepo.findById(comboId)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay combo ID: " + comboId));
        if (!combo.isCombo())
            throw new IllegalArgumentException("San pham ID " + comboId + " khong phai combo");
        if (!combo.getActive())
            throw new IllegalArgumentException("Combo '" + combo.getName() + "' da ngung kinh doanh");

        // Lấy giá bán combo từ default variant
        ProductVariant comboVariant = variantRepo.findByProductIdAndIsDefaultTrue(comboId)
                .orElseThrow(() -> new IllegalStateException(
                    "Combo '" + combo.getName() + "' chua co default variant. Vui long cap nhat combo."));
        BigDecimal comboSellPrice = comboVariant.getSellPrice();

        // Lấy danh sách thành phần
        List<ProductComboItem> comboItems = comboItemRepo.findByComboProduct(combo);
        if (comboItems.isEmpty())
            throw new IllegalStateException("Combo '" + combo.getName() + "' chua co thanh phan nao");

        // Kiểm tra tồn kho đủ cho tất cả thành phần trước khi trừ
        for (ProductComboItem ci : comboItems) {
            Product component = ci.getProduct();
            ProductVariant compVariant = variantService.resolveVariant(null, component.getId());
            int required = ci.getQuantity() * comboQty;
            if (compVariant.getStockQty() < required) {
                throw new IllegalArgumentException(
                    "Combo '" + combo.getName() + "': Thanh phan '" + component.getName() +
                    "' khong du hang. Can: " + required + ", ton kho: " + compVariant.getStockQty());
            }
        }

        // Trừ kho và tạo invoice items
        BigDecimal totalComboRevenue = comboSellPrice.multiply(BigDecimal.valueOf(comboQty));

        // Phân bổ doanh thu combo theo tỷ lệ giá vốn từng thành phần
        BigDecimal totalCost = comboItems.stream()
                .map(ci -> {
                    ProductVariant v = ci.getProduct().getDefaultVariant();
                    BigDecimal cost = v != null ? v.getCostPrice() : BigDecimal.ZERO;
                    return cost.multiply(BigDecimal.valueOf(ci.getQuantity()));
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        for (int i = 0; i < comboItems.size(); i++) {
            ProductComboItem ci = comboItems.get(i);
            Product component = ci.getProduct();
            ProductVariant compVariant = variantService.resolveVariant(null, component.getId());
            int requiredQty = ci.getQuantity() * comboQty;

            // FEFO deduct
            BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
                    component.getId(), compVariant.getId(), requiredQty);

            // Trừ variant stock
            compVariant.setStockQty(compVariant.getStockQty() - requiredQty);
            compVariant.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(compVariant);
            affectedProductIds.add(component.getId());

            // Phân bổ doanh thu combo theo tỷ lệ giá vốn thành phần (hoặc chia đều nếu cost = 0)
            BigDecimal componentCost = totalCost.compareTo(BigDecimal.ZERO) > 0
                    ? compVariant.getCostPrice().multiply(BigDecimal.valueOf(ci.getQuantity()))
                    : BigDecimal.ZERO;
            BigDecimal allocRatio = totalCost.compareTo(BigDecimal.ZERO) > 0
                    ? componentCost.divide(totalCost, 10, RoundingMode.HALF_UP)
                    : BigDecimal.ONE.divide(BigDecimal.valueOf(comboItems.size()), 10, RoundingMode.HALF_UP);

            // Dòng cuối nhận phần dư để tránh sai số làm tròn
            BigDecimal allocatedRevenue;
            if (i == comboItems.size() - 1) {
                BigDecimal alreadyAllocated = items.stream()
                        .filter(it -> comboId.equals(it.getComboSourceId()))
                        .map(it -> it.getUnitPrice().multiply(BigDecimal.valueOf(it.getQuantity())))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                allocatedRevenue = totalComboRevenue.subtract(alreadyAllocated)
                        .divide(BigDecimal.valueOf(requiredQty), 0, RoundingMode.HALF_UP);
            } else {
                allocatedRevenue = totalComboRevenue.multiply(allocRatio)
                        .divide(BigDecimal.valueOf(requiredQty), 0, RoundingMode.HALF_UP);
            }

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(component);
            item.setVariant(compVariant);
            item.setQuantity(requiredQty);
            item.setOriginalUnitPrice(compVariant.getSellPrice());
            item.setLineDiscountPercent(BigDecimal.ZERO);
            item.setUnitPrice(allocatedRevenue);   // giá phân bổ từ combo
            item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
                    ? fefoAvgCost : compVariant.getCostPrice());
            item.setComboSourceId(comboId);
            item.setComboUnitPrice(comboSellPrice); // snapshot giá combo
            items.add(item);
        }

        return totalComboRevenue;
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

    /** Sprint 2: lịch sử HĐ theo khách hàng */
    public Page<SalesInvoiceResponse> listInvoicesByCustomer(Long customerId, Pageable pageable) {
        return invoiceRepo.findByCustomerIdOrderByInvoiceDateDesc(customerId, pageable).map(DtoMapper::toResponse);
    }

    @Transactional
    public void deleteInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id));
        Set<Long> affectedProductIds = new java.util.HashSet<>();
        for (SalesInvoiceItem item : inv.getItems()) {
            Long variantId = item.getVariant() != null ? item.getVariant().getId() : null;
            if (item.getVariant() != null) {
                item.getVariant().setStockQty(item.getVariant().getStockQty() + item.getQuantity());
                variantRepo.save(item.getVariant());
            }
            batchService.restoreStockOnCancel(item.getProduct().getId(), variantId, item.getQuantity());
            affectedProductIds.add(item.getProduct().getId());
        }
        invoiceRepo.delete(inv);
        // Refresh virtual stock combo sau khi hoàn kho
        affectedProductIds.forEach(comboService::refreshCombosContaining);
    }
}


