import type {
  CategoryListParams,
  CategoryService,
  CreateCategoryInput,
} from "@/services/categories/CategoryService";
import type { PagedResult } from "@/services/types";
import type { Category } from "@/lib/mock-data";
import { categoryActions, getStoreState } from "@/lib/store";

export class LocalCategoryAdapter implements CategoryService {
  async list(params?: CategoryListParams): Promise<PagedResult<Category>> {
    const all = getStoreState().categories;
    const q = params?.query?.trim().toLowerCase();
    const filtered = all.filter((c) => {
      if (params?.includeInactive === false && !c.active) return false;
      if (params?.active !== undefined && c.active !== params.active) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? (filtered.length || 1);
    const start = (page - 1) * pageSize;
    const items = params?.pageSize ? filtered.slice(start, start + pageSize) : filtered;
    return { items, total: filtered.length, page, pageSize };
  }
  async get(id: string) {
    return getStoreState().categories.find((c) => c.id === id) ?? null;
  }
  async create(input: CreateCategoryInput) {
    return categoryActions.create(input);
  }
  async update(id: string, patch: Partial<Category>) {
    categoryActions.update(id, patch);
  }
  async toggleActive(id: string) {
    categoryActions.toggleActive(id);
  }
  async remove(id: string) {
    categoryActions.remove(id);
  }
}
