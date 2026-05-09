package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.production.ProductionRecipeDtos;
import com.example.nhadanshop.dto.production.ProductionRecipeDtos.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProductionRecipeService {

    private final ProductionRecipeRepository recipeRepo;
    private final ProductionRecipeComponentRepository componentRepo;
    private final ProductVariantRepository variantRepo;
    private final ProductRepository productRepo;
    private final ProductBatchRepository batchRepository;
    private final Clock businessClock;
    private static final Set<String> RECIPE_SORT_WHITELIST = Set.of(
            "id", "recipeCode", "name", "outputQty", "outputMustBeSellable", "archived", "updatedAt");

    @Transactional(readOnly = true)
    public Page<ProductionRecipeResponse> list(
            Boolean archivedFilter,
            Boolean activeFilter,
            Boolean includeArchived,
            Long outputVariantId,
            String query,
            Pageable pageable) {
        Pageable safePageable = sanitizePageable(pageable);
        String q = StringUtils.hasText(query) ? query.trim() : null;
        String bucket;
        if (Boolean.TRUE.equals(archivedFilter)) {
            bucket = "ARC";
        } else if (Boolean.FALSE.equals(activeFilter)) {
            bucket = "INACTIVE";
        } else if (Boolean.TRUE.equals(activeFilter)) {
            bucket = "ACTIVE_ONLY";
        } else if (Boolean.TRUE.equals(includeArchived)) {
            bucket = "ALL";
        } else {
            bucket = "NON_ARCHIVED";
        }
        if (q == null) {
            return recipeRepo.searchByBucketWithoutText(bucket, outputVariantId, safePageable).map(this::map);
        }
        return recipeRepo.searchByBucketWithText(bucket, outputVariantId, q, safePageable).map(this::map);
    }

    private Pageable sanitizePageable(Pageable pageable) {
        int page = Math.max(0, pageable.getPageNumber());
        int size = Math.min(Math.max(1, pageable.getPageSize()), 100);
        Sort sort = Sort.unsorted();
        for (Sort.Order order : pageable.getSort()) {
            if (RECIPE_SORT_WHITELIST.contains(order.getProperty())) {
                sort = sort.and(Sort.by(order));
            }
        }
        if (sort.isUnsorted()) {
            sort = Sort.by(Sort.Order.desc("id"));
        }
        return PageRequest.of(page, size, sort);
    }

    @Transactional(readOnly = true)
    public ProductionRecipeResponse get(Long id) {
        return recipeRepo.findById(id).map(this::map).orElseThrow(() -> new EntityNotFoundException("recipe " + id));
    }

    @Transactional
    public ProductionRecipeResponse create(CreateProductionRecipeRequest req) {
        String code = normalizeCode(req.recipeCode());
        if (recipeRepo.existsByRecipeCodeIgnoreCase(code)) {
            throw new IllegalArgumentException("Mã quy trình \"" + code + "\" đã tồn tại");
        }
        ProductVariant ov = variantRepo.findById(req.outputVariantId())
                .orElseThrow(() -> new EntityNotFoundException("output variant " + req.outputVariantId()));
        if (!ov.getProduct().getId().equals(req.outputProductId())) {
            throw new IllegalArgumentException("outputVariant không thuộc outputProduct đã chỉ định");
        }
        boolean mustSell = req.outputMustBeSellable() == null || Boolean.TRUE.equals(req.outputMustBeSellable());
        validateOutputVariantEligibility(ov, mustSell);
        ProductionRecipe recipe = new ProductionRecipe();
        recipe.setRecipeCode(code);
        recipe.setName(req.name().trim());
        recipe.setOutputProduct(ov.getProduct());
        recipe.setOutputVariant(ov);
        recipe.setOutputQty(req.outputQty());
        recipe.setOutputMustBeSellable(mustSell);
        recipe.setOverheadCost(zeroIfNull(req.overheadCost()));
        recipe.setActive(true);
        recipe.setArchived(false);
        recipeRepo.save(recipe);
        persistComponents(recipe, req.components());
        return map(recipeRepo.findById(recipe.getId()).orElse(recipe));
    }

    @Transactional
    public ProductionRecipeResponse patch(Long id, PatchProductionRecipeRequest req) {
        ProductionRecipe recipe = recipeRepo.findById(id).orElseThrow(() -> new EntityNotFoundException("recipe " + id));
        if (Boolean.TRUE.equals(recipe.getArchived())) {
            throw new IllegalStateException("Đã archive — không chỉnh sửa được");
        }
        if (StringUtils.hasText(req.name())) {
            recipe.setName(req.name().trim());
        }
        if (req.outputMustBeSellable() != null) {
            recipe.setOutputMustBeSellable(req.outputMustBeSellable());
        }
        if (req.overheadCost() != null) {
            recipe.setOverheadCost(req.overheadCost());
        }
        if (req.active() != null) {
            recipe.setActive(req.active());
        }
        validateOutputVariantEligibility(recipe.getOutputVariant(), recipe.getOutputMustBeSellable());

        if (req.components() != null) {
            if (req.components().isEmpty()) {
                throw new IllegalArgumentException("Cần ít nhất 1 thành phần");
            }
            componentRepo.deleteByRecipeId(recipe.getId());
            persistComponents(recipe, req.components());
        }
        return map(recipe);
    }

    @Transactional
    public ProductionRecipeResponse archive(Long id) {
        ProductionRecipe recipe = recipeRepo.findById(id).orElseThrow(() -> new EntityNotFoundException("recipe " + id));
        recipe.setArchived(true);
        recipe.setActive(false);
        return map(recipe);
    }

    private void persistComponents(ProductionRecipe recipe, java.util.List<ComponentLine> lines) {
        int idx = 0;
        for (ComponentLine line : lines) {
            ProductVariant vv = variantRepo.findById(line.variantId())
                    .orElseThrow(() -> new EntityNotFoundException("variant " + line.variantId()));
            if (!vv.getProduct().getId().equals(line.productId())) {
                throw new IllegalArgumentException("variant " + line.variantId() + " không thuộc product " + line.productId());
            }
            validateComponentBasics(vv);
            ProductionRecipeComponent c = new ProductionRecipeComponent();
            c.setRecipe(recipe);
            c.setProduct(vv.getProduct());
            c.setVariant(vv);
            c.setQtyPerOutput(line.qtyPerOutput());
            c.setUnit(line.unit());
            c.setSortOrder(line.sortOrder() != null ? line.sortOrder() : idx);
            componentRepo.save(c);
            idx++;
        }
    }

    private void validateComponentBasics(ProductVariant v) {
        if (!Boolean.TRUE.equals(v.getProduct().getActive())) {
            throw new IllegalArgumentException("Sản phẩm của nguyên liệu phải active");
        }
        if (!Boolean.TRUE.equals(v.getActive())) {
            throw new IllegalArgumentException("Nguyên liệu (variant) phải active");
        }
    }

    private void validateOutputVariantEligibility(ProductVariant ov, boolean outputMustBeSellable) {
        if (!Boolean.TRUE.equals(ov.getProduct().getActive())) {
            throw new IllegalArgumentException("SP output phải active");
        }
        if (!Boolean.TRUE.equals(ov.getActive())) {
            throw new IllegalArgumentException("Biến thể output phải active");
        }
        if (outputMustBeSellable) {
            if (!Boolean.TRUE.equals(ov.getIsSellable())) {
                throw new IllegalArgumentException("recipe outputMustBeSellable=true nhưng biến thể output có isSellable=false");
            }
        }
    }

    private String normalizeCode(String code) {
        if (code == null) throw new IllegalArgumentException("recipeCode không được để trống");
        return code.trim().toUpperCase();
    }

    private BigDecimal zeroIfNull(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private ProductionRecipeResponse map(ProductionRecipe r) {
        List<ProductionRecipeComponent> compRows = componentRepo.findByRecipeIdOrderBySortOrderAscIdAsc(r.getId());
        List<Long> vids = compRows.stream().map(c -> c.getVariant().getId()).distinct().toList();
        LocalDate today = LocalDate.now(businessClock);
        Map<Long, Integer> avail = new HashMap<>();
        Map<Long, LocalDate> nearestExp = new HashMap<>();
        if (!vids.isEmpty()) {
            for (Object[] row : batchRepository.sumProductionInputRemainingGrouped(vids, today)) {
                if (row[0] != null) {
                    avail.put(((Number) row[0]).longValue(), row[1] == null ? 0 : ((Number) row[1]).intValue());
                }
            }
            for (Object[] row : batchRepository.minProductionInputExpiryGrouped(vids, today)) {
                if (row[0] != null && row[1] != null) {
                    Object exp = row[1];
                    LocalDate ld = exp instanceof LocalDate loc ? loc : LocalDate.parse(exp.toString());
                    nearestExp.put(((Number) row[0]).longValue(), ld);
                }
            }
        }
        var comps = compRows.stream()
                .map(c -> {
                    ProductVariant vv = c.getVariant();
                    long vid = vv.getId();
                    LocalDate nx = nearestExp.get(vid);
                    return new ProductionRecipeComponentResponse(
                            c.getId(),
                            c.getProduct().getId(),
                            vid,
                            c.getQtyPerOutput(),
                            c.getUnit(),
                            c.getSortOrder(),
                            vv.getSellUnit(),
                            vv.getImportUnit(),
                            vv.getPiecesPerUnit(),
                            avail.getOrDefault(vid, 0),
                            nx != null ? nx + "T00:00:00" : null
                    );
                })
                .toList();
        return new ProductionRecipeResponse(
                r.getId(),
                r.getRecipeCode(),
                r.getName(),
                r.getOutputProduct().getId(),
                r.getOutputVariant().getId(),
                r.getOutputQty(),
                r.getOutputMustBeSellable(),
                r.getOverheadCost(),
                r.getActive(),
                r.getArchived(),
                comps,
                r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null
        );
    }
}
