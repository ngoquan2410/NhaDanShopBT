import type {
  ProductListParams,
  ProductService,
} from "@/services/products/ProductService";
import type { PagedResult } from "@/services/types";
import type { Product, ProductVariant } from "@/lib/catalog-types";
import { BackendProductAdapter } from "@/services/adapters/backend/BackendProductAdapter";

/**
 * Production catalog adapter. Backend errors must surface to the UI instead of
 * silently returning local mock products.
 */
export class HybridProductAdapter implements ProductService {
  constructor(
    private readonly backend = new BackendProductAdapter(),
  ) {}

  async list(params?: ProductListParams): Promise<PagedResult<Product>> {
    return this.backend.list(params);
  }

  async get(id: string): Promise<Product | null> {
    return this.backend.get(id);
  }

  async create(
    input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] },
  ): Promise<Product> {
    return this.backend.create(input);
  }

  async update(id: string, patch: Partial<Product>): Promise<void> {
    return this.backend.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.backend.remove(id);
  }

  async addVariant(productId: string, variant: Omit<ProductVariant, "id">): Promise<void> {
    return this.backend.addVariant(productId, variant);
  }

  async updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>): Promise<void> {
    return this.backend.updateVariant(productId, variantId, patch);
  }

  async removeVariant(productId: string, variantId: string): Promise<void> {
    return this.backend.removeVariant(productId, variantId);
  }

  async setDefaultVariant(productId: string, variantId: string): Promise<void> {
    return this.backend.setDefaultVariant(productId, variantId);
  }
}
