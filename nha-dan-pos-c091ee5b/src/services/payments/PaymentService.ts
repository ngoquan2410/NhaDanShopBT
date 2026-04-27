// PaymentService — canonical interface for payment session lifecycle.
// FE skeleton ONLY. Today the actual reconciliation lives in
// `services.paymentEvents` (Casso-fed events) and `usePaymentEvents`. This
// service exposes the shape BE will use to record/confirm/cancel a session
// tied to a pending order.

import type { ID, Money, PaymentMethod } from "@/services/types";

export type PaymentSessionStatus = "pending" | "matched" | "expired" | "cancelled";

export interface PaymentSession {
  id: ID;
  pendingOrderId: ID;
  method: PaymentMethod;
  /** Reference printed on QR / sent in transfer content. */
  reference: string;
  amount: Money;
  status: PaymentSessionStatus;
  createdAt: string;
  matchedAt?: string;
  matchedEventId?: ID;
}

export interface CreatePaymentSessionInput {
  pendingOrderId: ID;
  method: PaymentMethod;
  reference: string;
  amount: Money;
}

export interface PaymentService {
  /** Open a payment session for a pending order. */
  open(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  /** Look up by pending order code/reference. */
  getByReference(reference: string): Promise<PaymentSession | null>;
  /** Mark a session as cancelled (manual cancel from admin). */
  cancel(id: ID): Promise<PaymentSession>;
}
