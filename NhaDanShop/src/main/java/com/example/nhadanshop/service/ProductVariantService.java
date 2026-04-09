package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductVariantRequest;
import com.example.nhadanshop.dto.ProductVariantResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
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
    private final ProductBatchRepository batchRepo;

    // ── Query ─────────────────────────────────────────────────────────────────

    public List<ProductVariantResponse> getVariantsByProduct(Long productId) {
        if (!productRepo.existsById(productId))
            throw new EntityNotFoundException("Không tìm thấy SP ID: " + productId);
        return variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(productId)
                .stream().map(DtoMapper::toResponse).toList();
    }

    public ProductVariantResponse getVariantById(Long variantId) {
        return DtoMapper.toResponse(findOrThrow(variantId));
    }

    /**
     * Lookup variant theo mã — dùng khi barcode scan.
     * Tìm theo variant_code trước, nếu không có thì fallback tìm theo product.code (default variant).
     */
    public ProductVariantResponse getVariantByCode(String code) {
        // Ưu tiên: tìm theo variant_code
        var byVariantCode = variantRepo.findByVariantCodeIgnoreCase(code.trim());
        if (byVariantCode.isPresent()) return DtoMapper.toResponse(byVariantCode.get());

        // Fallback: tìm theo product.code → trả về default variant
        return productRepo.findByCode(code.trim().toUpperCase())
                .flatMap(p -> variantRepo.findByProductIdAndIsDefaultTrue(p.getId()))
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
        if (req.stockQty() != null) v.setStockQty(req.stockQty());
        if (req.minStockQty() != null) v.setMinStockQty(req.minStockQty());
        if (req.expiryDays() != null) v.setExpiryDays(req.expiryDays());
        if (req.isDefault() != null) v.setIsDefault(req.isDefault());
        if (req.imageUrl() != null) v.setImageUrl(req.imageUrl());
        if (req.conversionNote() != null) v.setConversionNote(req.conversionNote());
        v.setUpdatedAt(LocalDateTime.now());

        return DtoMapper.toResponse(variantRepo.save(v));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void deleteVariant(Long variantId) {
        ProductVariant v = findOrThrow(variantId);

        if (Boolean.TRUE.equals(v.getIsDefault())) {
            long count = variantRepo.findByProductIdOrderByIsDefaultDescVariantCodeAsc(
                    v.getProduct().getId()).size();
            if (count == 1)
                throw new IllegalStateException(
                    "Không thể xóa variant mặc định duy nhất của SP '" + v.getProduct().getCode() + "'.");
        }

        if (batchRepo.existsByVariantId(variantId))
            throw new IllegalStateException(
                "Variant '" + v.getVariantCode() + "' đã có lô hàng tồn kho. " +
                "Hãy chuyển lô sang variant khác hoặc đặt is_active=false thay vì xóa.");

        variantRepo.delete(v);
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
        if (variantId != null) {
            ProductVariant v = variantRepo.findById(variantId)
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy variant ID: " + variantId));
            // Validate variant thuộc đúng product
            if (!v.getProduct().getId().equals(productId)) {
                throw new IllegalArgumentException(
                    "Variant '" + v.getVariantCode() + "' không thuộc SP ID: " + productId);
            }
            return v;
        }
        // Fallback: default variant
        return variantRepo.findByProductIdAndIsDefaultTrue(productId)
                .orElseThrow(() -> new EntityNotFoundException(
                    "SP ID " + productId + " chưa có default variant. " +
                    "Hãy tạo variant và set is_default=true."));
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
        v.setStockQty(req.stockQty() != null ? req.stockQty() : 0);
        v.setMinStockQty(req.minStockQty() != null ? req.minStockQty() : 5);
        v.setExpiryDays(req.expiryDays());
        v.setIsDefault(Boolean.TRUE.equals(req.isDefault()));
        v.setImageUrl(req.imageUrl());
        v.setConversionNote(req.conversionNote());
        return v;
    }
}
