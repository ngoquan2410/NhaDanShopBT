package com.example.nhadanshop.service;

/**
 * Scope values for {@link IdempotencyService} — kết hợp với Idempotency-Key + user để dedupe retry.
 * Scope có id (path) để cùng key không áp dụng nhầm sang tài nguyên khác.
 */
public final class IdempotencyScopes {

    public static final String HEADER_NAME = "Idempotency-Key";

    public static final String RECEIPT_CREATE = "receipt.create";
    public static final String RECEIPT_IMPORT_EXCEL = "receipt.import-excel";

    public static String receiptDelete(long receiptId) {
        return "receipt.delete:" + receiptId;
    }

    public static String receiptVoid(long receiptId) {
        return "receipt.void:" + receiptId;
    }

    public static final String INVOICE_CREATE = "invoice.create";

    public static String invoiceCancel(long invoiceId) {
        return "invoice.cancel:" + invoiceId;
    }

    public static String invoiceDelete(long invoiceId) {
        return "invoice.delete:" + invoiceId;
    }

    public static final String STOCK_ADJUSTMENT_CREATE = "stock-adjustment.create";

    public static String stockAdjustmentConfirm(long adjustmentId) {
        return "stock-adjustment.confirm:" + adjustmentId;
    }

    public static String stockAdjustmentDelete(long adjustmentId) {
        return "stock-adjustment.delete:" + adjustmentId;
    }

    public static String stockAdjustmentReverse(long adjustmentId) {
        return "stock-adjustment.reverse:" + adjustmentId;
    }

    public static final String PENDING_ORDER_CREATE = "pending-order.create";

    public static String pendingOrderConfirm(long orderId) {
        return "pending-order.confirm:" + orderId;
    }

    public static String pendingOrderCancel(long orderId) {
        return "pending-order.cancel:" + orderId;
    }

    public static String paymentEventLink(long eventId) {
        return "payment-event.link:" + eventId;
    }

    public static String paymentEventIgnore(long eventId) {
        return "payment-event.ignore:" + eventId;
    }

    public static String paymentEventUnignore(long eventId) {
        return "payment-event.unignore:" + eventId;
    }

    public static String cassoWebhook(String reference) {
        return "casso.webhook:" + reference;
    }

    private IdempotencyScopes() {}
}
