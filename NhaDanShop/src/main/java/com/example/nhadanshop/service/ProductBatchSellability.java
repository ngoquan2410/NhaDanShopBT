package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Slice 2 — documentation / in-memory predicate helper only.
 * <p>
 * Does <strong>not</strong> change any live FEFO, projection, or reporting behavior.
 * Repository equivalents for future slices live in {@link com.example.nhadanshop.repository.ProductBatchRepository}.
 * <h3>Carry-forward (Slice 1)</h3>
 * <ul>
 *   <li>After V18, receipt void may leave {@code status = 'active'} on a zero-qty batch tied to
 *   {@code receipt.status = 'voided'}. That is accepted until a lifecycle-alignment slice; helpers
 *   here do not fix or interpret receipt state.</li>
 *   <li>Receipt status is <strong>not</strong> part of the sellable predicate; a defensive
 *   {@code receipt = null OR confirmed} filter may be added in a later slice if policy requires it.</li>
 * </ul>
 */
public final class ProductBatchSellability {

    private ProductBatchSellability() {
    }

    /**
     * “Current on-hand / physical-positive” batch row — Slice 2 naming for future on-hand queries.
     * Matches legacy “positive remaining” semantics: {@code remainingQty &gt; 0} only (no expiry,
     * no status, no blocked/archived filter), because projection and {@code onHand} behavior are
     * unchanged in this slice.
     */
    public static boolean isCurrentOnHand(ProductBatch batch) {
        return batch != null && batch.getRemainingQty() > 0;
    }

    /**
     * Sale-sellable candidate in one place for docs/tests; future FEFO will use repository queries.
     * <ul>
     *   <li>{@code remainingQty &gt; 0}</li>
     *   <li>{@code status == active} (see {@link ProductBatch#STATUS_ACTIVE})</li>
     *   <li>{@code expiryDate &gt;= today} (inclusive; aligns with {@code &gt;= CURRENT_DATE} in SQL)</li>
     *   <li>variant and product present and both {@code active == true} (treats null as false)</li>
     * </ul>
     * “Expired” is <strong>not</strong> a persisted {@code ProductBatch.status} value; expiry is a date check only.
     */
    public static boolean isSellable(ProductBatch batch, LocalDate today) {
        Objects.requireNonNull(today, "today");
        if (batch == null) {
            return false;
        }
        if (batch.getRemainingQty() <= 0) {
            return false;
        }
        if (!ProductBatch.STATUS_ACTIVE.equals(batch.getStatus())) {
            return false;
        }
        if (batch.getExpiryDate() == null || batch.getExpiryDate().isBefore(today)) {
            return false;
        }
        ProductVariant variant = batch.getVariant();
        if (variant == null) {
            return false;
        }
        if (!Boolean.TRUE.equals(variant.getActive())) {
            return false;
        }
        Product product = variant.getProduct();
        if (product == null) {
            return false;
        }
        return Boolean.TRUE.equals(product.getActive());
    }
}
