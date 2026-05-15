import type { Invoice, InvoiceBreakdown, InvoiceLine } from "@/lib/mock-data";

/** Raw `/api/invoices` row as returned by Spring/Jackson JSON. */
export type BackendSalesInvoiceJson = Record<string, unknown>;

export function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function nullableNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function mapPaymentToInvoiceType(pm: unknown): Invoice["paymentType"] {
  const p = String(pm ?? "").toLowerCase();
  if (p === "bank_transfer") return "transfer";
  if (p === "momo") return "momo";
  if (p === "zalopay") return "zalopay";
  if (p === "cash_on_delivery" || p === "cod" || p === "cash") return "cash";
  return "cash";
}

function invoiceStatus(raw: BackendSalesInvoiceJson): Invoice["status"] {
  const s = String(raw.status ?? "COMPLETED").toUpperCase();
  return s === "CANCELLED" ? "cancelled" : "active";
}

function mapSource(raw: BackendSalesInvoiceJson): Invoice["sourceType"] | undefined {
  const t = raw.sourceType;
  if (t === "pos" || t === "online_pending" || t === "manual") return t;
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function breakdownFromSnapshots(raw: BackendSalesInvoiceJson): InvoiceBreakdown | undefined {
  const p = asRecord(raw.pricingBreakdownSnapshot);
  const promoSnap = asRecord(raw.promotionSnapshot);
  const vSnap = asRecord(raw.voucherSnapshot);
  const shipSnap = asRecord(raw.shippingQuoteSnapshot);
  if (!p && !promoSnap && !vSnap) return undefined;

  const subtotal = num(p?.subtotal);
  const manualDiscount = num(p?.manualDiscount);
  const promoDiscount = num(p?.promotionDiscount);
  const voucherDiscount = num(p?.voucherDiscount);
  const shippingFee = num(p?.shippingFee);
  const shippingDiscount = num(p?.shippingDiscount);
  const vatPercent = num(p?.vatPercent);
  const vatBase = num(p?.vatBase);
  const vatAmount = num(p?.vatAmount);
  const loyaltyDiscount = num(p?.loyaltyDiscount, NaN);
  const loyaltyRedeemedPoints = num(p?.loyaltyRedeemedPoints, NaN);
  const total = num(p?.total, num(raw.finalAmount));

  const promoName =
    (typeof raw.promotionName === "string" && raw.promotionName.trim()
      ? raw.promotionName
      : typeof promoSnap?.name === "string"
        ? (promoSnap.name as string)
        : typeof promoSnap?.promotionName === "string"
          ? (promoSnap.promotionName as string)
          : undefined) || undefined;

  const voucherCode = typeof vSnap?.code === "string" ? vSnap.code : undefined;

  const giftLinesRaw = raw.giftLinesSnapshot;
  const promoAffectedRaw = Array.isArray(promoSnap?.affectedLines) ? promoSnap.affectedLines : [];
  const promoGiftRaw = Array.isArray(promoSnap?.giftLines) ? promoSnap.giftLines : [];
  const discountedLines = promoAffectedRaw
    .map((line) => asRecord(line))
    .filter((line): line is Record<string, unknown> => line !== null)
    .map((line) => ({
      productName: typeof line.productName === "string" ? line.productName : "",
      variantName: typeof line.variantName === "string" ? line.variantName : undefined,
      discountedAmount: num(line.discountedAmount),
    }))
    .filter((line) => line.discountedAmount > 0);
  const promoGiftLines = promoGiftRaw
    .map((line) => asRecord(line))
    .filter((line): line is Record<string, unknown> => line !== null)
    .map((line) => ({
      productName: typeof line.productName === "string" ? line.productName : "Quà tặng",
      variantName: typeof line.variantName === "string" ? line.variantName : undefined,
      quantity: num(line.qty ?? line.quantity, 0),
    }))
    .filter((line) => line.quantity > 0);
  const freeItems =
    Array.isArray(giftLinesRaw) && giftLinesRaw.length > 0
      ? giftLinesRaw.map((g: unknown) => {
          const o = asRecord(g) ?? {};
          const pn = typeof o.productName === "string" ? o.productName : "";
          const vn = typeof o.variantName === "string" ? o.variantName : "";
          const name = vn ? `${pn} - ${vn}`.trim() : pn || "Quà tặng";
          return { productName: name, quantity: num(o.qty ?? o.quantity, 1) };
        })
      : undefined;

  return {
    subtotal,
    manualDiscount,
    promoDiscount,
    promoName,
    voucherDiscount,
    voucherName: voucherCode,
    shippingFee,
    shippingDiscount,
    shippingPayable: Math.max(0, shippingFee - shippingDiscount),
    shippingZoneCode: typeof shipSnap?.zoneCode === "string" ? (shipSnap.zoneCode as string) : undefined,
    vatPercent,
    vatBase,
    vatAmount,
    loyaltyDiscount: Number.isFinite(loyaltyDiscount) ? loyaltyDiscount : undefined,
    loyaltyRedeemedPoints: Number.isFinite(loyaltyRedeemedPoints) ? loyaltyRedeemedPoints : undefined,
    total,
    freeItems,
    discountedLines,
    giftLines: promoGiftLines,
  };
}

function linesFromItems(raw: BackendSalesInvoiceJson): InvoiceLine[] | undefined {
  const items = raw.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const out: InvoiceLine[] = [];
  for (const row of items) {
    const o = asRecord(row);
    if (!o) continue;
    const qty = Math.max(0, Math.round(num(o.quantity)));
    const productName = typeof o.productName === "string" ? o.productName : "";
    const variantName = typeof o.variantName === "string" ? o.variantName : undefined;
    const name = variantName ? `${productName} - ${variantName}` : productName || "—";
    const variantCode = typeof o.variantCode === "string" ? o.variantCode : "";
    const productCode = typeof o.productCode === "string" ? o.productCode : "";
    const code = [productCode, variantCode].filter(Boolean).join("-") || "";
    const reward = Boolean(o.rewardLine);
    const unitPrice = num(o.unitPrice);
    out.push({
      name,
      code,
      qty,
      price: reward ? 0 : unitPrice,
      reward: reward ? true : undefined,
      rewardSource: typeof o.promotionName === "string" ? o.promotionName : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Map `SalesInvoiceResponse` JSON → legacy admin `Invoice` view model consumed by AdminInvoices + drawer.
 */
export function mapSalesInvoiceApiJsonToInvoice(raw: BackendSalesInvoiceJson): Invoice {
  const bd = breakdownFromSnapshots(raw);
  const lines = linesFromItems(raw);
  const invoiceDateIso =
    typeof raw.invoiceDate === "string"
      ? raw.invoiceDate
      : typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString();

  const itemGrossProfit = nullableNum(raw.itemGrossProfit);
  const totalProfit = nullableNum(raw.totalProfit);

  return {
    id: String(raw.id ?? ""),
    number: typeof raw.invoiceNo === "string" ? raw.invoiceNo : String(raw.id ?? ""),
    date: invoiceDateIso,
    customerId: raw.customerId != null ? String(raw.customerId) : "",
    customerName: typeof raw.customerName === "string" && raw.customerName.trim() ? raw.customerName : "Khách lẻ",
    total: Math.round(num(raw.finalAmount)),
    paymentType: mapPaymentToInvoiceType(raw.paymentMethod),
    status: invoiceStatus(raw),
    createdBy:
      typeof raw.createdBy === "string" && raw.createdBy.trim()
        ? raw.createdBy.trim()
        : "—",
    itemCount:
      typeof raw.items === "object" &&
      raw.items !== null &&
      Array.isArray(raw.items) &&
      raw.items.length > 0
        ? raw.items.reduce(
            (s: number, it: unknown) => s + Math.max(0, Math.round(num((asRecord(it) ?? {}).quantity))),
            0,
          )
        : lines?.reduce((s, l) => s + l.qty, 0) ?? 0,
    breakdown: bd,
    lines,
    note: typeof raw.note === "string" ? raw.note : undefined,
    sourceType: mapSource(raw),
    pendingOrderId: raw.pendingOrderId != null ? String(raw.pendingOrderId) : undefined,
    pendingOrderCode:
      typeof raw.pendingOrderCode === "string" && raw.pendingOrderCode.trim()
        ? raw.pendingOrderCode.trim()
        : undefined,
    itemGrossProfit,
    totalProfit,
    allowPhysicalDelete: false,
  };
}
