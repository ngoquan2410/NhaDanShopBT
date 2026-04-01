package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.entity.Product.ProductType;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service quản lý Combo theo mô hình KiotViet:
 * Combo = Product(productType=COMBO) + ProductComboItem[]
 *
 * Tồn kho combo (Virtual Stock):
 *   stockQty = min(component.stockQty / component.qty) với mọi thành phần
 *
 * Khi bán combo: InvoiceService expand từng thành phần và trừ kho từng SP.
 * Giá vốn combo  = Σ (component.costPrice × component.qty)
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProductComboService {

    private final ProductRepository productRepo;
    private final ProductComboRepository comboItemRepo;
    private final CategoryRepository categoryRepo;
    private final ProductService productService;

    // ── Queries ──────────────────────────────────────────────────────────────

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
        // Tạo Product với type=COMBO
        Product combo = new Product();
        combo.setProductType(ProductType.COMBO);
        applyComboFields(combo, req);

        // Auto-generate code nếu trống
        if (combo.getCode() == null || combo.getCode().isBlank()) {
            combo.setCode(generateComboCode());
        }
        if (productRepo.existsByCode(combo.getCode())) {
            throw new IllegalArgumentException("Mã combo '" + combo.getCode() + "' đã tồn tại");
        }

        Product saved = productRepo.save(combo);
        saveComboItems(saved, req);

        // Cập nhật virtual stock
        updateVirtualStock(saved);
        return toResponse(productRepo.save(saved));
    }

    public ProductComboResponse update(Long id, ProductComboRequest req) {
        Product combo = findComboOrThrow(id);
        applyComboFields(combo, req);

        // Xóa items cũ, thêm lại
        comboItemRepo.deleteByComboProduct(combo);
        combo.getComboItems().clear();
        Product saved = productRepo.save(combo);
        saveComboItems(saved, req);

        updateVirtualStock(saved);
        return toResponse(productRepo.save(saved));
    }

    public void delete(Long id) {
        Product combo = findComboOrThrow(id);
        productRepo.delete(combo); // cascade xóa combo_items
    }

    public ProductComboResponse toggleActive(Long id) {
        Product combo = findComboOrThrow(id);
        combo.setActive(!combo.getActive());
        return toResponse(productRepo.save(combo));
    }

    // ── Virtual Stock ────────────────────────────────────────────────────────

    /**
     * Tính và cập nhật tồn kho ảo của combo.
     * stockQty = min(floor(component.stockQty / requiredQty)) với mọi thành phần.
     * Được gọi sau mỗi giao dịch ảnh hưởng đến thành phần.
     */
    public void updateVirtualStock(Product combo) {
        if (!combo.isCombo()) return;
        List<ProductComboItem> items = comboItemRepo.findByComboProduct(combo);
        if (items.isEmpty()) { combo.setStockQty(0); return; }

        int virtualStock = items.stream()
                .mapToInt(ci -> ci.getProduct().getStockQty() / ci.getQuantity())
                .min()
                .orElse(0);
        combo.setStockQty(virtualStock);

        // Cập nhật giá vốn combo = Σ costPrice × qty thành phần
        BigDecimal comboCost = items.stream()
                .map(ci -> ci.getProduct().getCostPrice()
                        .multiply(BigDecimal.valueOf(ci.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        combo.setCostPrice(comboCost);
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
        combo.setUnit(req.unit() != null ? req.unit() : "combo");
        combo.setSellPrice(req.sellPrice());
        combo.setCostPrice(BigDecimal.ZERO); // cập nhật sau khi có items
        if (req.active() != null) combo.setActive(req.active());
        combo.setImageUrl(req.imageUrl());

        // Category — lấy từ request hoặc dùng category đầu tiên của thành phần
        if (req.categoryId() != null) {
            combo.setCategory(categoryRepo.findById(req.categoryId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Category ID: " + req.categoryId())));
        } else if (combo.getCategory() == null) {
            // Fallback: lấy category đầu tiên
            combo.setCategory(categoryRepo.findAll().stream().findFirst()
                    .orElseThrow(() -> new IllegalStateException("Chưa có danh mục nào trong hệ thống")));
        }
    }

    private void saveComboItems(Product combo, ProductComboRequest req) {
        for (ProductComboRequest.ComboItemRequest ir : req.items()) {
            Product component = productRepo.findById(ir.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Sản phẩm ID: " + ir.productId() + " không tồn tại"));
            if (component.isCombo()) {
                throw new IllegalArgumentException(
                        "Không thể thêm combo '" + component.getName() + "' vào trong combo khác");
            }
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

        List<ProductComboResponse.ComboItemResponse> itemResponses = items.stream()
                .map(i -> {
                    BigDecimal unitPrice = i.getProduct().getSellPrice();
                    BigDecimal lineSell  = unitPrice.multiply(BigDecimal.valueOf(i.getQuantity()));
                    BigDecimal lineCost  = i.getProduct().getCostPrice()
                                           .multiply(BigDecimal.valueOf(i.getQuantity()));
                    return new ProductComboResponse.ComboItemResponse(
                            i.getId(),
                            i.getProduct().getId(),
                            i.getProduct().getCode(),
                            i.getProduct().getName(),
                            i.getProduct().getUnit(),
                            i.getQuantity(),
                            unitPrice,
                            lineSell,
                            lineCost
                    );
                })
                .collect(Collectors.toList());

        BigDecimal totalRetail = itemResponses.stream()
                .map(ProductComboResponse.ComboItemResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCost = itemResponses.stream()
                .map(ProductComboResponse.ComboItemResponse::lineCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ProductComboResponse(
                combo.getId(), combo.getCode(), combo.getName(),
                null, // description — Product entity chưa có field này
                combo.getSellPrice(), combo.getActive(), combo.getStockQty(),
                combo.getUnit(), combo.getImageUrl(),
                combo.getCategory() != null ? combo.getCategory().getId() : null,
                combo.getCategory() != null ? combo.getCategory().getName() : null,
                itemResponses, totalRetail, totalCost,
                combo.getCreatedAt(), combo.getUpdatedAt()
        );
    }
}
