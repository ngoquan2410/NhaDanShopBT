import type {
  ProductListParams,
  ProductService,
} from "@/services/products/ProductService";
import type { PagedResult } from "@/services/types";
import type { Product, ProductVariant } from "@/lib/mock-data";
import { getAdminSession } from "@/services/auth/adminApi";
import { BackendProductAdapter } from "@/services/adapters/backend/BackendProductAdapter";
import { LocalProductAdapter } from "@/services/adapters/local/LocalProductAdapter";

/**
 * Uses backend catalog when an admin session exists; otherwise the in-memory store
 * (no login prompts on public flows).
 */
export class HybridProductAdapter implements ProductService {
  constructor(
    private readonly backend = new BackendProductAdapter(),
    private readonly local = new LocalProductAdapter(),
  ) {}

  private useBackend() {
    return Boolean(getAdminSession()?.accessToken);
  }

  async list(params?: ProductListParams): Promise<PagedResult<Product>> {
    if (this.useBackend()) {
      try {
        return await this.backend.list(params);
      } catch {
        /* fall through */
      }
    }
    return this.local.list(params);
  }

  async get(id: string): Promise<Product | null> {
    if (this.useBackend()) {
      try {
        const p = await this.backend.get(id);
        if (p) return p;
      } catch {
        /* local */
      }
    }
    return this.local.get(id);
  }

  async create(
    input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] },
  ): Promise<Product> {
    if (this.useBackend()) {
      try {
        return await this.backend.create(input);
      } catch {
        /* local */
      }
    }
    return this.local.create(input);
  }

  async update(id: string, patch: Partial<Product>): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.update(id, patch);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.remove(id);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.remove(id);
  }

  async addVariant(productId: string, variant: Omit<ProductVariant, "id">): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.addVariant(productId, variant);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.addVariant(productId, variant);
  }

  async updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.updateVariant(productId, variantId, patch);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.updateVariant(productId, variantId, patch);
  }

  async removeVariant(productId: string, variantId: string): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.removeVariant(productId, variantId);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.removeVariant(productId, variantId);
  }

  async setDefaultVariant(productId: string, variantId: string): Promise<void> {
    if (this.useBackend()) {
      try {
        await this.backend.setDefaultVariant(productId, variantId);
        return;
      } catch {
        /* local */
      }
    }
    return this.local.setDefaultVariant(productId, variantId);
  }
}
