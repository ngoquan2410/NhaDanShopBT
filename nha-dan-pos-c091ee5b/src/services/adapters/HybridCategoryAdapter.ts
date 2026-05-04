import type {
  CategoryListParams,
  CategoryService,
  CreateCategoryInput,
} from "@/services/categories/CategoryService";
import type { PagedResult } from "@/services/types";
import type { Category } from "@/lib/mock-data";
import { BackendCategoryAdapter } from "@/services/adapters/backend/BackendCategoryAdapter";

export class HybridCategoryAdapter implements CategoryService {
  constructor(
    private readonly backend = new BackendCategoryAdapter(),
  ) {}

  async list(params?: CategoryListParams): Promise<PagedResult<Category>> {
    return this.backend.list(params);
  }

  async get(id: string) {
    return this.backend.get(id);
  }

  async create(input: CreateCategoryInput) {
    return this.backend.create(input);
  }

  async update(id: string, patch: Partial<Category>) {
    return this.backend.update(id, patch);
  }

  async toggleActive(id: string) {
    const c = await this.backend.get(id);
    if (c) await this.backend.update(id, { active: !c.active });
  }

  async remove(id: string) {
    return this.backend.remove(id);
  }
}
