package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PromotionBuyItemRequest;
import com.example.nhadanshop.dto.PromotionBuyItemResponse;
import com.example.nhadanshop.dto.PromotionRequest;
import com.example.nhadanshop.dto.PromotionResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.PromotionBuyItem;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import jakarta.persistence.criteria.Predicate;
import java.time.LocalDateTime;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional
public class PromotionService {
    private static final Set<String> PROMOTION_SORT_WHITELIST = Set.of(
            "createdAt", "updatedAt", "name", "startDate", "endDate", "active");


    private final PromotionRepository promotionRepo;
    private final CategoryRepository categoryRepo;
    private final ProductRepository productRepo;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final PendingOrderRepository pendingOrderRepository;
    private final Clock businessClock;

    // ─────────────────── CRUD ────────────────────────────────────────────────

    public PromotionResponse create(PromotionRequest req) {
        Promotion p = new Promotion();
        applyRequest(p, req);
        Promotion saved = promotionRepo.save(p);
        return toResponse(promotionRepo.findByIdWithDetails(saved.getId()).orElse(saved));
    }

    public PromotionResponse update(Long id, PromotionRequest req) {
        Promotion p = promotionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id));
        applyRequest(p, req);
        Promotion saved = promotionRepo.save(p);
        return toResponse(promotionRepo.findByIdWithDetails(saved.getId()).orElse(saved));
    }

    public PromotionResponse getOne(Long id) {
        return toResponse(promotionRepo.findByIdWithDetails(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id)));
    }

    public Page<PromotionResponse> list(
            Integer page,
            Integer size,
            String search,
            String status,
            String type,
            Boolean includeArchived,
            Pageable pageable) {
        Pageable safePageable = sanitizePageable(page, size, pageable);
        String normalizedSearch = normalizeBlank(search);
        String normalizedStatus = normalizeStatus(status);
        String normalizedType = normalizeBlank(type);
        boolean safeIncludeArchived = Boolean.TRUE.equals(includeArchived);
        Specification<Promotion> spec = buildAdminListSpec(
                normalizedSearch, normalizedStatus, normalizedType, safeIncludeArchived);
        Page<Promotion> promotionPage = promotionRepo.findAll(spec, safePageable);
        List<Long> ids = promotionPage.getContent().stream().map(Promotion::getId).toList();
        if (ids.isEmpty()) {
            return new PageImpl<>(List.of(), safePageable, promotionPage.getTotalElements());
        }
        List<Promotion> hydrated = promotionRepo.findAllByIdInWithDetails(ids);
        Map<Long, Promotion> byId = hydrated.stream().collect(Collectors.toMap(Promotion::getId, p -> p));
        Map<Long, String> giftNames = loadGiftProductNames(hydrated);
        List<PromotionResponse> ordered = ids.stream()
                .map(id -> toResponse(byId.get(id), giftNames))
                .toList();
        return new PageImpl<>(ordered, safePageable, promotionPage.getTotalElements());
    }

    public List<PromotionResponse> listActive() {
        List<Promotion> lightweight = promotionRepo.findCurrentlyActive(LocalDateTime.now(businessClock));
        if (lightweight.isEmpty()) {
            return List.of();
        }
        List<Long> ids = lightweight.stream().map(Promotion::getId).toList();
        List<Promotion> hydrated = promotionRepo.findAllByIdInWithDetails(ids);
        Map<Long, Promotion> byId = hydrated.stream().collect(Collectors.toMap(Promotion::getId, p -> p));
        Map<Long, String> giftNames = loadGiftProductNames(hydrated);
        return ids.stream()
                .map(id -> toResponse(byId.get(id), giftNames))
                .collect(Collectors.toList());
    }

    private Map<Long, String> loadGiftProductNames(List<Promotion> promotions) {
        Set<Long> giftIds = promotions.stream()
                .map(Promotion::getGetProductId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (giftIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> out = new HashMap<>();
        for (Product pr : productRepo.findAllById(giftIds)) {
            out.put(pr.getId(), pr.getName());
        }
        return out;
    }

    public void delete(Long id) {
        if (!promotionRepo.existsById(id)) {
            throw new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id);
        }
        if (isPromotionInUse(id)) {
            Promotion p = promotionRepo.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id));
            p.setActive(false);
            promotionRepo.save(p);
            return;
        }
        promotionRepo.deleteById(id);
    }

    /**
     * Conservative: any FK, pending snapshot, or JSON snapshot (promotion or gift line) → treated as in use.
     */
    private boolean isPromotionInUse(long id) {
        return salesInvoiceRepository.countByPromotionId(id) > 0
                || salesInvoiceRepository.existsReferenceToPromotionInInvoiceJsonSnapshots(id)
                || pendingOrderRepository.existsReferenceToPromotionInPendingSnapshots(id);
    }

    /** Bật / tắt trạng thái active */
    public PromotionResponse toggleActive(Long id) {
        Promotion p = promotionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + id));
        p.setActive(!p.getActive());
        Promotion saved = promotionRepo.save(p);
        return toResponse(promotionRepo.findByIdWithDetails(saved.getId()).orElse(saved));
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
        p.setMinOrderScope(req.minOrderScope() != null ? req.minOrderScope() : "ELIGIBLE_ITEMS");
        if (req.active() != null) p.setActive(req.active());

        boolean giftPromotionType = "BUY_X_GET_Y".equals(req.type()) || "QUANTITY_GIFT".equals(req.type());
        if (req.repeatable() != null) {
            p.setRepeatable(req.repeatable());
        } else if (p.getRepeatable() == null) {
            p.setRepeatable(!giftPromotionType);
        }

        // BUY_X_GET_Y + QUANTITY_GIFT fields
        p.setBuyQty(req.buyQty());
        p.setGetProductId(req.getProductId());
        p.setGetQty(req.getQty());
        p.setMinBuyQty(req.minBuyQty());
        if ("QUANTITY_GIFT".equals(req.type())) {
            if (req.maxGiftApplications() != null) {
                p.setMaxBuyQty(req.maxGiftApplications());
            } else {
                p.setMaxBuyQty(req.maxBuyQty());
            }
        } else {
            p.setMaxBuyQty(req.maxBuyQty());
        }

        p.getBuyItems().clear();
        if ("BUY_X_GET_Y".equals(req.type())) {
            if (req.buyItems() != null && !req.buyItems().isEmpty()) {
                int order = 0;
                for (PromotionBuyItemRequest bi : req.buyItems()) {
                    if (bi.productId() == null || bi.buyQty() == null || bi.buyQty() <= 0) {
                        continue;
                    }
                    PromotionBuyItem row = new PromotionBuyItem();
                    row.setPromotion(p);
                    row.setProduct(productRepo.getReferenceById(bi.productId()));
                    row.setBuyQty(bi.buyQty());
                    row.setSortOrder(bi.sortOrder() != null ? bi.sortOrder() : order++);
                    p.getBuyItems().add(row);
                }
            } else if (req.productIds() != null && !req.productIds().isEmpty()) {
                int x = req.buyQty() != null && req.buyQty() > 0 ? req.buyQty() : 1;
                int order = 0;
                for (Long pid : req.productIds()) {
                    PromotionBuyItem row = new PromotionBuyItem();
                    row.setPromotion(p);
                    row.setProduct(productRepo.getReferenceById(pid));
                    row.setBuyQty(x);
                    row.setSortOrder(order++);
                    p.getBuyItems().add(row);
                }
            }
        }
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
        return toResponse(p, null);
    }

    private PromotionResponse toResponse(Promotion p, Map<Long, String> giftProductNames) {
        List<Long> catIds = p.getCategories().stream().map(c -> c.getId()).collect(Collectors.toList());
        List<String> catNames = p.getCategories().stream().map(c -> c.getName()).collect(Collectors.toList());
        List<Long> prodIds = p.getProducts().stream().map(pr -> pr.getId()).collect(Collectors.toList());
        List<String> prodNames = p.getProducts().stream().map(pr -> pr.getName()).collect(Collectors.toList());

        // Tên sản phẩm tặng (BUY_X_GET_Y)
        String getProductName = null;
        if (p.getGetProductId() != null) {
            if (giftProductNames != null) {
                getProductName = giftProductNames.get(p.getGetProductId());
            } else {
                getProductName = productRepo.findById(p.getGetProductId())
                        .map(Product::getName).orElse(null);
            }
        }

        Integer maxGiftApplications = "QUANTITY_GIFT".equals(p.getType()) ? p.getMaxBuyQty() : null;

        List<PromotionBuyItemResponse> buyItemRows = p.getBuyItems().stream()
                .sorted(Comparator.comparing(PromotionBuyItem::getSortOrder)
                        .thenComparing(bi -> bi.getId() != null ? bi.getId() : 0L))
                .map(bi -> new PromotionBuyItemResponse(
                        bi.getProduct().getId(),
                        bi.getProduct().getName(),
                        bi.getProduct().getCode(),
                        bi.getBuyQty(),
                        bi.getSortOrder() != null ? bi.getSortOrder() : 0))
                .collect(Collectors.toList());

        return new PromotionResponse(
                p.getId(), p.getName(), p.getDescription(), p.getType(),
                p.getDiscountValue(), p.getMinOrderValue(), p.getMaxDiscount(),
                p.getStartDate(), p.getEndDate(), p.getActive(), isCurrentlyActive(p), effectiveStatus(p),
                p.getAppliesTo(), p.getMinOrderScope() != null ? p.getMinOrderScope() : "ELIGIBLE_ITEMS",
                catIds, catNames, prodIds, prodNames,
                p.getBuyQty(), p.getGetProductId(), getProductName, p.getGetQty(),
                p.getMinBuyQty(), p.getMaxBuyQty(),
                buyItemRows,
                p.getRepeatable(),
                maxGiftApplications,
                p.getCreatedAt(), p.getUpdatedAt()
        );
    }

    private Pageable sanitizePageable(Integer page, Integer size, Pageable pageable) {
        int safePage = page != null ? Math.max(0, page) : Math.max(0, pageable.getPageNumber());
        int requestedSize = size != null ? size : pageable.getPageSize();
        int safeSize = Math.min(Math.max(1, requestedSize), 100);
        Sort safeSort = Sort.unsorted();
        for (Sort.Order order : pageable.getSort()) {
            if (PROMOTION_SORT_WHITELIST.contains(order.getProperty())) {
                safeSort = safeSort.and(Sort.by(order));
            }
        }
        if (safeSort.isUnsorted()) {
            safeSort = Sort.by(Sort.Order.desc("createdAt"));
        }
        return PageRequest.of(safePage, safeSize, safeSort);
    }

    private String normalizeBlank(String input) {
        if (input == null || input.isBlank()) {
            return null;
        }
        return input.trim();
    }

    private String normalizeStatus(String input) {
        String normalized = normalizeBlank(input);
        if (normalized == null) {
            return null;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        return switch (lower) {
            // Backward compatibility: active/inactive keep the old admin enable-flag meaning.
            // New values below are effective statuses derived from active + start/end window.
            case "active", "inactive", "running", "scheduled", "expired", "archived" -> lower;
            default -> throw new IllegalArgumentException("status không hợp lệ: " + input);
        };
    }

    private Specification<Promotion> buildAdminListSpec(
            String search,
            String status,
            String type,
            boolean includeArchived) {
        LocalDateTime now = LocalDateTime.now(businessClock);
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (!includeArchived && status == null) {
                // NOTE: current schema has no archived flag; preserve legacy default list as admin-enabled only.
                predicates.add(cb.isTrue(root.get("active")));
            }
            if (type != null) {
                predicates.add(cb.equal(
                        cb.upper(cb.coalesce(root.get("type"), "")),
                        type.toUpperCase(Locale.ROOT)));
            }
            if (status != null) {
                switch (status) {
                    case "active" -> predicates.add(cb.isTrue(root.get("active")));
                    case "inactive" -> predicates.add(cb.isFalse(root.get("active")));
                    case "running" -> {
                        predicates.add(cb.isTrue(root.get("active")));
                        predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), now));
                        predicates.add(cb.greaterThanOrEqualTo(root.get("endDate"), now));
                    }
                    case "scheduled" -> {
                        predicates.add(cb.isTrue(root.get("active")));
                        predicates.add(cb.greaterThan(root.get("startDate"), now));
                    }
                    case "expired" -> {
                        predicates.add(cb.isTrue(root.get("active")));
                        predicates.add(cb.lessThan(root.get("endDate"), now));
                    }
                    case "archived" -> predicates.add(cb.disjunction());
                    default -> { }
                }
            }
            if (search != null) {
                String likePattern = "%" + search.toUpperCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.upper(cb.coalesce(root.get("name"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("description"), "")), likePattern)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private boolean isCurrentlyActive(Promotion p) {
        return "running".equals(effectiveStatus(p));
    }

    private String effectiveStatus(Promotion p) {
        LocalDateTime now = LocalDateTime.now(businessClock);
        if (!Boolean.TRUE.equals(p.getActive())) {
            return "inactive";
        }
        if (p.getStartDate() != null && now.isBefore(p.getStartDate())) {
            return "scheduled";
        }
        if (p.getEndDate() != null && now.isAfter(p.getEndDate())) {
            return "expired";
        }
        return "running";
    }
}
