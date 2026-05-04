// CategoryService — canonical interface for product categories.
// FE skeleton: backed by the legacy in-memory store today; the local adapter
// proxies `categoryActions`. When BE arrives, swap the binding in
// `src/services/index.ts` only.

import type { ListQuery, PagedResult } from "@/services/types";
import type { Category } from "@/lib/mock-data";

export interface CategoryListParams extends ListQuery {
  active?: boolean;
  /** When true, request /api/categories?includeInactive=true (admin views). */
  includeInactive?: boolean;
}

export interface CreateCategoryInput {
  name: string;
  description: string;
}

export interface CategoryService {
  list(params?: CategoryListParams): Promise<PagedResult<Category>>;
  get(id: string): Promise<Category | null>;
  create(input: CreateCategoryInput): Promise<Category>;
  update(id: string, patch: Partial<Category>): Promise<void>;
  toggleActive(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
