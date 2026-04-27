import type {
  Customer,
  CustomerPointHistoryItem,
  CustomerPointSourceType,
  ListQuery,
  PagedResult,
} from "@/services/types";

export interface CustomerService {
  list(params?: ListQuery): Promise<PagedResult<Customer>>;
  get(id: string): Promise<Customer | null>;
  upsert(input: Customer): Promise<Customer>;
  addPoints(
    customerId: string,
    delta: number,
    reason: string,
    sourceType: CustomerPointSourceType,
    sourceId?: string
  ): Promise<Customer>;
  redeemPoints(
    customerId: string,
    delta: number,
    reason: string,
    sourceId?: string
  ): Promise<Customer>;
  history(customerId: string): Promise<CustomerPointHistoryItem[]>;
}
