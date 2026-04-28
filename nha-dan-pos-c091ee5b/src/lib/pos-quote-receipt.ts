/**
 * Map backend sales quote (Slice 6C) into POS local invoice / 58mm print lines.
 */

import type { Invoice, InvoiceBreakdown, InvoiceLine } from "@/lib/mock-data";
import type { POSCartLine } from "@/lib/pos-invoice";
import type { SalesQuoteApiResult, SalesQuoteLineResponse } from "@/services/sales/salesQuoteApi";

function parseOptLong(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function findCartLineForQuoteLine(line: SalesQuoteLineResponse, cart: POSCartLine[]): POSCartLine | undefined {
  return cart.find((c) => {
    if (c.reward) return false;
    const pid = parseOptLong(c.productId);
    const vid = parseOptLong(c.variantId);
    if (pid !== line.productId || vid !== line.variantId) return false;
    if (line.batchId == null) return !c.batchId;
    const bid = parseOptLong(c.batchId);
    return bid === line.batchId;
  });
}

function quoteLineToInvoiceLine(
  line: SalesQuoteLineResponse,
  cart: POSCartLine[],
  opts: { rewardSource?: string },
): InvoiceLine {
  const cartMatch = findCartLineForQuoteLine(line, cart);
  let code = cartMatch?.variantCode || line.variantName || "—";
  if (line.batchId != null) {
    const batchLabel = cartMatch?.batchCode ?? String(line.batchId);
    code = `${code} · Lô:${batchLabel}`;
  }
  const name = `${line.productName} - ${line.variantName}${line.rewardLine ? " (Quà tặng)" : ""}`;
  return {
    name,
    code,
    qty: line.quantity,
    price: line.unitPrice,
    reward: line.rewardLine,
    rewardSource: line.rewardLine ? opts.rewardSource : undefined,
  };
}

/**
 * Printable / persisted invoice lines: billable quote lines then reward lines (backend order).
 */
export function buildInvoiceLinesFromQuote(
  quote: SalesQuoteApiResult,
  cart: POSCartLine[],
  rewardSourceLabel?: string | null,
): InvoiceLine[] {
  const src = rewardSourceLabel?.trim() || "Khuyến mãi";
  const billable = quote.lines.map((l) => quoteLineToInvoiceLine(l, cart, {}));
  const rewards = quote.rewardLines.map((l) => quoteLineToInvoiceLine(l, cart, { rewardSource: src }));
  return [...billable, ...rewards];
}

export function freeItemsFromQuoteRewards(quote: SalesQuoteApiResult): { productName: string; quantity: number }[] {
  return quote.rewardLines.map((r) => ({
    productName: `${r.productName} - ${r.variantName}`,
    quantity: r.quantity,
  }));
}

/** Total units (billable + reward) for receipt header counts. */
export function quoteUnitsItemCount(quote: SalesQuoteApiResult): number {
  return [...quote.lines, ...quote.rewardLines].reduce((s, l) => s + l.quantity, 0);
}

export function buildPosInvoiceBreakdownFromQuote(
  quote: SalesQuoteApiResult,
  ctx: {
    paid: number;
    selectedPromotionName?: string | null;
    selectedShippingZone?: {
      zoneCode?: string;
      label?: string;
      etaDays?: { min: number; max: number };
    } | null;
  },
): InvoiceBreakdown {
  const pb = quote.pricingBreakdownSnapshot;
  return {
    subtotal: pb.subtotal,
    manualDiscount: pb.manualDiscount,
    promoDiscount: pb.promotionDiscount,
    promoName: ctx.selectedPromotionName ?? undefined,
    voucherDiscount: pb.voucherDiscount,
    voucherName: quote.voucherSnapshot?.code ?? undefined,
    shippingFee: pb.shippingFee,
    shippingDiscount: pb.shippingDiscount,
    shippingPayable: pb.shippingFee - pb.shippingDiscount,
    shippingZoneCode: ctx.selectedShippingZone?.zoneCode,
    shippingZoneLabel: ctx.selectedShippingZone?.label,
    shippingEtaMin: ctx.selectedShippingZone?.etaDays?.min,
    shippingEtaMax: ctx.selectedShippingZone?.etaDays?.max,
    vatPercent: pb.vatPercent,
    vatBase: pb.vatBase,
    vatAmount: pb.vatAmount,
    total: ctx.paid,
    freeItems: freeItemsFromQuoteRewards(quote),
  };
}

/** POS 58mm print + `invoiceActions.create` payload from a committed backend quote. */
export type BackendPosPrintSnapshot = {
  invoiceForStore: Omit<Invoice, "id">;
  lines: InvoiceLine[];
};

export function buildBackendPosPrintSnapshot(input: {
  quote: SalesQuoteApiResult;
  cartLines: POSCartLine[];
  invoiceNo: string;
  paid: number;
  isoDate: string;
  customerId: string;
  customerName: string;
  paymentType: Invoice["paymentType"];
  promotionName?: string | null;
  selectedShippingZone?: {
    zoneCode?: string;
    label?: string;
    etaDays?: { min: number; max: number };
  } | null;
  note?: string;
}): BackendPosPrintSnapshot {
  const lines = buildInvoiceLinesFromQuote(input.quote, input.cartLines, input.promotionName);
  const breakdown = buildPosInvoiceBreakdownFromQuote(input.quote, {
    paid: input.paid,
    selectedPromotionName: input.promotionName,
    selectedShippingZone: input.selectedShippingZone,
  });
  const invoiceForStore: Omit<Invoice, "id"> = {
    number: input.invoiceNo,
    date: input.isoDate,
    customerId: input.customerId,
    customerName: input.customerName,
    total: input.paid,
    paymentType: input.paymentType,
    status: "active",
    createdBy: "admin",
    itemCount: quoteUnitsItemCount(input.quote),
    breakdown,
    lines,
    note: input.note,
    sourceType: "pos",
  };
  return { invoiceForStore, lines };
}
