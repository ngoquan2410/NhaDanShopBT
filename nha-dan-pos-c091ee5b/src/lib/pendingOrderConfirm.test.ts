import { describe, expect, it } from "vitest";
import type {
  PaymentLinkStatus,
  PaymentMethod,
  PendingOrder,
  PendingOrderStatus,
} from "@/services/types";
import {
  bankPaymentLinkBanner,
  canConfirmPendingOrder,
  isPendingLikeStatus,
  isTerminalStatus,
} from "./pendingOrderConfirm";

function makeOrder(overrides: Partial<PendingOrder> = {}): PendingOrder {
  const total = overrides.totalAmount ?? 100000;
  return {
    id: "1",
    code: "DH-20260512-001",
    createdAt: "2026-05-12T10:00:00",
    status: "pending_payment",
    paymentMethod: "bank_transfer",
    paymentReference: "DH-20260512-001",
    lines: [],
    giftLinesSnapshot: [],
    promotionSnapshot: null,
    voucherSnapshot: null,
    shippingQuoteSnapshot: null,
    pricingBreakdownSnapshot: {
      subtotal: total,
      manualDiscount: 0,
      promotionDiscount: 0,
      voucherDiscount: 0,
      loyaltyDiscount: 0,
      loyaltyRedeemedPoints: 0,
      shippingFee: 0,
      shippingDiscount: 0,
      vatBase: 0,
      vatPercent: 0,
      vatAmount: 0,
      total,
    },
    paymentLinkStatus: "NONE",
    linkedPaymentCount: 0,
    totalAmount: total,
    ...overrides,
  } as PendingOrder;
}

describe("isPendingLikeStatus / isTerminalStatus", () => {
  it.each<[PendingOrderStatus, boolean, boolean]>([
    ["pending_payment", true, false],
    ["waiting_confirm", true, false],
    ["paid_auto", true, false],
    ["confirmed", false, true],
    ["cancelled", false, true],
  ])("%s → pending-like=%s terminal=%s", (status, pendingLike, terminal) => {
    expect(isPendingLikeStatus(status)).toBe(pendingLike);
    expect(isTerminalStatus(status)).toBe(terminal);
  });
});

describe("canConfirmPendingOrder", () => {
  it("bank no link → blocked with hint", () => {
    const d = canConfirmPendingOrder(makeOrder());
    expect(d.canConfirm).toBe(false);
    expect(d.reason).toMatch(/chưa có giao dịch ngân hàng/i);
  });

  it("bank underpaid linked (count 1) → blocked, reason mentions missing amount", () => {
    const order = makeOrder({
      paymentLinkStatus: "UNDERPAID_LINKED",
      linkedPaymentCount: 1,
      linkedPaymentTotal: 80000,
      paymentDelta: -20000,
    });
    const d = canConfirmPendingOrder(order);
    expect(d.canConfirm).toBe(false);
    expect(d.reason).toMatch(/thiếu/i);
  });

  it("bank exact linked → allowed", () => {
    const order = makeOrder({
      paymentLinkStatus: "EXACT_PAID",
      linkedPaymentCount: 1,
      linkedPaymentTotal: 100000,
      paymentDelta: 0,
    });
    expect(canConfirmPendingOrder(order)).toEqual({ canConfirm: true });
  });

  it("bank overpaid linked → allowed (aggregate ≥ total)", () => {
    const order = makeOrder({
      paymentLinkStatus: "OVERPAID_LINKED",
      linkedPaymentCount: 1,
      linkedPaymentTotal: 110000,
      paymentDelta: 10000,
    });
    expect(canConfirmPendingOrder(order)).toEqual({ canConfirm: true });
  });

  it("bank multi-link aggregate exact → allowed", () => {
    const order = makeOrder({
      paymentLinkStatus: "EXACT_PAID",
      linkedPaymentCount: 2,
      linkedPaymentTotal: 100000,
      paymentDelta: 0,
    });
    expect(canConfirmPendingOrder(order).canConfirm).toBe(true);
  });

  it.each<PaymentMethod>(["cod", "cash_on_delivery", "momo", "zalopay"])(
    "non-bank %s without link → allowed",
    (method) => {
      const order = makeOrder({ paymentMethod: method, paymentLinkStatus: "NONE" });
      expect(canConfirmPendingOrder(order).canConfirm).toBe(true);
    },
  );

  it.each<PendingOrderStatus>(["confirmed", "cancelled"])(
    "terminal %s → blocked regardless of link",
    (status) => {
      const order = makeOrder({
        status,
        paymentLinkStatus: "EXACT_PAID",
        linkedPaymentCount: 1,
        linkedPaymentTotal: 100000,
      });
      expect(canConfirmPendingOrder(order).canConfirm).toBe(false);
    },
  );

  it("paid_auto status with exact link → allowed", () => {
    const order = makeOrder({
      status: "paid_auto",
      paymentLinkStatus: "EXACT_PAID",
      linkedPaymentCount: 1,
      linkedPaymentTotal: 100000,
    });
    expect(canConfirmPendingOrder(order).canConfirm).toBe(true);
  });
});

describe("bankPaymentLinkBanner", () => {
  it("returns null for non-bank methods", () => {
    expect(bankPaymentLinkBanner(makeOrder({ paymentMethod: "cod" }))).toBeNull();
    expect(bankPaymentLinkBanner(makeOrder({ paymentMethod: "momo" }))).toBeNull();
    expect(bankPaymentLinkBanner(makeOrder({ paymentMethod: "zalopay" }))).toBeNull();
  });

  it("returns NONE banner when bank without link", () => {
    expect(bankPaymentLinkBanner(makeOrder())).toMatch(
      /Chưa có giao dịch ngân hàng đã gắn/i,
    );
  });

  it("returns EXACT_PAID banner (single)", () => {
    const order = makeOrder({
      paymentLinkStatus: "EXACT_PAID",
      linkedPaymentCount: 1,
      linkedPaymentTotal: 100000,
      paymentDelta: 0,
    });
    expect(bankPaymentLinkBanner(order)).toMatch(/khớp đúng/i);
  });

  it.each<[PaymentLinkStatus, RegExp]>([
    ["UNDERPAID_LINKED", /thiếu/i],
    ["OVERPAID_LINKED", /dư/i],
  ])("returns %s banner (single)", (status, expected) => {
    const linkedTotal = status === "UNDERPAID_LINKED" ? 80000 : 110000;
    const order = makeOrder({
      paymentLinkStatus: status,
      linkedPaymentCount: 1,
      linkedPaymentTotal: linkedTotal,
      paymentDelta: linkedTotal - 100000,
    });
    expect(bankPaymentLinkBanner(order)).toMatch(expected);
  });

  it("multi-link banner includes count and aggregate total prefix", () => {
    const order = makeOrder({
      paymentLinkStatus: "EXACT_PAID",
      linkedPaymentCount: 3,
      linkedPaymentTotal: 100000,
      paymentDelta: 0,
    });
    const banner = bankPaymentLinkBanner(order);
    expect(banner).toMatch(/Đã gắn 3 giao dịch/);
    expect(banner).toMatch(/Tổng đã gắn/);
  });
});
