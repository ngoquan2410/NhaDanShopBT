package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductComboRequest;
import com.example.nhadanshop.dto.ProductComboResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductCombo;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductComboService {

    private final ProductComboRepository comboRepo;
    private final ProductRepository productRepo;

    public List<ProductComboResponse> listActive() {
        return comboRepo.findByActiveOrderByNameAsc(true)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public List<ProductComboResponse> listAll() {
        return comboRepo.findAll().stream().map(this::toResponse).collect(Collectors.toList());
    }

    public ProductComboResponse getOne(Long id) {
        return toResponse(findOrThrow(id));
    }

    public ProductComboResponse create(ProductComboRequest req) {
        ProductCombo combo = new ProductCombo();
        applyRequest(combo, req);
        if (combo.getCode() == null || combo.getCode().isBlank()) {
            combo.setCode(generateCode());
        }
        return toResponse(comboRepo.save(combo));
    }

    public ProductComboResponse update(Long id, ProductComboRequest req) {
        ProductCombo combo = findOrThrow(id);
        applyRequest(combo, req);
        return toResponse(comboRepo.save(combo));
    }

    public void delete(Long id) {
        if (!comboRepo.existsById(id))
            throw new EntityNotFoundException("Không tìm thấy combo ID: " + id);
        comboRepo.deleteById(id);
    }

    public ProductComboResponse toggleActive(Long id) {
        ProductCombo combo = findOrThrow(id);
        combo.setActive(!combo.getActive());
        return toResponse(comboRepo.save(combo));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void applyRequest(ProductCombo combo, ProductComboRequest req) {
        if (req.code() != null && !req.code().isBlank()) combo.setCode(req.code().trim().toUpperCase());
        combo.setName(req.name());
        combo.setDescription(req.description());
        combo.setSellPrice(req.sellPrice());
        if (req.active() != null) combo.setActive(req.active());

        // Xóa items cũ, thêm lại
        combo.getItems().clear();
        for (ProductComboRequest.ComboItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));
            ProductComboItem item = new ProductComboItem();
            item.setCombo(combo);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            combo.getItems().add(item);
        }
    }

    private String generateCode() {
        String prefix = "COMBO";
        long count = comboRepo.count() + 1;
        String code = prefix + String.format("%03d", count);
        while (comboRepo.existsByCode(code)) code = prefix + String.format("%03d", ++count);
        return code;
    }

    private ProductCombo findOrThrow(Long id) {
        return comboRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy combo ID: " + id));
    }

    public ProductComboResponse toResponse(ProductCombo combo) {
        List<ProductComboResponse.ComboItemResponse> itemResponses = combo.getItems().stream()
                .map(i -> {
                    BigDecimal unitPrice = i.getProduct().getSellPrice();
                    BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(i.getQuantity()));
                    return new ProductComboResponse.ComboItemResponse(
                            i.getId(),
                            i.getProduct().getId(),
                            i.getProduct().getCode(),
                            i.getProduct().getName(),
                            i.getProduct().getUnit(),
                            i.getQuantity(),
                            unitPrice,
                            lineTotal
                    );
                })
                .collect(Collectors.toList());

        BigDecimal total = itemResponses.stream()
                .map(ProductComboResponse.ComboItemResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ProductComboResponse(
                combo.getId(), combo.getCode(), combo.getName(), combo.getDescription(),
                combo.getSellPrice(), combo.getActive(), itemResponses,
                total, combo.getCreatedAt(), combo.getUpdatedAt()
        );
    }
}
