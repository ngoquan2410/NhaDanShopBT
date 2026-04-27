import type {
  CreatePaymentSessionInput,
  PaymentService,
  PaymentSession,
} from "@/services/payments/PaymentService";
import type { ID } from "@/services/types";

/**
 * FE-skeleton stub. No persistent session store today — the existing flow
 * relies on `services.paymentEvents` (Casso webhook → payment_events table)
 * to match pending orders. This adapter exists so screens can already depend
 * on the canonical `PaymentService` shape; BE will replace it.
 */
export class LocalPaymentAdapter implements PaymentService {
  async open(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    return {
      id: `ps_${Date.now().toString(36)}`,
      pendingOrderId: input.pendingOrderId,
      method: input.method,
      reference: input.reference,
      amount: input.amount,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  }
  async getByReference(_reference: string): Promise<PaymentSession | null> {
    return null;
  }
  async cancel(id: ID): Promise<PaymentSession> {
    return {
      id,
      pendingOrderId: "",
      method: "bank_transfer",
      reference: "",
      amount: 0,
      status: "cancelled",
      createdAt: new Date().toISOString(),
    };
  }
}
