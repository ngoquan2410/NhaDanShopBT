package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SellableStockService {

    private final ProductBatchRepository batchRepository;
    private final ProductComboRepository comboRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;

    public int salesSellableQtyByVariantId(Long variantId, LocalDate businessDate) {
        if (variantId == null) {
            return 0;
        }
        return batchRepository.sumSellableRemainingQtyByVariantId(variantId, businessDate);
    }

    public Map<Long, Integer> salesSellableQtyByVariantIds(Collection<Long> variantIds, LocalDate businessDate) {
        if (variantIds == null || variantIds.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = new LinkedHashSet<>(variantIds).stream().toList();
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] row : batchRepository.sumSellableRemainingQtyByVariantIds(ids, businessDate)) {
            out.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        }
        return out;
    }

    public int comboSellableQty(Long comboProductId, LocalDate businessDate) {
        Product combo = productRepository.findById(comboProductId)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay combo ID: " + comboProductId));
        return comboSellableQty(combo, businessDate);
    }

    public int comboSellableQty(Product comboProduct, LocalDate businessDate) {
        requireActiveCombo(comboProduct);
        List<ProductComboItem> items = comboRepository.findByComboProduct(comboProduct);
        if (items.isEmpty()) {
            throw new IllegalStateException("Combo '" + comboProduct.getName() + "' chua co thanh phan");
        }
        int comboSellable = Integer.MAX_VALUE;
        for (ProductComboItem item : items) {
            int componentQty = item.getQuantity() != null ? item.getQuantity() : 0;
            if (componentQty <= 0) {
                throw new IllegalStateException("Combo '" + comboProduct.getName() + "' co thanh phan so luong khong hop le");
            }
            Product component = item.getProduct();
            requireActiveProduct(component, "Thanh phan combo");
            ProductVariant variant = defaultComponentVariant(component);
            requireActiveSellableVariant(variant, component.getName());
            int sellable = salesSellableQtyByVariantId(variant.getId(), businessDate);
            comboSellable = Math.min(comboSellable, sellable / componentQty);
        }
        return comboSellable == Integer.MAX_VALUE ? 0 : comboSellable;
    }

    public void assertVariantSalesSellable(
            Long variantId,
            int requiredQty,
            LocalDate businessDate,
            String context
    ) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay variant ID: " + variantId));
        assertVariantSalesSellable(variant, requiredQty, businessDate, context);
    }

    public void assertVariantSalesSellable(
            ProductVariant variant,
            int requiredQty,
            LocalDate businessDate,
            String context
    ) {
        if (requiredQty <= 0) {
            return;
        }
        requireActiveProduct(variant.getProduct(), "San pham");
        requireActiveSellableVariant(variant, variant.getProduct().getName());
        int sellable = salesSellableQtyByVariantId(variant.getId(), businessDate);
        if (sellable < requiredQty) {
            throw new IllegalArgumentException(
                    (context == null || context.isBlank() ? "Khong du ton ban duoc" : context)
                            + " [" + variant.getVariantCode() + "]. Can " + requiredQty + ", con " + sellable + ".");
        }
    }

    public void assertComboSalesSellable(
            Long comboProductId,
            int comboQty,
            LocalDate businessDate,
            String context
    ) {
        Product combo = productRepository.findById(comboProductId)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay combo ID: " + comboProductId));
        assertComboSalesSellable(combo, comboQty, businessDate, context);
    }

    public void assertComboSalesSellable(
            Product comboProduct,
            int comboQty,
            LocalDate businessDate,
            String context
    ) {
        if (comboQty <= 0) {
            return;
        }
        requireActiveCombo(comboProduct);
        List<ProductComboItem> items = comboRepository.findByComboProduct(comboProduct);
        if (items.isEmpty()) {
            throw new IllegalStateException("Combo '" + comboProduct.getName() + "' chua co thanh phan");
        }
        for (ProductComboItem item : items) {
            int componentQty = item.getQuantity() != null ? item.getQuantity() : 0;
            if (componentQty <= 0) {
                throw new IllegalStateException("Combo '" + comboProduct.getName() + "' co thanh phan so luong khong hop le");
            }
            Product component = item.getProduct();
            requireActiveProduct(component, "Thanh phan combo");
            ProductVariant variant = defaultComponentVariant(component);
            requireActiveSellableVariant(variant, component.getName());
            int required = componentQty * comboQty;
            int sellable = salesSellableQtyByVariantId(variant.getId(), businessDate);
            if (sellable < required) {
                throw new IllegalArgumentException(
                        (context == null || context.isBlank() ? "Combo '" + comboProduct.getName() + "'" : context)
                                + ": thanh phan '" + component.getName() + "' khong du hang. Can "
                                + required + ", con " + sellable + ".");
            }
        }
    }

    private void requireActiveCombo(Product product) {
        if (product == null || !product.isCombo()) {
            throw new IllegalArgumentException("San pham khong phai combo");
        }
        if (!Boolean.TRUE.equals(product.getActive())) {
            throw new IllegalArgumentException("Combo '" + product.getName() + "' da ngung kinh doanh");
        }
    }

    private void requireActiveProduct(Product product, String label) {
        if (product == null || !Boolean.TRUE.equals(product.getActive())) {
            throw new IllegalArgumentException(label + " da ngung kinh doanh");
        }
    }

    private void requireActiveSellableVariant(ProductVariant variant, String productName) {
        if (variant == null) {
            throw new EntityNotFoundException("San pham '" + productName + "' chua co default variant");
        }
        if (!Boolean.TRUE.equals(variant.getActive())) {
            throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong hoat dong");
        }
        if (!Boolean.TRUE.equals(variant.getIsSellable())) {
            throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong ban duoc");
        }
    }

    private ProductVariant defaultComponentVariant(Product component) {
        return variantRepository.findByProductIdAndIsDefaultTrue(component.getId())
                .orElseThrow(() -> new EntityNotFoundException(
                        "Thanh phan combo '" + component.getName() + "' chua co default variant"));
    }
}
