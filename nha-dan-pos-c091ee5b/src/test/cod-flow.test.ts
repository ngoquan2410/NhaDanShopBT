// Click-to-run end-to-end walkthrough for the COD (cash on delivery) path.
//
// Run:  bunx vitest run src/test/cod-flow.test.ts
//
// What it verifies (uses the real service-layer adapters, not mocks):
//  1. A storefront cart can attach a promotion + voucher snapshot.
//  2. pendingOrders.create() persists those snapshots verbatim.
//  3. When the admin "confirms" the COD pending order, an Invoice is created
//     via invoiceService.create() with the same promotion / voucher / gift
//     breakdown the customer saw.
//  4. The pending order flips to status "confirmed" and remembers the new
//     invoice number — exactly what /admin/pending-orders does in production.
//
// This is the same shape as the manual browser walkthrough described in batch 3
// but runs in <1s without driving the UI, so it is safe to keep in CI.

import { describe, it, expect, beforeEach } from "vitest";
import {
  pendingOrders as pendingOrdersService,
  invoices as invoiceService,
} from "@/services";
import type {
  CreatePendingOrderInput,
  GiftLine,
  PendingOrderLine,
  PricingBreakdownSnapshot,
  PromotionSnapshot,
  ShippingAddress,
  ShippingQuoteSnapshot,
  VoucherSnapshot,
} from "@/services/types";
import { getStoreState } from "@/lib/store";

const ADDRESS: ShippingAddress = {
  receiverName: "Nguyễn Văn An",
  phone: "0901234567",
  provinceCode: "79",
  provinceName: "TP. Hồ Chí Minh",
  districtCode: "760",
  districtName: "Quận 1",
  wardCode: "26734",
  wardName: "Phường Bến Nghé",
  street: "123 Lê Lợi",
};

const LINES: PendingOrderLine[] = [
  {
    id: "l1",
    productId: "1",
    variantId: "v1",
    productName: "Mì Hảo Hảo",
    variantName: "Tôm chua cay",
    qty: 10,
    unitPrice: 5000,
    lineSubtotal: 50000,
  },
  {
    id: "l2",
    productId: "2",
    variantId: "v4",
    productName: "Coca-Cola",
    variantName: "Lon 330ml",
    qty: 6,
    unitPrice: 10000,
    lineSubtotal: 60000,
  },
];

const GIFTS: GiftLine[] = [
  {
    productId: "7",
    variantId: "v12",
    productName: "Trà Lipton",
    variantName: "Hộp 25 gói",
    qty: 1,
    unitPrice: 0,
    lineTotal: 0,
    promotionId: "promo-bxgy",
    promotionName: "Mua mì tặng trà",
  },
];

const PROMO: PromotionSnapshot = {
  promotionId: "promo-bxgy",
  name: "Mua mì tặng trà",
  type: "buy_x_get_y",
  ruleSummary: "Mua 10 gói mì tặng 1 hộp trà",
  discountAmount: 0,
  shippingDiscountAmount: 0,
  affectedLines: [
    { lineId: "l1", productId: "1", variantId: "v1", productName: "Mì Hảo Hảo", variantName: "Tôm chua cay", rewardQty: 1 },
  ],
  giftLines: GIFTS,
};

const VOUCHER: VoucherSnapshot = {
  code: "NHADAN10",
  ruleSummary: "Giảm 10% đơn hàng (tối đa 50.000đ)",
  discountAmount: 11000,
};

const SHIPPING: ShippingQuoteSnapshot = {
  source: "zone_fallback",
  zoneCode: "Z1",
  fee: 18000,
  etaDays: { min: 1, max: 2 },
};

const BREAKDOWN: PricingBreakdownSnapshot = {
  subtotal: 110000,
  manualDiscount: 0,
  promotionDiscount: 0,
  voucherDiscount: 11000,
  shippingFee: 18000,
  shippingDiscount: 0,
  vatBase: 99000,
  vatPercent: 0,
  vatAmount: 0,
  vat: 0,
  total: 117000,
};

