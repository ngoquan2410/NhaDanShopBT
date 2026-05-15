import type { PaymentLinkStatus, PendingOrder, PendingOrderStatus } from "@/services/types";
import { formatVND } from "@/lib/format";

const CONFIRMABLE_STATUSES: ReadonlySet<PendingOrderStatus> = new Set([
  "pending_payment",
  "waiting_confirm",
  "paid_auto",
]);

const TERMINAL_STATUSES: ReadonlySet<PendingOrderStatus> = new Set([
  "confirmed",
  "cancelled",
]);

export interface ConfirmDecision {
  canConfirm: boolean;
  reason?: string;
}

export function isPendingLikeStatus(status: PendingOrderStatus): boolean {
  return CONFIRMABLE_STATUSES.has(status);
}

export function isTerminalStatus(status: PendingOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Decision oracle for the admin "Xác nhận" button. Matches the backend
 * {@code PendingOrderService.confirmOrder} guard exactly:
 *   - Status must be one of {@code pending_payment | waiting_confirm | paid_auto}.
 *   - For {@code paymentMethod === "bank_transfer"}, aggregate linked payments must satisfy
 *     {@code linkedPaymentCount >= 1 && linkedPaymentTotal >= totalAmount}.
 *   - Non-bank methods (cod / cash_on_delivery / momo / zalopay) are never blocked by link data.
 */
export function canConfirmPendingOrder(order: PendingOrder): ConfirmDecision {
  if (!order) {
    return { canConfirm: false, reason: "Không có đơn để xác nhận" };
  }
  if (isTerminalStatus(order.status)) {
    return { canConfirm: false, reason: "Đơn đã ở trạng thái cuối" };
  }
  if (!isPendingLikeStatus(order.status)) {
    return { canConfirm: false, reason: "Đơn không ở trạng thái có thể xác nhận" };
  }
  if (order.paymentMethod !== "bank_transfer") {
    return { canConfirm: true };
  }
  const count = Number(order.linkedPaymentCount ?? 0);
  if (count < 1) {
    return {
      canConfirm: false,
      reason: "Chưa có giao dịch ngân hàng đã gắn — chưa thể xác nhận",
    };
  }
  const total =
    typeof order.totalAmount === "number" && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : Number(order.pricingBreakdownSnapshot?.total ?? 0);
  const linkedTotal = Number(order.linkedPaymentTotal ?? 0);
  if (linkedTotal < total) {
    const missing = Math.abs(Math.round(total - linkedTotal));
    return {
      canConfirm: false,
      reason: `Đã gắn giao dịch — thiếu ${formatVND(missing)} cần đối soát`,
    };
  }
  return { canConfirm: true };
}

/**
 * Banner copy for bank pending — mirrors the spec strings in the implementation plan so Selenium can assert
 * exact text without coupling to inline JSX.
 */
export function bankPaymentLinkBanner(order: PendingOrder): string | null {
  if (order.paymentMethod !== "bank_transfer") {
    return null;
  }
  const status = (order.paymentLinkStatus ?? "NONE") as PaymentLinkStatus;
  const count = Number(order.linkedPaymentCount ?? 0);
  const linkedTotal = Number(order.linkedPaymentTotal ?? 0);
  const total =
    typeof order.totalAmount === "number" && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : Number(order.pricingBreakdownSnapshot?.total ?? 0);
  const delta =
    typeof order.paymentDelta === "number" && Number.isFinite(order.paymentDelta)
      ? order.paymentDelta
      : linkedTotal - total;
  const abs = Math.abs(Math.round(delta));

  if (status === "NONE" || count === 0) {
    return "Chưa có giao dịch ngân hàng đã gắn — chưa thể xác nhận";
  }

  const singleLine = (() => {
    if (status === "EXACT_PAID") return "Đã gắn giao dịch — khớp đúng số tiền";
    if (status === "UNDERPAID_LINKED")
      return `Đã gắn giao dịch — thiếu ${formatVND(abs)} cần đối soát`;
    if (status === "OVERPAID_LINKED")
      return `Đã gắn giao dịch — dư ${formatVND(abs)} cần hoàn/đối soát`;
    return null;
  })();

  if (singleLine == null) return null;
  if (count > 1) {
    return `Đã gắn ${count} giao dịch · Tổng đã gắn ${formatVND(Math.round(linkedTotal))} · ${singleLine.replace(/^Đã gắn giao dịch — /, "")}`;
  }
  return singleLine;
}
