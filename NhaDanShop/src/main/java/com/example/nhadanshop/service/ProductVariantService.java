package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductVariantPatchRequest;
import com.example.nhadanshop.dto.ProductVariantRequest;
import com.example.nhadanshop.dto.ProductVariantResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductVariantService {

    private final ProductVariantRepository variantRepo;
    private final ProductRepository productRepo;

    // ── Query ─────────────────────────────────────────────────────────────────

    /**
     * @param activeOnly if true, return only {@code is_active = true} (new sale / selection).
     *                    If false (default), return all variants so admin can see archived rows and {@code active} on each.
     */
    public List<ProductVariantResponse> getVariantsByProduct(
            long productId,
            boolean activeOnly,
            boolean forSaleOnly) {
        if (!productRepo.existsById(productId)) {
            throw new EntityNotFoundException("Không tìm thấy SP ID: " + productId);
        }
        if (forSaleOnly) {
            return variantRepo
                    .findByProductIdAndActiveTrueAndIsSellableTrueOrderByIsDefaultDescVariantCodeAsc(productId)
                    .stream()
                    .map(DtoMapper::toResponse)
                    .toList();
        }
        var list = activeOnly
                ? variantRepo.findByProductIdAndActiveTrueOrderByIsDefaultDescVariantCodeAsc(productId)
                : variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(productId);
        return list.stream().map(DtoMapper::toResponse).toList();
    }

    public ProductVariantResponse getVariantById(Long variantId) {
        return DtoMapper.toResponse(findOrThrow(variantId));
    }

    /**
     * Lookup variant theo mã — dùng khi barcode scan.
     * Tìm theo variant_code trước, nếu không có thì fallback tìm theo product.code (default variant).
     * {@code noRollbackFor}: missing code is a normal outcome for POS scan callers that map it to a blocked response;
     * without this, a joined outer transaction (e.g. {@link PosScanService#scan}) becomes rollback-only.
     */
    @Transactional(readOnly = true, noRollbackFor = EntityNotFoundException.class)
    public ProductVariantResponse getVariantByCode(String code) {
        // POS / bán hàng: chỉ mã còn bán, sellable, SP active
        var byVariantCode = variantRepo.findByVariantCodeIgnoreCase(code.trim());
        if (byVariantCode.isPresent()) {
            ProductVariant v = byVariantCode.get();
            if (!Boolean.TRUE.equals(v.getProduct().getActive())) {
                throw new EntityNotFoundException(
                        "Không tìm thấy sản phẩm/biến thể với mã: '" + code + "' (sản phẩm ngừng kinh doanh).");
            }
            if (!Boolean.TRUE.equals(v.getActive())) {
                throw new EntityNotFoundException(
                        "Không tìm thấy sản phẩm/biến thể với mã: '" + code + "' (đã ngừng kinh doanh).");
            }
            if (!Boolean.TRUE.equals(v.getIsSellable())) {
                throw new EntityNotFoundException(
                        "Không tìm thấy sản phẩm/biến thể bán lẻ với mã: '" + code + "' (chỉ dùng kho/NG).");
            }
            return DtoMapper.toResponse(v);
        }

        // Fallback: tìm theo product.code → trả về default variant
        return productRepo.findByCode(code.trim().toUpperCase())
                .filter(p -> Boolean.TRUE.equals(p.getActive()))
                .flatMap(p -> variantRepo.findByProductIdAndIsDefaultTrue(p.getId()))
                .filter(v -> Boolean.TRUE.equals(v.getActive()) && Boolean.TRUE.equals(v.getIsSellable()))
                .map(DtoMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(
                    "Không tìm thấy sản phẩm/biến thể với mã: '" + code + "'"));
    }

    public List<ProductVariantResponse> getLowStockVariants() {
        return variantRepo.findLowStockVariants()
                .stream().map(DtoMapper::toResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public ProductVariantResponse createVariant(Long productId, ProductVariantRequest req) {
        Product product = productRepo.findById(productId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy SP ID: " + productId));

        // ── GUARD: Combo không có variant ────────────────────────────────────
        // Tồn kho combo là ảo, tính từ min(stock_thành_phần / qty_yêu_cầu).
        // Mọi attempt tạo variant cho combo đều bị chặn tại đây.
        if (Product.ProductType.COMBO.equals(product.getProductType())) {
            throw new IllegalArgumentException(
                "Không thể tạo variant cho Combo '" + product.getCode() + "'. " +
                "Combo không có variant — tồn kho được tính tự động từ các SP thành phần.");
        }

        if (variantRepo.existsByVariantCode(req.variantCode()))
            throw new IllegalArgumentException("Mã variant '" + req.variantCode() + "' đã tồn tại.");

        // [Fix #2] variant_code KHÔNG được trùng product.code của SP khác
        validateVariantCodeNamespace(req.variantCode(), productId);

        // Nếu set is_default → clear default cũ trước
        if (Boolean.TRUE.equals(req.isDefault())) {
            variantRepo.clearDefaultByProductId(productId);
        }

        ProductVariant v = buildVariant(product, req);
        return DtoMapper.toResponse(variantRepo.save(v));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public ProductVariantResponse updateVariant(Long variantId, ProductVariantRequest req) {
        ProductVariant v = findOrThrow(variantId);

        // Nếu đổi variant_code → check unique
        if (!v.getVariantCode().equalsIgnoreCase(req.variantCode())
                && variantRepo.existsByVariantCode(req.variantCode())) {
            throw new IllegalArgumentException("Mã variant '" + req.variantCode() + "' đã tồn tại.");
        }
        // [Fix #2] Validate namespace
        if (!v.getVariantCode().equalsIgnoreCase(req.variantCode())) {
            validateVariantCodeNamespace(req.variantCode(), v.getProduct().getId());
        }

        // Nếu set is_default → clear default cũ trước
        if (Boolean.TRUE.equals(req.isDefault()) && !Boolean.TRUE.equals(v.getIsDefault())) {
            variantRepo.clearDefaultByProductId(v.getProduct().getId());
        }

        v.setVariantCode(req.variantCode());
        v.setVariantName(req.variantName());
        v.setSellUnit(req.sellUnit());
        v.setImportUnit(req.importUnit());
        if (req.piecesPerUnit() != null) v.setPiecesPerUnit(req.piecesPerUnit());
        // sellPrice và costPrice đều optional — null = không thay đổi; 0 = chấp nhận (điền sau)
        if (req.sellPrice() != null) v.setSellPrice(req.sellPrice());
        if (req.costPrice() != null) v.setCostPrice(req.costPrice());
        if (req.stockQty() != null) {
            throw new IllegalArgumentException(
                    "Không cho phép cập nhật trực tiếp stockQty. Vui lòng dùng luồng nhập/xuất/điều chỉnh tồn kho.");
        }
        if (req.minStockQty() != null) v.setMinStockQty(req.minStockQty());
        if (req.expiryDays() != null) v.setExpiryDays(req.expiryDays());
        if (req.isDefault() != null) v.setIsDefault(req.isDefault());
        if (req.imageUrl() != null) v.setImageUrl(req.imageUrl());
        if (req.conversionNote() != null) v.setConversionNote(req.conversionNote());
        if (req.active() != null) v.setActive(req.active());
        if (req.isSellable() != null) v.setIsSellable(req.isSellable());
        v.setUpdatedAt(LocalDateTime.now());

        return DtoMapper.toResponse(variantRepo.save(v));
    }

    @Transactional
    public ProductVariantResponse patchVariant(long productId, long variantId, ProductVariantPatchRequest p) {
        ProductVariant v = findOrThrow(variantId);
        if (!v.getProduct().getId().equals(productId)) {
            throw new IllegalArgumentException("Variant " + variantId + " không thuộc sản phẩm " + productId);
        }
        if (p.variantCode() != null && !p.variantCode().equalsIgnoreCase(v.getVariantCode())
                && variantRepo.existsByVariantCode(p.variantCode())) {
            throw new IllegalArgumentException("Mã variant '" + p.variantCode() + "' đã tồn tại.");
        }
        if (p.variantCode() != null && !p.variantCode().equalsIgnoreCase(v.getVariantCode())) {
            validateVariantCodeNamespace(p.variantCode(), productId);
        }
        if (Boolean.TRUE.equals(p.isDefault()) && !Boolean.TRUE.equals(v.getIsDefault())) {
            variantRepo.clearDefaultByProductId(v.getProduct().getId());
        }
        if (p.variantCode() != null) v.setVariantCode(p.variantCode());
        if (p.variantName() != null) v.setVariantName(p.variantName());
        if (p.sellUnit() != null) v.setSellUnit(p.sellUnit());
        if (p.importUnit() != null) v.setImportUnit(p.importUnit().isEmpty() ? null : p.importUnit());
        if (p.piecesPerUnit() != null) v.setPiecesPerUnit(p.piecesPerUnit());
        if (p.sellPrice() != null) v.setSellPrice(p.sellPrice());
        if (p.costPrice() != null) v.setCostPrice(p.costPrice());
        if (p.minStockQty() != null) v.setMinStockQty(p.minStockQty());
        if (p.expiryDays() != null) v.setExpiryDays(p.expiryDays());
        if (p.isDefault() != null) v.setIsDefault(p.isDefault());
        if (p.imageUrl() != null) v.setImageUrl(p.imageUrl().isEmpty() ? null : p.imageUrl());
        if (p.conversionNote() != null) v.setConversionNote(p.conversionNote().isEmpty() ? null : p.conversionNote());
        if (p.active() != null) v.setActive(p.active());
        if (p.isSellable() != null) v.setIsSellable(p.isSellable());
        v.setUpdatedAt(LocalDateTime.now());
        return DtoMapper.toResponse(variantRepo.save(v));
    }

    // ── Delete / archive (Phase 2 soft policy) ────────────────────────────────

    /**
     * If the variant is referenced (batches, movements, or any transaction line) or
     * {@code is_active} should be used instead of physical delete, sets {@code active=false}
     * and returns the DTO. Does not change stock, batches, or movements.
     * <p>
     * If the variant is unused and safe, physically deletes the row and returns {@code null}
     * (HTTP 204 from controller).
     */
    @Transactional
    public ProductVariantResponse deleteVariantOrArchive(long productId, long variantId) {
        ProductVariant v = findOrThrow(variantId);
        if (!v.getProduct().getId().equals(productId)) {
            throw new IllegalArgumentException("Variant " + variantId + " không thuộc sản phẩm " + productId);
        }

        if (Boolean.TRUE.equals(v.getIsDefault())) {
            long count = variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(
                    v.getProduct().getId()).size();
            if (count == 1) {
                throw new IllegalStateException(
                    "Không thể xóa variant mặc định duy nhất của SP '" + v.getProduct().getCode() + "'.");
            }
        }

        boolean used = variantRepo.isVariantStructurallyUsed(variantId);
        if (used) {
            v.setActive(false);
            v.setUpdatedAt(LocalDateTime.now());
            return DtoMapper.toResponse(variantRepo.save(v));
        }

        variantRepo.delete(v);
        return null;
    }

    // ── Helper: Resolve variant từ variantId hoặc productId ──────────────────

    /**
     * Resolve variant theo thứ tự ưu tiên:
     *   1. variantId != null → lookup trực tiếp
     *   2. variantId == null → lấy default variant của productId
     *   3. Không có default → throw
     *
     * Dùng bởi InventoryReceiptService, InvoiceService, PendingOrderService.
     */
    public ProductVariant resolveVariant(Long variantId, Long productId) {
        return resolveVariant(variantId, productId, false);
    }

    /**
     * @param requireSellableForSales when true (bán hàng / POS / pending-order bán), enforce
     *                                product active, variant active, variant sellable
     */
    public ProductVariant resolveVariant(Long variantId, Long productId, boolean requireSellableForSales) {
        if (variantId != null) {
            ProductVariant v = variantRepo.findById(variantId)
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy variant ID: " + variantId));
            if (!v.getProduct().getId().equals(productId)) {
                throw new IllegalArgumentException(
                    "Variant '" + v.getVariantCode() + "' không thuộc SP ID: " + productId);
            }
            if (requireSellableForSales) {
                assertReadyForCustomerSale(v);
            } else {
                if (!Boolean.TRUE.equals(v.getActive())) {
                    throw new IllegalStateException(
                        "Variant '" + v.getVariantCode() + "' đã ngừng kinh doanh; không dùng cho giao dịch mới.");
                }
            }
            return v;
        }
        ProductVariant def = variantRepo.findByProductIdAndIsDefaultTrue(productId)
                .orElseThrow(() -> new EntityNotFoundException(
                    "SP ID " + productId + " chưa có default variant. " +
                    "Hãy tạo variant và set is_default=true."));
        if (requireSellableForSales) {
            assertReadyForCustomerSale(def);
        } else {
            if (!Boolean.TRUE.equals(def.getActive())) {
                throw new IllegalStateException(
                    "Default variant của SP ID " + productId + " đã ngừng kinh doanh; không dùng cho giao dịch mới.");
            }
        }
        return def;
    }

    private void assertReadyForCustomerSale(ProductVariant v) {
        Product p = v.getProduct();
        if (!Boolean.TRUE.equals(p.getActive())) {
            throw new IllegalStateException(
                    "Sản phẩm '" + p.getName() + "' đã ngừng kinh doanh; không bán thêm trên kênh bán hàng.");
        }
        if (!Boolean.TRUE.equals(v.getActive())) {
            throw new IllegalStateException(
                    "Variant '" + v.getVariantCode() + "' đã ngừng kinh doanh; không bán thêm trên kênh bán hàng.");
        }
        if (!Boolean.TRUE.equals(v.getIsSellable())) {
            throw new IllegalStateException(
                    "Variant '" + v.getVariantCode() + "' không bán lẻ (isSellable=false); dùng cho kho/NG, không bán tại quầy/online.");
        }
    }

    @Transactional
    public ProductVariantResponse setDefaultVariant(long productId, long variantId) {
        ProductVariant v = findOrThrow(variantId);
        if (!v.getProduct().getId().equals(productId)) {
            throw new IllegalArgumentException("Variant " + variantId + " không thuộc sản phẩm " + productId);
        }
        if (!Boolean.TRUE.equals(v.getActive())) {
            throw new IllegalStateException("Không thể đặt variant đã lưu kho (ngừng KD) làm mặc định.");
        }
        variantRepo.clearDefaultByProductId(productId);
        v.setIsDefault(true);
        v.setUpdatedAt(LocalDateTime.now());
        return DtoMapper.toResponse(variantRepo.save(v));
    }

    /**
     * Auto-tạo default variant từ fields của Product (dùng khi tạo SP mới không có variants).
     * Backward compat: SP cũ luôn có 1 default variant.
     *
     * Idempotent: gọi nhiều lần cũng an toàn.
     * - Nếu đã có default variant → trả về luôn, KHÔNG tạo mới.
     * - Nếu variant_code đã bị dùng bởi SP khác → dùng product_code + "_DEF" để tránh conflict.
     */
    @Transactional
    public ProductVariant createDefaultVariantFromProduct(Product product) {
        // Kiểm tra đã có default variant chưa (idempotent check #1)
        var existing = variantRepo.findByProductIdAndIsDefaultTrue(product.getId());
        if (existing.isPresent()) return existing.get();

        // Kiểm tra xem có variant nào của SP này chưa (bao gồm non-default)
        List<ProductVariant> allVariants = variantRepo
                .findByProductIdOrderByIsDefaultDescVariantCodeAsc(product.getId());
        if (!allVariants.isEmpty()) {
            // Đã có ít nhất 1 variant — đặt cái đầu tiên làm default
            ProductVariant first = allVariants.get(0);
            if (!Boolean.TRUE.equals(first.getIsDefault())) {
                variantRepo.clearDefaultByProductId(product.getId());
                first.setIsDefault(true);
                first.setUpdatedAt(LocalDateTime.now());
                variantRepo.save(first);
            }
            return first;
        }

        // Resolve variant_code: dùng product.code nếu chưa bị dùng bởi SP KHÁC
        // (tránh tình huống 2 SP có cùng code — không nên xảy ra nhưng phòng thủ)
        String variantCode = product.getCode();
        if (variantRepo.existsByVariantCode(variantCode)) {
            // variant_code đã bị dùng — kiểm tra xem có phải của SP này không
            var byCode = variantRepo.findByVariantCodeIgnoreCase(variantCode);
            if (byCode.isPresent() && !byCode.get().getProduct().getId().equals(product.getId())) {
                // Bị dùng bởi SP khác → fallback code
                variantCode = product.getCode() + "_" + product.getId();
                log.warn("[Sprint0] variant_code '{}' đã bị dùng bởi SP khác → fallback: '{}'",
                        product.getCode(), variantCode);
            } else if (byCode.isPresent()) {
                // Đã có variant này (nhưng is_default=false) → set thành default
                ProductVariant v = byCode.get();
                variantRepo.clearDefaultByProductId(product.getId());
                v.setIsDefault(true);
                v.setUpdatedAt(LocalDateTime.now());
                return variantRepo.save(v);
            }
        }

        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(variantCode);
        v.setVariantName(product.getName());
        v.setSellUnit("cai");
        v.setImportUnit(null);
        v.setPiecesPerUnit(1);
        v.setSellPrice(BigDecimal.ZERO);
        v.setCostPrice(BigDecimal.ZERO);
        v.setStockQty(0);
        v.setExpiryDays(null);
        v.setActive(product.getActive());
        v.setIsSellable(true);
        v.setIsDefault(true);
        v.setImageUrl(product.getImageUrl());
        v.setConversionNote(null);
        return variantRepo.save(v);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * [Fix #2] Validate variant_code không được trùng product.code của SP khác.
     * Cho phép trùng product.code của CHÍNH SP đó (default variant backward compat).
     *
     * Convention mới: khi tạo variant thứ 2 trở đi nên dùng mã riêng.
     * VD: "MUOI-ABC-HU100", "MUOI-ABC-GOI50" thay vì "MUOI-ABC".
     */
    private void validateVariantCodeNamespace(String variantCode, Long ownProductId) {
        productRepo.findByCode(variantCode).ifPresent(conflictProduct -> {
            if (!conflictProduct.getId().equals(ownProductId)) {
                throw new IllegalArgumentException(
                    "Mã variant '" + variantCode + "' trùng với mã sản phẩm gốc '" +
                    conflictProduct.getName() + "' (ID=" + conflictProduct.getId() + "). " +
                    "Hãy dùng mã riêng biệt, VD: '" + variantCode + "-V1'.");
            }
        });
    }

    private ProductVariant findOrThrow(Long variantId) {
        return variantRepo.findById(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
    }

    private ProductVariant buildVariant(Product product, ProductVariantRequest req) {
        ProductVariant v = new ProductVariant();
        v.setProduct(product);
        v.setVariantCode(req.variantCode());
        v.setVariantName(req.variantName());
        v.setSellUnit(req.sellUnit());
        v.setImportUnit(req.importUnit());
        v.setPiecesPerUnit(req.piecesPerUnit() != null ? req.piecesPerUnit() : 1);
        // Giá bán và giá vốn đều optional — null → 0 (sẽ cập nhật sau khi nhập kho)
        v.setSellPrice(req.sellPrice() != null ? req.sellPrice() : BigDecimal.ZERO);
        v.setCostPrice(req.costPrice() != null ? req.costPrice() : BigDecimal.ZERO);
        if (req.stockQty() != null && req.stockQty() != 0) {
            throw new IllegalArgumentException(
                    "Không cho phép set stockQty khi tạo variant. stockQty được tính từ batch.");
        }
        v.setStockQty(0);
        v.setMinStockQty(req.minStockQty() != null ? req.minStockQty() : 5);
        v.setExpiryDays(req.expiryDays());
        v.setIsDefault(Boolean.TRUE.equals(req.isDefault()));
        v.setImageUrl(req.imageUrl());
        v.setConversionNote(req.conversionNote());
        v.setActive(req.active() != null ? req.active() : true);
        v.setIsSellable(req.isSellable() == null || Boolean.TRUE.equals(req.isSellable()));
        return v;
    }
}
