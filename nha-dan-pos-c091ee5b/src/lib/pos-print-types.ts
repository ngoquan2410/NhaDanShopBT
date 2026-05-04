/**
 * POS thermal / store snapshot shapes used after backend quote or for draft preview.
 * Kept separate from Lovable seed module types so production routes stay backend-only.
 */

export interface InvoiceLine {
  name: string;
  code: string;
  qty: number;
  price: number;
  reward?: boolean;
  rewardSource?: string;
}

export interface InvoiceBreakdown {
  subtotal: number;
  manualDiscount: number;
  promoDiscount: number;
  promoName?: string;
  voucherDiscount?: number;
  voucherName?: string;
  shippingFee: number;
  shippingDiscount: number;
  shippingPayable: number;
  shippingZoneCode?: string;
  shippingZoneLabel?: string;
  shippingEtaMin?: number;
  shippingEtaMax?: number;
  vatPercent: number;
  vatBase: number;
  vatAmount: number;
  total: number;
  freeItems?: { productName: string; quantity: number }[];
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  customerId: string;
  customerName: string;
  total: number;
  paymentType: "cash" | "transfer" | "momo" | "zalopay";
  status: "active" | "cancelled";
  createdBy: string;
  itemCount: number;
  breakdown?: InvoiceBreakdown;
  lines?: InvoiceLine[];
  note?: string;
  sourceType?: "pos" | "online_pending" | "manual";
  pendingOrderId?: string;
}
