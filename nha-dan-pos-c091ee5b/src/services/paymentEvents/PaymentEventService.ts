// Payment event reconciliation service interface.
// Live data comes from backend-owned payment-event APIs; UI code should go
// through @/services rather than binding directly to transport details.

export interface PaymentEvent {
  id: string;
  provider: string;
  providerTxId: string;
  amount: number;
  transferContent: string;
  matchedCode: string | null;
  bankAccount: string | null;
  bankSubAcc: string | null;
  txTime: string | null;
  linkedOrderCode: string | null;
  linkedAt: string | null;
  linkedBy: string | null;
  status: "unmatched" | "matched" | "ignored" | "linked";
  createdAt: string;
}

export interface PaymentEventService {
  /** Latest events overall, newest first. */
  listRecentPaymentEvents(limit?: number): Promise<PaymentEvent[]>;
  /** Events not yet linked to any order (admin worklist). */
  listUnmatchedPaymentEvents(limit?: number): Promise<PaymentEvent[]>;
  /** Server-side paged unmatched worklist for admin table. */
  listUnmatchedPaymentEventsPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortField?: "txTime" | "createdAt" | "amount" | "status";
    sortDir?: "asc" | "desc";
  }): Promise<{ items: PaymentEvent[]; total: number; page: number; pageSize: number }>;
  /** Events whose matched/linked order code equals the given order code. */
  getPaymentEventsByOrderCode(code: string): Promise<PaymentEvent[]>;
  /** Manually link an event to an order. This must not confirm the order or
   *  create an invoice; it only records reconciliation state. */
  linkPaymentEvent(
    eventId: string,
    orderCode: string,
  ): Promise<PaymentEvent>;
  /** Mark an event as ignored (e.g. wrong-recipient transfer). */
  ignorePaymentEvent(eventId: string): Promise<PaymentEvent>;
  /** Restore an ignored event back to the worklist. */
  unignorePaymentEvent(eventId: string): Promise<PaymentEvent>;
  /** List events that admin previously marked as ignored. */
  listIgnoredPaymentEvents(limit?: number): Promise<PaymentEvent[]>;
  /** Count of events still needing admin attention. */
  getUnmatchedPaymentEventCount(): Promise<number>;

  /** Compatibility alias for `listRecentPaymentEvents`. */
  listRecent(limit?: number): Promise<PaymentEvent[]>;
  /** Compatibility alias for `listUnmatchedPaymentEvents`. */
  listUnmatched(limit?: number): Promise<PaymentEvent[]>;
  /** Compatibility alias for `getPaymentEventsByOrderCode`. */
  findByOrderCode(code: string): Promise<PaymentEvent[]>;
  /** Compatibility alias for `linkPaymentEvent`. */
  linkToOrder(
    eventId: string,
    orderCode: string,
  ): Promise<PaymentEvent>;
  /** Compatibility alias for `ignorePaymentEvent`. */
  markIgnored(eventId: string): Promise<PaymentEvent>;
  /** Compatibility alias for `unignorePaymentEvent`. */
  unmarkIgnored(eventId: string): Promise<PaymentEvent>;
  /** Compatibility alias for `listIgnoredPaymentEvents`. */
  listIgnored(limit?: number): Promise<PaymentEvent[]>;
  /** Compatibility alias for `getUnmatchedPaymentEventCount`. */
  countUnmatched(): Promise<number>;
}
