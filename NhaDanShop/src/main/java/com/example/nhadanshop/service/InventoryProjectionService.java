package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryProjectionBatchResponse;
import com.example.nhadanshop.dto.InventoryProjectionResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Product.ProductType;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InventoryProjectionService {

    private final ProductVariantRepository variantRepository;
    private final ProductBatchRepository batchRepository;

    public List<InventoryProjectionResponse> listProjections() {
        List<ProductVariant> variants = variantRepository.findAllActiveWithProductAndCategory();
        if (variants.isEmpty()) {
            return List.of();
        }

        List<Long> variantIds = variants.stream()
                .map(ProductVariant::getId)
                .toList();
        Map<Long, List<ProductBatch>> batchesByVariant = batchRepository.findActiveBatchesByVariantIds(variantIds)
                .stream()
                .collect(Collectors.groupingBy(batch -> batch.getVariant().getId()));

        List<Long> singleVariantIds = variants.stream()
                .filter(v -> isSinglePhysicalProduct(v.getProduct()))
                .map(ProductVariant::getId)
                .toList();
        Map<Long, Integer> sellableByVariant = sellableSumsByVariantIds(singleVariantIds);

        return variants.stream()
                .map(variant -> toProjection(
                        variant,
                        batchesByVariant.getOrDefault(variant.getId(), List.of()),
                        sellableByVariant))
                .toList();
    }

    public InventoryProjectionResponse getProjection(Long variantId) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));
        List<ProductBatch> batches = batchRepository.findActiveBatchesByVariantId(variantId);
        Map<Long, Integer> sellable = sellableSumsByVariantIds(
                isSinglePhysicalProduct(variant.getProduct()) ? List.of(variant.getId()) : List.of());
        return toProjection(variant, batches, sellable);
    }

    private static boolean isSinglePhysicalProduct(Product product) {
        return product != null && product.getProductType() == ProductType.SINGLE;
    }

    private Map<Long, Integer> sellableSumsByVariantIds(List<Long> singleVariantIds) {
        if (singleVariantIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] row : batchRepository.sumSellableRemainingQtyByVariantIds(singleVariantIds)) {
            Long vid = (Long) row[0];
            int sum = ((Number) row[1]).intValue();
            out.put(vid, sum);
        }
        return out;
    }

    private InventoryProjectionResponse toProjection(
            ProductVariant variant,
            List<ProductBatch> batches,
            Map<Long, Integer> sellableSums) {
        List<InventoryProjectionBatchResponse> byBatch = new ArrayList<>();
        int onHand = 0;
        for (ProductBatch batch : batches) {
            int qty = batch.getRemainingQty();
            onHand += qty;
            byBatch.add(new InventoryProjectionBatchResponse(
                    batch.getId(),
                    batch.getBatchCode(),
                    qty,
                    batch.getCostPrice(),
                    batch.getExpiryDate(),
                    batch.getReceipt() != null ? batch.getReceipt().getId() : null,
                    batch.getCreatedAt()
            ));
        }

        int reserved = 0;
        int available = onHand;
        Product product = variant.getProduct();
        Integer sellableQty;
        if (isSinglePhysicalProduct(product)) {
            sellableQty = sellableSums.getOrDefault(variant.getId(), 0);
        } else {
            // COMBO (or missing product): virtual stock; do not attribute physical sellable FEFO capacity here.
            sellableQty = null;
        }
        return new InventoryProjectionResponse(
                variant.getId(),
                product != null ? product.getId() : null,
                product != null ? product.getCode() : null,
                product != null ? product.getName() : null,
                variant.getVariantCode(),
                variant.getVariantName(),
                variant.getSellUnit(),
                onHand,
                reserved,
                available,
                sellableQty,
                byBatch
        );
    }
}
