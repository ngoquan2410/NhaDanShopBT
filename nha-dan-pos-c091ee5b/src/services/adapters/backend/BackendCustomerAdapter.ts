import { adminFetchJson } from "@/services/auth/adminApi";
import type { CustomerService } from "@/services/customers/CustomerService";
import type {
  Customer,
  CustomerPointHistoryItem,
  CustomerPointSourceType,
  ListQuery,
  PagedResult,
} from "@/services/types";

function mapCustomer(raw: Record<string, unknown>): Customer {
  return {
    id: String(raw.id ?? ""),
    code: (raw.code as string | undefined) ?? undefined,
    name: String(raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    email: (raw.email as string | undefined) ?? undefined,
    address: (raw.address as string | undefined) ?? undefined,
    points: Number(raw.pointBalance ?? raw.points ?? 0),
    createdAt: (raw.createdAt as string | undefined) ?? undefined,
    updatedAt: (raw.updatedAt as string | undefined) ?? undefined,
  };
}

export class BackendCustomerAdapter implements CustomerService {
  async list(params?: ListQuery): Promise<PagedResult<Customer>> {
    const q = params?.query ? `?q=${encodeURIComponent(params.query)}` : "";
    const rows = await adminFetchJson<Record<string, unknown>[]>(`/api/customers${q}`);
    return {
      items: rows.map(mapCustomer),
      total: rows.length,
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? (rows.length || 1),
    };
  }

  async get(id: string): Promise<Customer | null> {
    try {
      return mapCustomer(await adminFetchJson<Record<string, unknown>>(`/api/customers/${encodeURIComponent(id)}`));
    } catch {
      return null;
    }
  }

  async upsert(input: Customer): Promise<Customer> {
    const body = {
      code: input.code ?? null,
      name: input.name,
      phone: input.phone,
      address: input.address ?? null,
      email: input.email ?? null,
      active: true,
    };
    const raw = await adminFetchJson<Record<string, unknown>>(
      input.id ? `/api/customers/${encodeURIComponent(input.id)}` : "/api/customers",
      { method: input.id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    return mapCustomer(raw);
  }

  async addPoints(customerId: string, _delta: number, _reason: string, _sourceType: CustomerPointSourceType, _sourceId?: string): Promise<Customer> {
    const current = await this.get(customerId);
    if (!current) throw new Error("Customer not found");
    return current;
  }

  async redeemPoints(customerId: string, _delta: number, _reason: string, _sourceId?: string): Promise<Customer> {
    const current = await this.get(customerId);
    if (!current) throw new Error("Customer not found");
    return current;
  }

  async history(customerId: string): Promise<CustomerPointHistoryItem[]> {
    return adminFetchJson<CustomerPointHistoryItem[]>(`/api/account/points/history?customerId=${encodeURIComponent(customerId)}`);
  }
}
