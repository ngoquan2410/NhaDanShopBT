import type {
  GiftLine,
  ID,
  InvoiceSourceType,
  ListQuery,
  PagedResult,
  PendingOrderLine,
  PricingBreakdownSnapshot,
  PromotionSnapshot,
  ShippingAddress,
  ShippingQuoteSnapshot,
  VoucherSnapshot,
} from "@/services/types";
import type { Invoice } from "@/lib/mock-data";

export type InvoicePaymentType = "cash" | "transfer" | "momo" | "zalopay";

export interface CreateInvoiceInput {
  /** Optional override; auto-generated if missing */
  number?: string;
  date?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  paymentType: InvoicePaymentType;
  createdBy?: string;
  note?: string;

  /** Origin of this invoice — POS counter, online pending order, or manual. */
  sourceType?: InvoiceSourceType;
  /** When the invoice was created by confirming a pending order, link it. */
  pendingOrderId?: ID;

  lines: PendingOrderLine[];
  giftLines?: GiftLine[];

  /** VAT % applied at invoice time. Defaults to 0. Kept as a real field. */
  vatPercent?: number;

  promotionSnapshot?: PromotionSnapshot | null;
  voucherSnapshot?: VoucherSnapshot | null;
  shippingQuoteSnapshot?: ShippingQuoteSnapshot | null;
  pricingBreakdownSnapshot: PricingBreakdownSnapshot;
}

/** Backend-friendly list params. Flat fields are kept ergonomic for callers;
 *  a future BE may also accept a generic `filters` map (inherited from
 *  `ListQuery`). */
export interface InvoiceListParams extends ListQuery {
  status?: "active" | "cancelled";
  paymentType?: InvoicePaymentType;
  customerId?: string;
  /** ISO date range (inclusive on both ends). */
  dateRange?: { from?: string; to?: string };
}

export interface InvoiceService {
  /**
   * Create an invoice with full snapshot of lines, promotion and voucher.
   * Currently delegates persistence to the legacy `invoiceActions` store so
   * the admin Invoices page keeps working unchanged.
   */
  create(input: CreateInvoiceInput): Promise<Invoice>;

  /** List invoices with backend-friendly query params. */
  list(params?: InvoiceListParams): Promise<PagedResult<Invoice>>;

  /** Single invoice by id. Returns null when not found. */
  get(id: ID): Promise<Invoice | null>;

  /** Mark an invoice cancelled. Returns the updated row. BE will own
   *  side effects (stock restore, audit). */
  cancel(id: ID): Promise<Invoice>;

  /** Hard-delete an invoice. Adapter is responsible for enforcing rules
   *  (e.g. only same-day deletes); throws when not allowed. */
  remove(id: ID): Promise<void>;
}
