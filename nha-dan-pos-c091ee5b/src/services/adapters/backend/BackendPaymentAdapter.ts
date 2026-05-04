import type {
  CreatePaymentSessionInput,
  PaymentService,
  PaymentSession,
} from "@/services/payments/PaymentService";

export class BackendPaymentAdapter implements PaymentService {
  async open(_input: CreatePaymentSessionInput): Promise<PaymentSession> {
    throw new Error("Payment sessions are not active production truth yet; use pending-order paymentReference/Casso events.");
  }

  async getByReference(_reference: string): Promise<PaymentSession | null> {
    return null;
  }

  async cancel(_id: string): Promise<PaymentSession> {
    throw new Error("Payment session cancellation is deferred; cancel the pending order instead.");
  }
}
