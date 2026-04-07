package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.entity.Product.ProductType;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Combo = Product(productType=COMBO) + ProductComboItem[]
 * Tồn kho combo (Virtual): min(component.defaultVariant.stockQty / component.qty)
 * Giá vốn combo: Σ (component.defaultVariant.costPrice × qty)
 * Giá bán combo: từ default variant của combo
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProductComboService {

    private final ProductRepository productRepo;
    private final ProductComboRepository comboItemRepo;
    private final CategoryRepository categoryRepo;
    private final ProductVariantRepository variantRepo;

    public List<ProductComboResponse> listActive() {
        return productRepo.findByProductTypeAndActiveTrue(ProductType.COMBO)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public List<ProductComboResponse> listAll() {
        return productRepo.findByProductTypeOrderByNameAsc(ProductType.COMBO)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public ProductComboResponse getOne(Long id) {
        return toResponse(findComboOrThrow(id));
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    public ProductComboResponse create(ProductComboRequest req) {
        Product combo = new Product();
        combo.setProductType(ProductType.COMBO);
        applyComboFields(combo, req);
        if (combo.getCode() == null || combo.getCode().isBlank())
            combo.setCode(generateComboCode());
        if (productRepo.existsByCode(combo.getCode()))
            throw new IllegalArgumentException("Mã combo '" + combo.getCode() + "' đã tồn tại");

        Product saved = productRepo.save(combo);
        saveComboItems(saved, req);

        // Tạo default variant cho combo (mang giá bán + virtual stock)
        createOrUpdateComboVariant(saved, req.sellPrice());
        return toResponse(productRepo.save(saved));
    }

    public ProductComboResponse update(Long id, ProductComboRequest req) {
        Product combo = findComboOrThrow(id);
        applyComboFields(combo, req);
        comboItemRepo.deleteByComboProduct(combo);
        combo.getComboItems().clear();
        Product saved = productRepo.save(combo);
        saveComboItems(saved, req);
        createOrUpdateComboVariant(saved, req.sellPrice());
        return toResponse(productRepo.save(saved));
    }

    public void delete(Long id) {
        productRepo.delete(findComboOrThrow(id));
    }

    public ProductComboResponse toggleActive(Long id) {
        Product combo = findComboOrThrow(id);
        combo.setActive(!combo.getActive());
        // Đồng bộ active sang variant
        variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(combo.getId())
                .forEach(v -> { v.setActive(combo.getActive()); variantRepo.save(v); });
        return toResponse(productRepo.save(combo));
    }

    // ── Virtual Stock & Combo Variant ─────────────────────────────────────────

    /**
     * Tính virtual stock và cost, cập nhật vào default variant của combo.
     * stockQty = min(floor(component.defaultVariant.stockQty / requiredQty))
     * costPrice = Σ (component.defaultVariant.costPrice × qty)
     */
    public void updateVirtualStock(Product combo) {
        if (!combo.isCombo()) return;
        List<ProductComboItem> items = comboItemRepo.findByComboProduct(combo);
        if (items.isEmpty()) { syncComboVariant(combo, 0, BigDecimal.ZERO); return; }

        int virtualStock = items.stream()
                .mapToInt(ci -> {
                    ProductVariant cv = ci.getProduct().getDefaultVariant();
                    int stock = cv != null ? cv.getStockQty() : 0;
                    return stock / ci.getQuantity();
                })
                .min().orElse(0);

        BigDecimal comboCost = items.stream()
                .map(ci -> {
                    ProductVariant cv = ci.getProduct().getDefaultVariant();
                    BigDecimal cost = cv != null ? cv.getCostPrice() : BigDecimal.ZERO;
                    return cost.multiply(BigDecimal.valueOf(ci.getQuantity()));
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        syncComboVariant(combo, virtualStock, comboCost);
    }

    /** Cập nhật tất cả combo chứa SP đã thay đổi tồn kho */
    public void refreshCombosContaining(Long productId) {
        comboItemRepo.findByProductId(productId).forEach(ci -> {
            Product combo = ci.getComboProduct();
            updateVirtualStock(combo);
            productRepo.save(combo);
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void applyComboFields(Product combo, ProductComboRequest req) {
        if (req.code() != null && !req.code().isBlank())
            combo.setCode(req.code().trim().toUpperCase());
        combo.setName(req.name());
        combo.setDescription(req.description());
        combo.setActive(req.active() != null ? req.active() : (combo.getActive() != null ? combo.getActive() : true));
        combo.setImageUrl(req.imageUrl());
        combo.setUpdatedAt(LocalDateTime.now());
        if (combo.getCreatedAt() == null) combo.setCreatedAt(LocalDateTime.now());

        if (req.categoryId() != null) {
            combo.setCategory(categoryRepo.findById(req.categoryId())
                    .orElseThrow(() -> new EntityNotFoundException("Category ID: " + req.categoryId())));
        } else if (combo.getCategory() == null) {
            combo.setCategory(categoryRepo.findAll().stream().findFirst()
                    .orElseThrow(() -> new IllegalStateException("Chưa có danh mục nào trong hệ thống")));
        }
    }

    private void createOrUpdateComboVariant(Product combo, BigDecimal sellPrice) {
        var existing = variantRepo.findByProductIdAndIsDefaultTrue(combo.getId());
        ProductVariant v = existing.orElseGet(ProductVariant::new);
        v.setProduct(combo);
        v.setVariantCode(combo.getCode());
        v.setVariantName(combo.getName());
        v.setSellUnit("combo");
        v.setSellPrice(sellPrice != null ? sellPrice : BigDecimal.ZERO);
        v.setCostPrice(BigDecimal.ZERO); // sẽ cập nhật lại bởi updateVirtualStock
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setIsDefault(true);
        v.setActive(combo.getActive());
        v.setImageUrl(combo.getImageUrl());
        if (v.getCreatedAt() == null) v.setCreatedAt(LocalDateTime.now());
        v.setUpdatedAt(LocalDateTime.now());
        variantRepo.save(v);
        // Cập nhật stock thực tế
        updateVirtualStock(combo);
    }

    private void syncComboVariant(Product combo, int virtualStock, BigDecimal comboCost) {
        variantRepo.findByProductIdAndIsDefaultTrue(combo.getId()).ifPresent(v -> {
            v.setStockQty(virtualStock);
            v.setCostPrice(comboCost);
            v.setUpdatedAt(LocalDateTime.now());
            variantRepo.save(v);
        });
    }

    private void saveComboItems(Product combo, ProductComboRequest req) {
        for (ProductComboRequest.ComboItemRequest ir : req.items()) {
            Product component = productRepo.findById(ir.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Sản phẩm ID: " + ir.productId()));
            if (component.isCombo())
                throw new IllegalArgumentException("Không thể thêm combo '" + component.getName() + "' vào combo khác");
            ProductComboItem item = new ProductComboItem();
            item.setComboProduct(combo);
            item.setProduct(component);
            item.setQuantity(ir.quantity());
            comboItemRepo.save(item);
            combo.getComboItems().add(item);
        }
    }

    private String generateComboCode() {
        long count = productRepo.findByProductTypeOrderByNameAsc(ProductType.COMBO).size() + 1;
        String code = "COMBO" + String.format("%03d", count);
        while (productRepo.existsByCode(code)) code = "COMBO" + String.format("%03d", ++count);
        return code;
    }

    private Product findComboOrThrow(Long id) {
        Product p = productRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy combo ID: " + id));
        if (!p.isCombo()) throw new IllegalArgumentException("Sản phẩm ID " + id + " không phải combo");
        return p;
    }

    public ProductComboResponse toResponse(Product combo) {
        List<ProductComboItem> items = comboItemRepo.findByComboProduct(combo);
        ProductVariant comboVariant = combo.getDefaultVariant();

        List<ProductComboResponse.ComboItemResponse> itemResponses = items.stream()
                .map(i -> {
                    ProductVariant cv = i.getProduct().getDefaultVariant();
                    BigDecimal unitPrice = cv != null ? cv.getSellPrice() : BigDecimal.ZERO;
                    BigDecimal unitCost  = cv != null ? cv.getCostPrice() : BigDecimal.ZERO;
                    String sellUnit      = cv != null ? cv.getSellUnit() : "cai";
                    return new ProductComboResponse.ComboItemResponse(
                            i.getId(),
                            i.getProduct().getId(),
                            i.getProduct().getCode(),
                            i.getProduct().getName(),
                            sellUnit,
                            i.getQuantity(),
                            unitPrice,
                            unitPrice.multiply(BigDecimal.valueOf(i.getQuantity())),
                            unitCost.multiply(BigDecimal.valueOf(i.getQuantity()))
                    );
                })
                .collect(Collectors.toList());

        BigDecimal totalRetail = itemResponses.stream()
                .map(ProductComboResponse.ComboItemResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCost = itemResponses.stream()
                .map(ProductComboResponse.ComboItemResponse::lineCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int stockQty   = comboVariant != null ? comboVariant.getStockQty() : 0;
        BigDecimal sell = comboVariant != null ? comboVariant.getSellPrice() : BigDecimal.ZERO;

        return new ProductComboResponse(
                combo.getId(), combo.getCode(), combo.getName(),
                combo.getDescription(),
                sell, combo.getActive(), stockQty,
                combo.getImageUrl(),
                combo.getCategory() != null ? combo.getCategory().getId() : null,
                combo.getCategory() != null ? combo.getCategory().getName() : null,
                itemResponses, totalRetail, totalCost,
                combo.getCreatedAt(), combo.getUpdatedAt()
        );
    }
}
