import type {
  PaymentEvent,
  PaymentEventService,
} from "@/services/paymentEvents/PaymentEventService";
import { adminFetchJson } from "@/services/auth/adminApi";

type BackendPaymentEvent = {
  id: string | number;
  provider: string;
  providerTxId: string;
  amount: number;
  transferContent: string;
  matchedCode?: string | null;
  bankAccount?: string | null;
  bankSubAcc?: string | null;
  txTime?: string | null;
  linkedOrderCode?: string | null;
  linkedAt?: string | null;
  linkedBy?: string | null;
  status: PaymentEvent["status"];
  createdAt: string;
};

type LinkResponse = {
  paymentEvent: BackendPaymentEvent;
};

function toEvent(raw: BackendPaymentEvent): PaymentEvent {
  return {
    id: String(raw.id),
    provider: raw.provider,
    providerTxId: raw.providerTxId,
    amount: Number(raw.amount ?? 0),
    transferContent: raw.transferContent ?? "",
    matchedCode: raw.matchedCode ?? null,
    bankAccount: raw.bankAccount ?? null,
    bankSubAcc: raw.bankSubAcc ?? null,
    txTime: raw.txTime ?? null,
    linkedOrderCode: raw.linkedOrderCode ?? null,
    linkedAt: raw.linkedAt ?? null,
    linkedBy: raw.linkedBy ?? null,
    status: raw.status ?? "unmatched",
    createdAt: raw.createdAt,
  };
}

function withLimit(path: string, limit?: number): string {
  return limit ? `${path}?limit=${encodeURIComponent(String(limit))}` : path;
}

export class BackendPaymentEventAdapter implements PaymentEventService {
  async listRecentPaymentEvents(limit = 100): Promise<PaymentEvent[]> {
    const rows = await adminFetchJson<BackendPaymentEvent[]>(withLimit("/api/payment-events/recent", limit));
    return rows.map(toEvent);
  }

  async listUnmatchedPaymentEvents(limit = 200): Promise<PaymentEvent[]> {
    const pageSize = Math.max(1, Math.min(200, limit));
    const data = await adminFetchJson<
      BackendPaymentEvent[] | { content?: BackendPaymentEvent[] }
    >(`/api/payment-events/unmatched?page=0&size=${encodeURIComponent(String(pageSize))}&sort=txTime,desc`);
    const rows = Array.isArray(data) ? data : Array.isArray(data.content) ? data.content : [];
    return rows.map(toEvent);
  }

  async listUnmatchedPaymentEventsPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortField?: "txTime" | "createdAt" | "amount" | "status";
    sortDir?: "asc" | "desc";
  }): Promise<{ items: PaymentEvent[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params?.pageSize ?? 50));
    const sortField = params?.sortField ?? "txTime";
    const sortDir = params?.sortDir ?? "desc";
    const q = new URLSearchParams({
      page: String(page - 1),
      size: String(pageSize),
      sort: `${sortField},${sortDir}`,
    });
    if (params?.search?.trim()) q.set("search", params.search.trim());
    const data = await adminFetchJson<{
      content?: BackendPaymentEvent[];
      totalElements?: number;
      number?: number;
      size?: number;
    }>(`/api/payment-events/unmatched?${q.toString()}`);
    const items = (Array.isArray(data.content) ? data.content : []).map(toEvent);
    return {
      items,
      total: Number(data.totalElements ?? items.length),
      page: Number(data.number ?? page - 1) + 1,
      pageSize: Number(data.size ?? pageSize),
    };
  }

  async getPaymentEventsByOrderCode(code: string): Promise<PaymentEvent[]> {
    const rows = await adminFetchJson<BackendPaymentEvent[]>(
      `/api/payment-events/by-order-code/${encodeURIComponent(code)}`,
    );
    return rows.map(toEvent);
  }

  async linkPaymentEvent(
    eventId: string,
    orderCode: string,
  ): Promise<PaymentEvent> {
    const data = await adminFetchJson<LinkResponse>(`/api/payment-events/${encodeURIComponent(eventId)}/link`, {
      method: "POST",
      body: JSON.stringify({
        orderCode,
      }),
    });
    return toEvent(data.paymentEvent);
  }

  async ignorePaymentEvent(eventId: string): Promise<PaymentEvent> {
    const row = await adminFetchJson<BackendPaymentEvent>(
      `/api/payment-events/${encodeURIComponent(eventId)}/ignore`,
      { method: "POST" },
    );
    return toEvent(row);
  }

  async unignorePaymentEvent(eventId: string): Promise<PaymentEvent> {
    const row = await adminFetchJson<BackendPaymentEvent>(
      `/api/payment-events/${encodeURIComponent(eventId)}/unignore`,
      { method: "POST" },
    );
    return toEvent(row);
  }

  async listIgnoredPaymentEvents(limit = 100): Promise<PaymentEvent[]> {
    const rows = await adminFetchJson<BackendPaymentEvent[]>(withLimit("/api/payment-events/ignored", limit));
    return rows.map(toEvent);
  }

  async getUnmatchedPaymentEventCount(): Promise<number> {
    const data = await adminFetchJson<{ count: number }>("/api/payment-events/unmatched/count");
    return Number(data.count ?? 0);
  }

  async listRecent(limit = 100): Promise<PaymentEvent[]> {
    return this.listRecentPaymentEvents(limit);
  }

  async listUnmatched(limit = 200): Promise<PaymentEvent[]> {
    return this.listUnmatchedPaymentEvents(limit);
  }

  async findByOrderCode(code: string): Promise<PaymentEvent[]> {
    return this.getPaymentEventsByOrderCode(code);
  }

  async linkToOrder(
    eventId: string,
    orderCode: string,
  ): Promise<PaymentEvent> {
    return this.linkPaymentEvent(eventId, orderCode);
  }

  async markIgnored(eventId: string): Promise<PaymentEvent> {
    return this.ignorePaymentEvent(eventId);
  }

  async unmarkIgnored(eventId: string): Promise<PaymentEvent> {
    return this.unignorePaymentEvent(eventId);
  }

  async listIgnored(limit = 100): Promise<PaymentEvent[]> {
    return this.listIgnoredPaymentEvents(limit);
  }

  async countUnmatched(): Promise<number> {
    return this.getUnmatchedPaymentEventCount();
  }
}