function buildInput(overrides: Partial<CreatePendingOrderInput> = {}): CreatePendingOrderInput {
  return {
    customerId: "cust-test",
    customerName: "Nguyễn Văn An",
    customerPhone: "0901234567",
    shippingAddress: ADDRESS,
    paymentMethod: "cash",
    paymentReference: "TEST-COD-001",
    lines: LINES,
    promotionSnapshot: PROMO,
    voucherSnapshot: VOUCHER,
    shippingQuoteSnapshot: SHIPPING,
    pricingBreakdownSnapshot: BREAKDOWN,
    note: "Giao giờ hành chính",
    ...overrides,
  };
}

describe("COD pending-order → admin confirm → invoice", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("creates a pending order that snapshots promotion + voucher + gifts", async () => {
    const order = await pendingOrdersService.create(buildInput());

    expect(order.id).toBeTruthy();
    expect(order.status).toBe("pending_payment");
    expect(order.paymentMethod).toBe("cash");
    expect(order.promotionSnapshot?.name).toBe("Mua mì tặng trà");
    expect(order.voucherSnapshot?.code).toBe("NHADAN10");
    expect(order.giftLinesSnapshot).toHaveLength(1);
    expect(order.giftLinesSnapshot[0].productName).toBe("Trà Lipton");
    expect(order.pricingBreakdownSnapshot.total).toBe(117000);
    expect(order.shippingQuoteSnapshot?.zoneCode).toBe("Z1");
  });

  it("admin confirm flow produces an Invoice with matching breakdown", async () => {
    const order = await pendingOrdersService.create(buildInput());

    const inv = await invoiceService.create({
      customerId: order.customerId,
      customerName: order.customerName ?? "Khách lẻ",
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      paymentType: "cash",
      createdBy: "admin",
      note: order.note,
      lines: order.lines,
      giftLines: order.giftLinesSnapshot,
      promotionSnapshot: order.promotionSnapshot,
      voucherSnapshot: order.voucherSnapshot,
      shippingQuoteSnapshot: order.shippingQuoteSnapshot,
      pricingBreakdownSnapshot: order.pricingBreakdownSnapshot,
    });
    const updated = await pendingOrdersService.update(order.id, {
      status: "confirmed",
      note: `${order.note} · Hóa đơn: ${inv.number}`,
    });

    expect(inv.number).toMatch(/^HD-/);
    expect(inv.paymentType).toBe("cash");
    expect(inv.total).toBe(BREAKDOWN.total);
    expect(inv.breakdown?.subtotal).toBe(BREAKDOWN.subtotal);
    // Promo and voucher are tracked SEPARATELY now (no merging).
    expect(inv.breakdown?.promoDiscount).toBe(BREAKDOWN.promotionDiscount);
    expect(inv.breakdown?.voucherDiscount).toBe(BREAKDOWN.voucherDiscount);
    expect(inv.breakdown?.promoName).toContain("Mua mì tặng trà");
    expect(inv.breakdown?.voucherName).toBe("NHADAN10");
    expect(inv.sourceType).toBe("online_pending");
    expect(inv.breakdown?.freeItems).toEqual([
      { productName: "Trà Lipton - Hộp 25 gói", quantity: 1 },
    ]);
    // The in-memory store should now contain this invoice (admin /invoices reads from here).
    const stored = getStoreState().invoices.find((i) => i.id === inv.id);
    expect(stored).toBeTruthy();
    expect(stored?.number).toBe(inv.number);
    expect(inv.lines?.some((l) => l.reward)).toBe(true);

    expect(updated.status).toBe("confirmed");
    expect(updated.note).toContain(inv.number);
  });

  it("admin can confirm a bank-transfer order the same way (paymentType = transfer)", async () => {
    const order = await pendingOrdersService.create(
      buildInput({ paymentMethod: "bank_transfer", paymentReference: "TEST-BT-001" }),
    );

    const inv = await invoiceService.create({
      customerId: order.customerId,
      customerName: order.customerName ?? "Khách lẻ",
      paymentType: "transfer",
      createdBy: "admin",
      lines: order.lines,
      giftLines: order.giftLinesSnapshot,
      promotionSnapshot: order.promotionSnapshot,
      voucherSnapshot: order.voucherSnapshot,
      shippingQuoteSnapshot: order.shippingQuoteSnapshot,
      pricingBreakdownSnapshot: order.pricingBreakdownSnapshot,
    });
    const updated = await pendingOrdersService.update(order.id, { status: "confirmed" });

    expect(inv.paymentType).toBe("transfer");
    expect(updated.status).toBe("confirmed");
  });
});
