// POS invoice calculation — pure helper, backend-ready.
// Calculation order (explicit, consistent):
//   1. item subtotal (sum of unitPrice * qty across non-reward lines)
//   2. manual discount (amount or percent)
//   3. promotion discount / reward (uses applyPromotionToCart)
//   4. shipping fee
//   5. shipping promotion effect
//   6. VAT (applied on post-discount item base)
//   7. final total = max(0, base - discounts + ship - shipDiscount + vat)

import { applyPromotionToCart, type Cart, type Promotion, type PromotionApplication } from "./promotions";

export interface POSCartLine {
  id: string;
  productId: string;
  variantId?: string;
  productName: string;
  variantName: string;
  variantCode: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  /** if true, this line is a free reward/gift produced by a promotion */
  reward?: boolean;
  rewardSource?: string; // e.g. promotion name
}

export interface ManualDiscount {
  mode: "amount" | "percent";
  value: number;
}

export interface POSInvoiceInput {
  lines: POSCartLine[];
  manualDiscount: ManualDiscount;
  promotion?: Promotion | null;
  shippingFee: number;
  vatPercent: number;
  productCategory?: Record<string, string>;
}

export interface POSInvoiceTotals {
  subtotal: number;
  manualDiscount: number;
  promoDiscount: number;
  promoApplication: PromotionApplication | null;
  promoEligible: boolean;
  promoSkipReason?: string;
  shippingFee: number;
  shippingDiscount: number;
  shippingPayable: number;
  vatBase: number;
  vatAmount: number;
  total: number;
  freeItems: { productId: string; productName: string; quantity: number }[];
}

export function computeInvoice(input: POSInvoiceInput): POSInvoiceTotals {
  const { lines, manualDiscount, promotion, shippingFee, vatPercent, productCategory } = input;

  // 1. subtotal — exclude reward lines from billable subtotal
  const billable = lines.filter((l) => !l.reward);
  const subtotal = billable.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  // 2. manual discount
  const manualAmt =
    manualDiscount.mode === "percent"
      ? Math.floor(subtotal * Math.max(0, manualDiscount.value || 0) / 100)
      : Math.max(0, manualDiscount.value || 0);
  const manualDiscountAmt = Math.max(0, Math.min(subtotal, manualAmt));

  // 3. promotion
  let promoDiscount = 0;
  let promoShippingDiscount = 0;
  let promoApplication: PromotionApplication | null = null;
  let freeItems: POSInvoiceTotals["freeItems"] = [];

  if (promotion) {
    const cart: Cart = {
      lines: billable.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        productName: l.productName,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
      })),
      subtotal,
      shippingFee,
    };
    promoApplication = applyPromotionToCart(cart, promotion, { productCategory });
    if (promoApplication.applied) {
      promoDiscount = Math.min(promoApplication.discount, Math.max(0, subtotal - manualDiscountAmt));
      promoShippingDiscount = Math.min(promoApplication.shippingDiscount, shippingFee);
      freeItems = promoApplication.freeItems;
    }
  }

  // 4–5. shipping
  const shipFee = Math.max(0, shippingFee || 0);
  const shippingDiscount = Math.max(0, promoShippingDiscount);
  const shippingPayable = Math.max(0, shipFee - shippingDiscount);

  // 6. VAT — applied on post-discount item base (not on shipping)
  const vatBase = Math.max(0, subtotal - manualDiscountAmt - promoDiscount);
  const vatPct = Math.max(0, vatPercent || 0);
  const vatAmount = Math.floor((vatBase * vatPct) / 100);

  // 7. total
  const total = Math.max(0, vatBase + shippingPayable + vatAmount);

  return {
    subtotal,
    manualDiscount: manualDiscountAmt,
    promoDiscount,
    promoApplication,
    promoEligible: !!promoApplication?.applied,
    promoSkipReason: promoApplication?.skipReason,
    shippingFee: shipFee,
    shippingDiscount,
    shippingPayable,
    vatBase,
    vatAmount,
    total,
    freeItems,
  };
}
