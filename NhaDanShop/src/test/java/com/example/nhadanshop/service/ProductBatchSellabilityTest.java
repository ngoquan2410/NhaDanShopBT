package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductBatchSellabilityTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 4, 26);

    @Test
    void isCurrentOnHand_trueWhenPositiveRemaining() {
        ProductBatch b = new ProductBatch();
        b.setRemainingQty(1);
        assertTrue(ProductBatchSellability.isCurrentOnHand(b));
    }

    @Test
    void isCurrentOnHand_falseWhenZero() {
        ProductBatch b = new ProductBatch();
        b.setRemainingQty(0);
        assertFalse(ProductBatchSellability.isCurrentOnHand(b));
    }

    @Test
    void isSellable_matchesPredicate() {
        Product p = new Product();
        p.setActive(true);
        ProductVariant v = new ProductVariant();
        v.setActive(true);
        v.setProduct(p);
        ProductBatch b = new ProductBatch();
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        b.setRemainingQty(5);
        b.setExpiryDate(TODAY);
        b.setVariant(v);

        assertTrue(ProductBatchSellability.isSellable(b, TODAY));
        b.setExpiryDate(TODAY.minusDays(1));
        assertFalse(ProductBatchSellability.isSellable(b, TODAY));
        b.setExpiryDate(TODAY);
        assertFalse(ProductBatchSellability.isSellable(b, TODAY.plusDays(1)));
    }

    @Test
    void isSellable_falseWhenInactiveOrNotActiveStatus() {
        Product p = new Product();
        p.setActive(true);
        ProductVariant v = new ProductVariant();
        v.setActive(true);
        v.setProduct(p);
        ProductBatch b = new ProductBatch();
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        b.setRemainingQty(1);
        b.setExpiryDate(TODAY);
        b.setVariant(v);
        assertTrue(ProductBatchSellability.isSellable(b, TODAY));

        p.setActive(false);
        assertFalse(ProductBatchSellability.isSellable(b, TODAY));
        p.setActive(true);
        v.setActive(false);
        assertFalse(ProductBatchSellability.isSellable(b, TODAY));

        v.setActive(true);
        b.setStatus(ProductBatch.STATUS_BLOCKED);
        assertFalse(ProductBatchSellability.isSellable(b, TODAY));
    }
}
