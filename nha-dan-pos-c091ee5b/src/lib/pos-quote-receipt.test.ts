import { describe, expect, it } from "vitest";
import type { POSCartLine } from "@/lib/pos-invoice";
import type { SalesQuoteApiResult } from "@/services/sales/salesQuoteApi";
import {
  buildBackendPosPrintSnapshot,
  buildInvoiceLinesFromQuote,
  buildPosInvoiceBreakdownFromQuote,
  freeItemsFromQuoteRewards,
  quoteUnitsItemCount,
} from "./pos-quote-receipt";

function lineBase(
  overrides: Partial<SalesQuoteApiResult["lines"][0]> & Pick<SalesQuoteApiResult["lines"][0], "productId" | "variantId" | "productName" | "variantName">,
): SalesQuoteApiResult["lines"][0] {
  return {
    quantity: 1,
    unitPrice: 0,
    lineSubtotal: 0,
    discountPercent: 0,
    batchId: null,
    rewardLine: false,
    originalUnitPrice: 0,
    ...overrides,
  };
}

function sampleQuote(): SalesQuoteApiResult {
  return {
    quoteId: "q1",
    expiresAt: "2026-01-01T00:00:00",
    lines: [
      lineBase({
        productId: 10,
        variantId: 20,
        productName: "P1",
        variantName: "V1",
        quantity: 2,
        unitPrice: 5000,
        lineSubtotal: 10000,
        originalUnitPrice: 5000,
      }),
    ],
    rewardLines: [
      lineBase({
        productId: 11,
        variantId: 21,
        productName: "Gift",
        variantName: "GV",
        quantity: 1,
        unitPrice: 0,
        lineSubtotal: 0,
        rewardLine: true,
        originalUnitPrice: 1000,
      }),
    ],
    shippingQuoteSnapshot: null,
    voucherSnapshot: null,
    pricingBreakdownSnapshot: {
      subtotal: 10000,
      promotionDiscount: 0,
      voucherDiscount: 500,
      shippingFee: 30000,
      shippingDiscount: 10000,
      vatBase: 9000,
      vatPercent: 10,
      vatAmount: 900,
      manualDiscount: 0,
      total: 9900,
    },
  };
}

describe("pos-quote-receipt", () => {
  it("includes rewardLines in printable lines, not local totals.freeItems", () => {
    const cart: POSCartLine[] = [
      {
        id: "l1",
        productId: "10",
        variantId: "20",
        productName: "P1",
        variantCode: "VC1",
        variantName: "V1",
        unitPrice: 5000,
        quantity: 2,
        stock: 99,
      },
      {
        id: "l2",
        productId: "11",
        variantId: "21",
        productName: "Gift",
        variantCode: "GV",
        variantName: "GV",
        unitPrice: 0,
        quantity: 1,
        stock: 99,
        reward: true,
      },
    ];
    const quote = sampleQuote();
    const lines = buildInvoiceLinesFromQuote(quote, cart, "Tết sale");
    const rewardPrint = lines.find((l) => l.reward);
    expect(lines.length).toBe(2);
    expect(rewardPrint).toBeDefined();
    expect(rewardPrint?.rewardSource).toBe("Tết sale");
    const free = freeItemsFromQuoteRewards(quote);
    expect(free).toEqual([{ productName: "Gift - GV", quantity: 1 }]);
  });

  it("itemCount sums billable + reward quantities", () => {
    expect(quoteUnitsItemCount(sampleQuote())).toBe(3);
  });

  it("preserves batch label from cart when quote line has batchId", () => {
    const q = sampleQuote();
    q.lines[0].batchId = 99;
    const cart: POSCartLine[] = [
      {
        id: "b1",
        productId: "10",
        variantId: "20",
        batchId: "99",
        batchCode: "B-APR",
        productName: "P1",
        variantCode: "VC1",
        variantName: "V1",
        unitPrice: 5000,
        quantity: 2,
        stock: 99,
      },
    ];
    const lines = buildInvoiceLinesFromQuote(q, cart);
    expect(lines[0].code).toContain("Lô:B-APR");
  });

  it("breakdown uses pricingBreakdownSnapshot and rewardLines for freeItems (batch and non-batch paths share this)", () => {
    const quote = sampleQuote();
    const bd = buildPosInvoiceBreakdownFromQuote(quote, {
      paid: 12_000,
      selectedPromotionName: "Promo X",
      selectedShippingZone: { zoneCode: "Z1", label: "Nội thành", etaDays: { min: 1, max: 2 } },
    });
    expect(bd.subtotal).toBe(10_000);
    expect(bd.voucherDiscount).toBe(500);
    expect(bd.voucherName).toBeUndefined();
    expect(bd.promoName).toBe("Promo X");
    expect(bd.shippingPayable).toBe(20_000);
    expect(bd.freeItems).toEqual([{ productName: "Gift - GV", quantity: 1 }]);
    expect(bd.total).toBe(12_000);
  });

  it("buildBackendPosPrintSnapshot aligns invoice header, itemCount, lines and breakdown with quote", () => {
    const quote = sampleQuote();
    const cart: POSCartLine[] = [
      {
        id: "c1",
        productId: "10",
        variantId: "20",
        productName: "P1",
        variantCode: "VC1",
        variantName: "V1",
        unitPrice: 5000,
        quantity: 2,
        stock: 99,
      },
    ];
    const snap = buildBackendPosPrintSnapshot({
      quote,
      cartLines: cart,
      invoiceNo: "HD-BE-1",
      paid: 12_000,
      isoDate: "2026-04-28T10:00:00.000Z",
      customerId: "c1",
      customerName: "A",
      paymentType: "cash",
      promotionName: "Sale",
      selectedShippingZone: null,
      note: "ship fast",
    });
    expect(snap.invoiceForStore.number).toBe("HD-BE-1");
    expect(snap.invoiceForStore.total).toBe(12_000);
    expect(snap.invoiceForStore.itemCount).toBe(3);
    expect(snap.invoiceForStore.breakdown?.freeItems).toEqual([{ productName: "Gift - GV", quantity: 1 }]);
    expect(snap.lines.some((l) => l.reward)).toBe(true);
  });
});
