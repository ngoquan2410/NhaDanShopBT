// Local persistence for customers + points history (Batch 1 will fully wire UI).
import type { CustomerService } from "@/services/customers/CustomerService";
import type {
  Customer,
  CustomerPointHistoryItem,
  CustomerPointSourceType,
  ListQuery,
  PagedResult,
} from "@/services/types";
import { readJson, writeJson } from "./storage";
import { pointsHistoryId, uid } from "@/services/utils/ids";
import { nowIso } from "@/services/utils/date";

const KEY_CUSTOMERS = "customers:v1";
const KEY_HISTORY = "customer_points_history:v1";

export class LocalCustomerAdapter implements CustomerService {
  async list(params?: ListQuery): Promise<PagedResult<Customer>> {
    const all = readJson<Customer[]>(KEY_CUSTOMERS, []);
    const q = params?.query?.trim().toLowerCase();
    let filtered = q
      ? all.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)
        )
      : all;

    if (params?.sort?.length) {
      filtered = [...filtered].sort((a: any, b: any) => {
        for (const rule of params.sort!) {
          const av = a[rule.field];
          const bv = b[rule.field];
          if (av === bv) continue;
          const cmp = av > bv ? 1 : -1;
          return rule.direction === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? filtered.length;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async get(id: string): Promise<Customer | null> {
    return readJson<Customer[]>(KEY_CUSTOMERS, []).find((c) => c.id === id) ?? null;
  }

  async upsert(input: Customer): Promise<Customer> {
    const list = readJson<Customer[]>(KEY_CUSTOMERS, []);
    const next: Customer = { ...input, updatedAt: nowIso() };
    const idx = list.findIndex((c) => c.id === input.id);
    if (idx === -1) {
      next.id = next.id || uid("cust_");
      next.createdAt = nowIso();
      writeJson(KEY_CUSTOMERS, [next, ...list]);
    } else {
      list[idx] = next;
      writeJson(KEY_CUSTOMERS, list);
    }
    return next;
  }

  async addPoints(
    customerId: string,
    delta: number,
    reason: string,
    sourceType: CustomerPointSourceType,
    sourceId?: string
  ): Promise<Customer> {
    return this.recordPoints(customerId, Math.abs(delta), reason, sourceType, sourceId);
  }

  async redeemPoints(
    customerId: string,
    delta: number,
    reason: string,
    sourceId?: string
  ): Promise<Customer> {
    return this.recordPoints(customerId, -Math.abs(delta), reason, "redemption", sourceId);
  }

  async history(customerId: string): Promise<CustomerPointHistoryItem[]> {
    return readJson<CustomerPointHistoryItem[]>(KEY_HISTORY, []).filter(
      (h) => h.customerId === customerId
    );
  }

  private recordPoints(
    customerId: string,
    delta: number,
    reason: string,
    sourceType: CustomerPointSourceType,
    sourceId?: string
  ): Customer {
    const list = readJson<Customer[]>(KEY_CUSTOMERS, []);
    const idx = list.findIndex((c) => c.id === customerId);
    if (idx === -1) throw new Error("Customer not found");
    const updated: Customer = {
      ...list[idx],
      points: (list[idx].points ?? 0) + delta,
      updatedAt: nowIso(),
    };
    list[idx] = updated;
    writeJson(KEY_CUSTOMERS, list);

    const history = readJson<CustomerPointHistoryItem[]>(KEY_HISTORY, []);
    history.unshift({
      id: pointsHistoryId(),
      customerId,
      createdAt: nowIso(),
      delta,
      balanceAfter: updated.points,
      reason,
      sourceType,
      sourceId,
    });
    writeJson(KEY_HISTORY, history);
    return updated;
  }
}
