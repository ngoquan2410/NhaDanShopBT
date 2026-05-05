package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductPatchRequest;
import com.example.nhadanshop.dto.ProductRequest;
import com.example.nhadanshop.dto.ProductResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductImportUnit;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductImportUnitRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final PromotionRepository promotionRepository;
    private final ProductImportUnitRepository importUnitRepository;
    private final ProductVariantRepository variantRepository;
    @org.springframework.context.annotation.Lazy
    private final ProductVariantService variantService;

    private final StockedCatalogGuardService stockedCatalogGuardService;

    public List<ProductResponse> findAll() {
        return toResponsesWithVariants(productRepository.findByActiveTrue());
    }

    public Page<ProductResponse> search(
            String search,
            Long categoryId,
            boolean includeInactive,
            String productTypeStr,
            Pageable pageable) {
        Product.ProductType pType = null;
        if (productTypeStr != null && !productTypeStr.isBlank()) {
            try {
                pType = Product.ProductType.valueOf(productTypeStr.trim().toUpperCase());
            } catch (IllegalArgumentException ignored) { /* all types */ }
        }
        Page<Product> page = productRepository.searchProducts(
                search != null && !search.isBlank() ? search.trim() : null,
                categoryId,
                includeInactive,
                pType,
                pageable);
        List<ProductResponse> content = toResponsesWithVariants(page.getContent());
        return new PageImpl<>(content, page.getPageable(), page.getTotalElements());
    }

    public Page<ProductResponse> findByCategory(Long categoryId, Pageable pageable) {
        Page<Product> page = productRepository.findByCategoryIdAndActiveTrue(categoryId, pageable);
        List<ProductResponse> content = toResponsesWithVariants(page.getContent());
        return new PageImpl<>(content, page.getPageable(), page.getTotalElements());
    }

    public ProductResponse findById(Long id) {
        Product p = findEntityById(id);
        if (p.getProductType() == Product.ProductType.SINGLE) {
            List<ProductVariant> vv = variantRepository.findByProductIdOrderByIsDefaultDescVariantCodeAsc(id);
            return DtoMapper.toResponse(p, vv);
        }
        return DtoMapper.toResponse(p);
    }

    @Transactional
    public ProductResponse create(ProductRequest req) {
        var category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + req.categoryId()));

        if (productRepository.existsByNameIgnoreCaseAndCategoryId(req.name().trim(), category.getId())) {
            throw new IllegalStateException(
                "Sản phẩm '" + req.name().trim() + "' đã tồn tại trong danh mục '" + category.getName() + "'");
        }

        String code = req.code().trim().toUpperCase();
        if (productRepository.existsByCode(code)) {
            throw new IllegalStateException("Mã sản phẩm '" + code + "' đã tồn tại");
        }

        // Resolve productType — default SINGLE
        Product.ProductType pType = Product.ProductType.SINGLE;
        if (req.productType() != null && !req.productType().isBlank()) {
            try { pType = Product.ProductType.valueOf(req.productType().toUpperCase()); }
            catch (IllegalArgumentException ignored) { /* giữ SINGLE */ }
        }

        Product p = new Product();
        p.setCode(code);
        p.setName(req.name());
        p.setCategory(category);
        p.setImageUrl(req.imageUrl());
        p.setActive(req.active() == null ? true : req.active());
        p.setProductType(pType);
        p.setCreatedAt(LocalDateTime.now());
        p.setUpdatedAt(LocalDateTime.now());

        Product saved = productRepository.saveAndFlush(p);

        if (pType == Product.ProductType.SINGLE) {
            // Chỉ SINGLE mới có variant — COMBO không có variant (tồn kho ảo từ thành phần)
            if (req.initialVariants() != null && !req.initialVariants().isEmpty()) {
                boolean hasDefault = req.initialVariants().stream()
                        .anyMatch(v -> Boolean.TRUE.equals(v.isDefault()));
                for (int i = 0; i < req.initialVariants().size(); i++) {
                    var vReq = req.initialVariants().get(i);
                    if (!hasDefault && i == 0) {
                        vReq = new com.example.nhadanshop.dto.ProductVariantRequest(
                            vReq.variantCode(), vReq.variantName(), vReq.sellUnit(),
                            vReq.importUnit(), vReq.piecesPerUnit(), vReq.sellPrice(),
                            vReq.costPrice(), vReq.stockQty(), vReq.minStockQty(),
                            vReq.expiryDays(), true, vReq.imageUrl(), vReq.conversionNote(), vReq.active(),
                            vReq.isSellable()
                        );
                    }
                    variantService.createVariant(saved.getId(), vReq);

                    // Task 2: tạo ProductImportUnit cho variant có importUnit
                    if (vReq.importUnit() != null && !vReq.importUnit().isBlank()) {
                        boolean isDefault = Boolean.TRUE.equals(vReq.isDefault()) || (!hasDefault && i == 0);
                        // Kiểm tra không tạo trùng (cùng product + importUnit)
                        boolean exists = importUnitRepository
                                .findByProductIdAndImportUnitIgnoreCase(saved.getId(), vReq.importUnit().trim())
                                .isPresent();
                        if (!exists) {
                            int pieces = vReq.piecesPerUnit() != null && vReq.piecesPerUnit() > 0
                                    ? vReq.piecesPerUnit() : 1;
                            String sellUnit = vReq.sellUnit() != null ? vReq.sellUnit() : "cai";
                            ProductImportUnit piu = new ProductImportUnit();
                            piu.setProduct(saved);
                            piu.setImportUnit(vReq.importUnit().trim());
                            piu.setSellUnit(sellUnit);
                            piu.setPiecesPerUnit(pieces);
                            piu.setIsDefault(isDefault);
                            piu.setNote(vReq.conversionNote());
                            importUnitRepository.save(piu);
                        }
                    }
                }
            } else {
                // Backward compat: tạo 1 default variant rỗng
                variantService.createDefaultVariantFromProduct(saved);
            }
        } else if (pType == Product.ProductType.COMBO) {
            // COMBO: KHÔNG tạo variant — nếu FE vô tình gửi initialVariants, bỏ qua hoàn toàn
            // Tồn kho combo là ảo: min(stock_thành_phần / qty_yêu_cầu)
            if (req.initialVariants() != null && !req.initialVariants().isEmpty()) {
                throw new IllegalArgumentException(
                    "Combo không thể có variant. Tồn kho combo được tính tự động từ thành phần.");
            }
        }

        Product base = productRepository.findById(saved.getId()).orElseThrow();
        if (pType == Product.ProductType.SINGLE) {
            List<ProductVariant> variantRows = variantRepository.findByProductIdOrderByIsDefaultDescVariantCodeAsc(base.getId());
            return DtoMapper.toResponse(base, variantRows);
        }
        return DtoMapper.toResponse(base);
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest req) {
        Product p = findEntityById(id);
        String newCode = (req.code() != null && !req.code().isBlank())
                ? req.code().trim().toUpperCase()
                : p.getCode();
        if (!newCode.equals(p.getCode()) && productRepository.existsByCodeAndIdNot(newCode, id)) {
            throw new IllegalStateException("Mã sản phẩm '" + newCode + "' đã được dùng bởi sản phẩm khác");
        }
        var category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + req.categoryId()));

        p.setCode(newCode);
        p.setName(req.name());
        p.setCategory(category);
        boolean newActive = req.active() == null ? p.getActive() : req.active();
        if (!newActive && Boolean.TRUE.equals(p.getActive())) {
            stockedCatalogGuardService.assertProductMayArchiveOrDeactivate(p);
        }
        p.setActive(newActive);
        p.setImageUrl(req.imageUrl());
        p.setUpdatedAt(LocalDateTime.now());

        return DtoMapper.toResponse(productRepository.save(p));
    }

    @Transactional
    public ProductResponse patch(Long id, ProductPatchRequest req) {
        Product p = findEntityById(id);
        if (req.code() != null && !req.code().isBlank()) {
            String newCode = req.code().trim().toUpperCase();
            if (!newCode.equals(p.getCode()) && productRepository.existsByCodeAndIdNot(newCode, id)) {
                throw new IllegalStateException("Mã sản phẩm '" + newCode + "' đã được dùng bởi sản phẩm khác");
            }
            p.setCode(newCode);
        }
        if (req.name() != null && !req.name().isBlank()) p.setName(req.name());
        if (req.categoryId() != null) {
            var category = categoryRepository.findById(req.categoryId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + req.categoryId()));
            p.setCategory(category);
        }
        if (req.active() != null) {
            boolean turningOff = Boolean.FALSE.equals(req.active()) && Boolean.TRUE.equals(p.getActive());
            if (turningOff) {
                stockedCatalogGuardService.assertProductMayArchiveOrDeactivate(p);
            }
            p.setActive(req.active());
        }
        if (req.imageUrl() != null) p.setImageUrl(req.imageUrl());
        if (req.productType() != null && !req.productType().isBlank()) {
            try {
                p.setProductType(Product.ProductType.valueOf(req.productType().trim().toUpperCase()));
            } catch (IllegalArgumentException ignored) { /* keep */ }
        }
        p.setUpdatedAt(LocalDateTime.now());
        return DtoMapper.toResponse(productRepository.save(p));
    }

    @Transactional
    public void deleteOrArchive(Long id) {
        Product p = findEntityById(id);
        if (isProductStructurallyUsed(id)) {
            stockedCatalogGuardService.assertProductMayArchiveOrDeactivate(p);
            p.setActive(false);
            p.setUpdatedAt(LocalDateTime.now());
            productRepository.save(p);
        } else {
            productRepository.delete(p);
        }
    }

    public boolean isProductStructurallyUsed(Long id) {
        return productRepository.isProductStructurallyUsedCore(id)
                || promotionRepository.existsByGiftTargetProductId(id)
                || promotionRepository.existsInLinkedProducts(id);
    }

    @Transactional
    public BatchCreateResult createBatch(List<ProductRequest> requests) {
        List<ProductResponse> created = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (ProductRequest req : requests) {
            try {
                var category = categoryRepository.findById(req.categoryId()).orElse(null);
                if (category == null) {
                    errors.add((req.code() != null ? req.code() : "?") + " (" + req.name() + ") - categoryId " + req.categoryId() + " không tồn tại");
                    continue;
                }
                String code = (req.code() != null && !req.code().isBlank())
                        ? req.code().trim().toUpperCase() : null;
                if (code == null || code.isBlank()) {
                    errors.add(req.name() + " - mã sản phẩm (code) không được để trống");
                    continue;
                }
                if (productRepository.existsByCode(code)) {
                    skipped.add(code + " (" + req.name() + ") - mã đã tồn tại");
                    continue;
                }
                Product p = new Product();
                p.setCode(code);
                p.setName(req.name());
                p.setCategory(category);
                p.setImageUrl(req.imageUrl());
                p.setActive(req.active() == null ? true : req.active());
                p.setCreatedAt(LocalDateTime.now());
                p.setUpdatedAt(LocalDateTime.now());
                created.add(DtoMapper.toResponse(productRepository.save(p)));
            } catch (Exception e) {
                errors.add((req.code() != null ? req.code() : "?") + " (" + req.name() + ") - lỗi: " + e.getMessage());
            }
        }
        return new BatchCreateResult(created.size(), skipped.size(), errors.size(), created, skipped, errors);
    }

    public record BatchCreateResult(
            int totalCreated, int totalSkipped, int totalErrors,
            List<ProductResponse> created, List<String> skipped, List<String> errors
    ) {}

    // ── Code Generation ───────────────────────────────────────────────────────

    public String generateProductCode(Category category) {
        String prefix = buildPrefix(category.getName());
        List<String> existingCodes = productRepository.findAllCodesByCategoryId(category.getId());
        int maxSeq = extractMaxSequence(existingCodes, prefix);
        int nextSeq = maxSeq + 1;
        String format = nextSeq > 999 ? "%s%04d" : "%s%03d";
        String candidate = String.format(format, prefix, nextSeq);
        int safety = 0;
        while (productRepository.existsByCode(candidate) && safety < 1000) {
            nextSeq++;
            candidate = String.format(nextSeq > 999 ? "%s%04d" : "%s%03d", prefix, nextSeq);
            safety++;
        }
        return candidate;
    }

    static String buildPrefix(String categoryName) {
        if (categoryName == null || categoryName.isBlank()) return "SP";
        String normalized = removeVietnameseDiacritics(categoryName.trim());
        String[] words = normalized.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty() && sb.length() < 4) sb.append(Character.toUpperCase(word.charAt(0)));
        }
        return sb.length() == 0 ? "SP" : sb.toString();
    }

    static int extractMaxSequence(List<String> codes, String prefix) {
        Pattern pattern = Pattern.compile("^" + Pattern.quote(prefix) + "(\\d+)$", Pattern.CASE_INSENSITIVE);
        int max = 0;
        for (String code : codes) {
            if (code == null) continue;
            Matcher m = pattern.matcher(code.trim());
            if (m.matches()) {
                try { int seq = Integer.parseInt(m.group(1)); if (seq > max) max = seq; }
                catch (NumberFormatException ignored) {}
            }
        }
        return max;
    }

    private static String removeVietnameseDiacritics(String s) {
        String[][] map = {
            {"à","á","â","ã","ä","å","ă","ắ","ặ","ẵ","ằ","ẳ","ấ","ầ","ẩ","ẫ","ậ"}, {"a"},
            {"è","é","ê","ë","ẹ","ẻ","ẽ","ế","ề","ệ","ể","ễ"}, {"e"},
            {"ì","í","î","ï","ị","ỉ","ĩ"}, {"i"},
            {"ò","ó","ô","õ","ö","ø","ọ","ỏ","ố","ồ","ổ","ỗ","ộ","ớ","ờ","ở","ỡ","ợ","ơ"}, {"o"},
            {"ù","ú","û","ü","ụ","ủ","ũ","ứ","ừ","ử","ữ","ự","ư"}, {"u"},
            {"ỳ","ý","ỵ","ỷ","ỹ"}, {"y"},
            {"đ"}, {"d"},
            {"À","Á","Â","Ã","Ä","Å","Ă","Ắ","Ặ","Ẵ","Ằ","Ẳ","Ấ","Ầ","Ẩ","Ẫ","Ậ"}, {"A"},
            {"È","É","Ê","Ë","Ẹ","Ẻ","Ẽ","Ế","Ề","Ệ","Ể","Ễ"}, {"E"},
            {"Ì","Í","Î","Ï","Ị","Ỉ","Ĩ"}, {"I"},
            {"Ò","Ó","Ô","Õ","Ö","Ø","Ọ","Ỏ","Ố","Ồ","Ổ","Ỗ","Ộ","Ớ","Ờ","Ở","Ỡ","Ợ","Ơ"}, {"O"},
            {"Ù","Ú","Û","Ü","Ụ","Ủ","Ũ","Ứ","Ừ","Ử","Ữ","Ự","Ư"}, {"U"},
            {"Ỳ","Ý","Ỵ","Ỷ","Ỹ"}, {"Y"},
            {"Đ"}, {"D"},
        };
        String result = s;
        for (int i = 0; i < map.length - 1; i += 2)
            for (String from : map[i]) result = result.replace(from, map[i + 1][0]);
        return result;
    }

    private Product findEntityById(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy sản phẩm ID: " + id));
    }

    /**
     * Public list/detail DTOs must include variant rows for SINGLE products (lazy bag is often empty on
     * detached/listed entities). COMBO responses stay without variants.
     */
    private List<ProductResponse> toResponsesWithVariants(List<Product> products) {
        if (products.isEmpty()) {
            return List.of();
        }
        List<Long> ids = products.stream().map(Product::getId).toList();
        List<ProductVariant> allVariants = variantRepository.findByProductIdIn(ids);
        Map<Long, List<ProductVariant>> byProductId = new HashMap<>();
        for (ProductVariant v : allVariants) {
            Long pid = v.getProduct().getId();
            byProductId.computeIfAbsent(pid, k -> new ArrayList<>()).add(v);
        }
        Comparator<ProductVariant> variantOrder = Comparator
                .comparing((ProductVariant v) -> Boolean.TRUE.equals(v.getIsDefault()))
                .reversed()
                .thenComparing(v -> v.getVariantCode() != null ? v.getVariantCode() : "", String.CASE_INSENSITIVE_ORDER);
        for (List<ProductVariant> list : byProductId.values()) {
            list.sort(variantOrder);
        }
        return products.stream().map(p -> {
            if (p.getProductType() == Product.ProductType.COMBO) {
                return DtoMapper.toResponse(p);
            }
            List<ProductVariant> vv = byProductId.getOrDefault(p.getId(), List.of());
            return DtoMapper.toResponse(p, vv);
        }).toList();
    }
}

