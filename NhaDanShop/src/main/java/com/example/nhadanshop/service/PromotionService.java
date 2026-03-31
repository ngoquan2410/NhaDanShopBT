package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PromotionRequest;
import com.example.nhadanshop.dto.PromotionResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class PromotionService {

    private final PromotionRepository promotionRepo;
    private final CategoryRepository categoryRepo;
    private final ProductRepository productRepo;

    // ─────────────────── CRUD ────────────────────────────────────────────────

    public PromotionResponse create(PromotionRequest req) {
        Promotion p = new Promotion();
        applyRequest(p, req);
        return toResponse(promotionRepo.save(p));
    }

    public PromotionResponse update(Long id, PromotionRequest req) {
        Promotion p = promotionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id));
        applyRequest(p, req);
        return toResponse(promotionRepo.save(p));
    }

    public PromotionResponse getOne(Long id) {
        return toResponse(promotionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id)));
    }

    public Page<PromotionResponse> list(Pageable pageable) {
        return promotionRepo.findAllByOrderByStartDateDesc(pageable).map(this::toResponse);
    }

    public List<PromotionResponse> listActive() {
        return promotionRepo.findCurrentlyActive(LocalDateTime.now())
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public void delete(Long id) {
        if (!promotionRepo.existsById(id))
            throw new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id);
        promotionRepo.deleteById(id);
    }

    /** Bật / tắt trạng thái active */
    public PromotionResponse toggleActive(Long id) {
        Promotion p = promotionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id));
        p.setActive(!p.getActive());
        return toResponse(promotionRepo.save(p));
    }

    // ─────────────────── Helpers ─────────────────────────────────────────────

    private void applyRequest(Promotion p, PromotionRequest req) {
        p.setName(req.name());
        p.setDescription(req.description());
        p.setType(req.type());
        p.setDiscountValue(req.discountValue() != null ? req.discountValue() : java.math.BigDecimal.ZERO);
        p.setMinOrderValue(req.minOrderValue() != null ? req.minOrderValue() : java.math.BigDecimal.ZERO);
        p.setMaxDiscount(req.maxDiscount());
        p.setStartDate(req.startDate());
        p.setEndDate(req.endDate());
        p.setAppliesTo(req.appliesTo() != null ? req.appliesTo() : "ALL");
        if (req.active() != null) p.setActive(req.active());

        // Danh mục áp dụng
        Set<Category> categories = new HashSet<>();
        if (req.categoryIds() != null && !req.categoryIds().isEmpty()) {
            categories.addAll(categoryRepo.findAllById(req.categoryIds()));
        }
        p.setCategories(categories);

        // Sản phẩm áp dụng
        Set<Product> products = new HashSet<>();
        if (req.productIds() != null && !req.productIds().isEmpty()) {
            products.addAll(productRepo.findAllById(req.productIds()));
        }
        p.setProducts(products);
    }

    private PromotionResponse toResponse(Promotion p) {
        List<Long> catIds = p.getCategories().stream().map(c -> c.getId()).collect(Collectors.toList());
        List<String> catNames = p.getCategories().stream().map(c -> c.getName()).collect(Collectors.toList());
        List<Long> prodIds = p.getProducts().stream().map(pr -> pr.getId()).collect(Collectors.toList());
        List<String> prodNames = p.getProducts().stream().map(pr -> pr.getName()).collect(Collectors.toList());

        return new PromotionResponse(
                p.getId(), p.getName(), p.getDescription(), p.getType(),
                p.getDiscountValue(), p.getMinOrderValue(), p.getMaxDiscount(),
                p.getStartDate(), p.getEndDate(), p.getActive(), p.isCurrentlyActive(),
                p.getAppliesTo(),
                catIds, catNames, prodIds, prodNames,
                p.getCreatedAt(), p.getUpdatedAt()
        );
    }
}
