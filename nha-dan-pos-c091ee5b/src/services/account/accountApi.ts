import { adminFetchJson } from "@/services/auth/adminApi";
import type { PendingOrder } from "@/services/types";

export interface AccountMe {
  userId: number;
  username: string;
  fullName?: string | null;
  roles: string[];
  customerId: number;
  customerCode?: string | null;
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  points: CustomerPointsSummary;
}

export interface CustomerPointsSummary {
  customerId: number;
  pointBalance: number;
  pointReserved: number;
  availablePoints: number;
  lifetimePointsEarned: number;
  lifetimePointsRedeemed: number;
}

export interface AccountOrder {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  totalAmount: number;
  discountAmount: number;
  loyaltyDiscountAmount: number;
  loyaltyRedeemedPoints: number;
  paymentMethod?: string | null;
  status: string;
}

export interface PointHistoryRow {
  id: number;
  type: string;
  pointsDelta: number;
  balanceAfter: number;
  reservedAfter: number;
  moneyBase?: number | null;
  discountAmount?: number | null;
  reason?: string | null;
  source?: string | null;
  invoiceId?: number | null;
  pendingOrderId?: number | null;
  createdAt: string;
}

interface Page<T> { content: T[]; }

export const accountApi = {
  me: () => adminFetchJson<AccountMe>("/api/account/me"),
  updateProfile: (body: { fullName?: string; phone?: string; email?: string; address?: string }) =>
    adminFetchJson<AccountMe>("/api/account/profile", { method: "PUT", body: JSON.stringify(body) }),
  orders: async () => (await adminFetchJson<Page<AccountOrder>>("/api/account/orders?page=0&size=50")).content ?? [],
  pendingOrders: () => adminFetchJson<PendingOrder[]>("/api/account/pending-orders"),
  cancelPendingOrderForEdit: (id: string) =>
    adminFetchJson<PendingOrder>(`/api/account/pending-orders/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  points: () => adminFetchJson<CustomerPointsSummary>("/api/account/points"),
  history: async () => (await adminFetchJson<Page<PointHistoryRow>>("/api/account/points/history?page=0&size=50")).content ?? [],
};

