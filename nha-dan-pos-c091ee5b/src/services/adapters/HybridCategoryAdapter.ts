import type {
  CategoryListParams,
  CategoryService,
  CreateCategoryInput,
} from "@/services/categories/CategoryService";
import type { PagedResult } from "@/services/types";
import type { Category } from "@/lib/mock-data";
import { getAdminSession } from "@/services/auth/adminApi";
import { BackendCategoryAdapter } from "@/services/adapters/backend/BackendCategoryAdapter";
import { LocalCategoryAdapter } from "@/services/adapters/local/LocalCategoryAdapter";

export class HybridCategoryAdapter implements CategoryService {
  constructor(
    private readonly backend = new BackendCategoryAdapter(),
    private readonly local = new LocalCategoryAdapter(),
  ) {}

  private useBackend() {
    return Boolean(getAdminSession()?.accessToken);
  }

  async list(params?: CategoryListParams): Promise<PagedResult<Category>> {
    if (this.useBackend()) {
      try {
        return await this.backend.list(params);
      } catch {
        /* local */
      }
    }
    return this.local.list(params);
  }

  async get(id: string) {
    if (this.useBackend()) {
      try {
        const c = await this.backend.get(id);
        if (c) return c;
      } catch {
        /* */
      }
    }
    return this.local.get(id);
  }

  async create(input: CreateCategoryInput) {
    if (this.useBackend()) {
      try {
        return await this.backend.create(input);
      } catch {
        /* */
      }
    }
    return this.local.create(input);
  }

  async update(id: string, patch: Partial<Category>) {
    if (this.useBackend()) {
      try {
        await this.backend.update(id, patch);
        return;
      } catch {
        /* */
      }
    }
    return this.local.update(id, patch);
  }

  async toggleActive(id: string) {
    if (this.useBackend()) {
      const c = await this.backend.get(id);
      if (c) {
        try {
          await this.backend.update(id, { active: !c.active });
          return;
        } catch {
          /* */
        }
      }
    }
    return this.local.toggleActive(id);
  }

  async remove(id: string) {
    if (this.useBackend()) {
      try {
        await this.backend.remove(id);
        return;
      } catch {
        /* */
      }
    }
    return this.local.remove(id);
  }
}
