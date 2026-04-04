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

    public List<ProductVariantResponse> getLowStockVariants() {
        return variantRepo.findLowStockVariants()
                .stream().map(DtoMapper::toResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public ProductVariantResponse createVariant(Long productId, ProductVariantRequest req) {
        Product product = productRepo.findById(productId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy SP ID: " + productId));

        if (product.isCombo())
            throw new IllegalArgumentException("COMBO product không hỗ trợ variants.");

        if (variantRepo.existsByVariantCode(req.variantCode()))
            throw new IllegalArgumentException("Mã variant '" + req.variantCode() + "' đã tồn tại.");

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

        // Nếu set is_default → clear default cũ trước
        if (Boolean.TRUE.equals(req.isDefault()) && !Boolean.TRUE.equals(v.getIsDefault())) {
            variantRepo.clearDefaultByProductId(v.getProduct().getId());
        }

        v.setVariantCode(req.variantCode());
        v.setVariantName(req.variantName());
        v.setSellUnit(req.sellUnit());
        v.setImportUnit(req.importUnit());
        if (req.piecesPerUnit() != null) v.setPiecesPerUnit(req.piecesPerUnit());
        v.setSellPrice(req.sellPrice());
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
        v.setSellUnit(product.getSellUnit() != null ? product.getSellUnit() : product.getUnit());
        v.setImportUnit(product.getImportUnit());
        v.setPiecesPerUnit(product.getPiecesPerImportUnit() != null ? product.getPiecesPerImportUnit() : 1);
        v.setSellPrice(product.getSellPrice() != null ? product.getSellPrice() : BigDecimal.ZERO);
        v.setCostPrice(product.getCostPrice() != null ? product.getCostPrice() : BigDecimal.ZERO);
        v.setStockQty(product.getStockQty() != null ? product.getStockQty() : 0);
        v.setExpiryDays(product.getExpiryDays());
        v.setActive(product.getActive());
        v.setIsDefault(true);
        v.setImageUrl(product.getImageUrl());
        v.setConversionNote(product.getConversionNote());
        return variantRepo.save(v);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
        v.setSellPrice(req.sellPrice());
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
