import type {
  CreatePendingOrderInput,
  PaymentMethod,
  PagedResult,
  PendingOrder,
  PendingOrderListParams,
  PendingOrderStatus,
} from "@/services/types";

export type PendingOrderOnlinePaymentMethod = Exclude<PaymentMethod, "cash">;

export interface PendingOrderService {
  list(params?: PendingOrderListParams): Promise<PagedResult<PendingOrder>>;
  get(id: string): Promise<PendingOrder | null>;
  getByCode(code: string): Promise<PendingOrder | null>;
  create(input: CreatePendingOrderInput): Promise<PendingOrder>;
  changePaymentMethod(
    id: string,
    paymentMethod: PendingOrderOnlinePaymentMethod,
  ): Promise<PendingOrder>;
  markWaitingConfirm(id: string, opts?: { note?: string }): Promise<PendingOrder>;
  /** Compatibility shim only. Implementations must map to accepted command-style
   *  mutations (waiting_confirm / confirmed / cancelled / payment-method change)
   *  or fail clearly; this is not a generic persistence patch path. */
  update(
    id: string,
    patch: Partial<CreatePendingOrderInput> & { status?: PendingOrderStatus }
  ): Promise<PendingOrder>;
  /** Status transition: pending/waiting/paid_auto → confirmed. Optionally append a note
   *  (e.g. "Hóa đơn: HD-..."). Implementations may add side effects later
   *  (audit trail, BE state machine). Backend confirm remains the only
   *  authoritative path that creates an invoice from a pending order. */
  confirm(id: string, opts?: { note?: string; confirmedBy?: string }): Promise<PendingOrder>;
  /** Status transition: pending/waiting → cancelled. Optional reason note. */
  cancel(id: string, opts?: { note?: string }): Promise<PendingOrder>;
  /** Deprecated compatibility stub. Backend-owned pending orders do not expose
   *  delete semantics, so implementations may reject this operation. */
  remove(id: string): Promise<void>;
}
