package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.ProductBatch;

import java.util.List;

/**
 * Shared deleteability rules for {@link com.example.nhadanshop.entity.InventoryReceipt}:
 * must match the guard in {@code InventoryReceiptService#deleteReceipt}.
 */
public record ReceiptDeleteEligibility(boolean canDelete, String deleteBlockReason) {

    public static final String STATUS_CONFIRMED = "confirmed";
    public static final String REASON_DOWNSTREAM_CONSUMPTION = "downstream_consumption";
    public static final String REASON_VOIDED = "voided";
    /** Duplicate void / void when receipt already voided (HTTP 409). */
    public static final String REASON_ALREADY_VOIDED = "already_voided";

    /**
     * Delete rules for a receipt, including voided (never hard-deletable) vs batch consumption.
     */
    public static ReceiptDeleteEligibility forReceipt(InventoryReceipt receipt, List<ProductBatch> batches) {
        if (receipt.getStatus() != null && InventoryReceipt.STATUS_VOIDED.equals(receipt.getStatus())) {
            return new ReceiptDeleteEligibility(false, REASON_VOIDED);
        }
        return fromBatches(batches);
    }

    /**
     * {@code canDelete} iff every batch for the receipt has {@code remainingQty == importQty}.
     * If any batch has {@code remainingQty < importQty}, delete is blocked with
     * {@link #REASON_DOWNSTREAM_CONSUMPTION}.
     */
    public static ReceiptDeleteEligibility fromBatches(List<ProductBatch> batches) {
        boolean blocked = batches.stream().anyMatch(ReceiptDeleteEligibility::isBlockedBatch);
        if (blocked) {
            return new ReceiptDeleteEligibility(false, REASON_DOWNSTREAM_CONSUMPTION);
        }
        return new ReceiptDeleteEligibility(true, null);
    }

    /**
     * Same condition as the historical {@code deleteReceipt} check:
     * {@code remainingQty < importQty} means downstream consumption of that lot.
     */
    public static boolean isBlockedBatch(ProductBatch b) {
        return b.getRemainingQty() < b.getImportQty();
    }
}
