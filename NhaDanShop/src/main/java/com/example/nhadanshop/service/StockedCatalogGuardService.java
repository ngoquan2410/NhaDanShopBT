package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Product.ProductType;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * Shared guards for archiving / deactivating / deleting stocked catalog entities.
 * Policy: physical batch remaining totals must be zero before product, variant, or combo is archived or toggled inactive.
 */
@Service
@RequiredArgsConstructor
public class StockedCatalogGuardService {

    private final ProductBatchRepository batchRepository;
    private final ProductVariantRepository variantRepository;
    private final ProductComboRepository comboItemRepository;
    private final Clock businessClock;

    public void assertProductMayArchiveOrDeactivate(Product product) {
        if (product == null) {
            return;
        }
        if (product.getProductType() == ProductType.COMBO) {
            assertComboMayArchiveOrDeactivate(product);
            return;
        }
        List<ProductVariant> variants = variantRepository.findByProductIdOrderByIsDefaultDescVariantCodeAsc(product.getId());
        int physical = 0;
        int sellable = 0;
        long batchRows = 0;
        for (ProductVariant v : variants) {
            VariantTotals t = totalsForVariant(v);
            physical += t.physical;
            sellable += t.sellable;
            batchRows += t.batchesWithStock;
        }
        if (physical > 0) {
            throw conflict(product.getCode(), null, physical, sellable, batchRows);
        }
    }

    public void assertVariantMayArchiveOrDeactivate(ProductVariant variant) {
        if (variant == null) {
            return;
        }
        VariantTotals t = totalsForVariant(variant);
        if (t.physical > 0) {
            String productCode = variant.getProduct() != null ? variant.getProduct().getCode() : "?";
            throw conflict(productCode, variant.getVariantCode(), t.physical, t.sellable, t.batchesWithStock);
        }
    }

    /** Blocks when combo could still reflect sellable/virtual capacity or components retain physical inventory. */
    public void assertComboMayArchiveOrDeactivate(Product comboProduct) {
        if (comboProduct == null || comboProduct.getProductType() != ProductType.COMBO) {
            return;
        }
        List<ProductComboItem> items = comboItemRepository.findByComboProduct(comboProduct);
        if (items.isEmpty()) {
            return;
        }
        LocalDate asOf = LocalDate.now(businessClock);
        int minPhysVirt = Integer.MAX_VALUE;
        int minSellVirt = Integer.MAX_VALUE;
        long totalBatches = 0;
        for (ProductComboItem ci : items) {
            if (ci.getProduct() == null) {
                continue;
            }
            ProductVariant dv = ci.getProduct().getDefaultVariant();
            if (dv == null || ci.getQuantity() == null || ci.getQuantity() <= 0) {
                continue;
            }
            int q = ci.getQuantity();
            VariantTotals t = totalsForVariant(dv);
            totalBatches += t.batchesWithStock;
            minPhysVirt = Math.min(minPhysVirt, Math.floorDiv(Math.max(t.physical, 0), q));
            minSellVirt = Math.min(minSellVirt, Math.floorDiv(Math.max(t.sellable, 0), q));
        }
        if (minPhysVirt == Integer.MAX_VALUE && minSellVirt == Integer.MAX_VALUE) {
            return;
        }
        int physVirt = minPhysVirt == Integer.MAX_VALUE ? 0 : minPhysVirt;
        int sellVirt = minSellVirt == Integer.MAX_VALUE ? 0 : minSellVirt;
        if (physVirt > 0 || sellVirt > 0) {
            throw new IllegalStateException(String.format(
                    "Không thể lưu trữ/ngưng combo '%s': còn tồn thành phần hoặc tồn bán được của combo "
                            + "(virtual tồn vật lý=%d combo, virtual tổng bán được=%d combo). "
                            + "Số lô còn hàng của các thành phần: %d. "
                            + "Vui lòng xử lý kiểm kê, phiếu điều chỉnh, void/hủy lô thích hợp trước.",
                    comboProduct.getCode(), physVirt, sellVirt, totalBatches));
        }
    }

    private VariantTotals totalsForVariant(ProductVariant v) {
        long bid = v.getId();
        int physical = batchRepository.sumRemainingQtyByVariantId(bid);
        int sellable = batchRepository.sumSellableRemainingQtyByVariantId(bid, LocalDate.now(businessClock));
        long batchesWithStock = batchRepository.countByVariant_IdAndRemainingQtyGreaterThan(bid, 0);
        return new VariantTotals(physical, sellable, batchesWithStock);
    }

    private static IllegalStateException conflict(
            String productCode, String variantCode, int physical, int sellable, long batchRows) {
        String codeHint = variantCode != null && !variantCode.isBlank()
                ? "variantCode=%s của sản phẩm=%s".formatted(variantCode, productCode)
                : "productCode=%s".formatted(productCode);
        return new IllegalStateException(String.format(
                "Không thể lưu trữ/ngưng khi còn tồn lô (%s): tồn vật lý=%d, tồn có thể bán=%d, số lô còn hàng=%d.",
                codeHint, physical, sellable, batchRows));
    }

    private record VariantTotals(int physical, int sellable, long batchesWithStock) {}
}
