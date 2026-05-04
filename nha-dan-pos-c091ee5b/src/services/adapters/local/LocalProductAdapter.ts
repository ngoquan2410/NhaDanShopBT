import type {
  ProductListParams,
  ProductService,
} from "@/services/products/ProductService";
import type { PagedResult } from "@/services/types";
import type { Product, ProductVariant } from "@/lib/catalog-types";
import { getStoreState, productActions } from "@/lib/store";

function paginate<T>(items: T[], page = 1, pageSize = 50): PagedResult<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

export class LocalProductAdapter implements ProductService {
  async list(params?: ProductListParams) {
    const all = getStoreState().products;
    const q = params?.query?.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (params?.categoryId && p.categoryId !== params.categoryId) return false;
      if (params?.active !== undefined && p.active !== params.active) return false;
      if (q && !`${p.name} ${p.code}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return paginate(filtered, params?.page ?? 1, params?.pageSize ?? 50);
  }
  async get(id: string) {
    return getStoreState().products.find((p) => p.id === id) ?? null;
  }
  async create(input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] }) {
    return productActions.create(input);
  }
  async update(id: string, patch: Partial<Product>) {
    productActions.update(id, patch);
  }
  async remove(id: string) {
    productActions.remove(id);
  }
  async addVariant(productId: string, variant: Omit<ProductVariant, "id">) {
    productActions.addVariant(productId, variant);
  }
  async updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>) {
    productActions.updateVariant(productId, variantId, patch);
  }
  async removeVariant(productId: string, variantId: string) {
    productActions.removeVariant(productId, variantId);
  }
  async setDefaultVariant(productId: string, variantId: string) {
    productActions.setDefaultVariant(productId, variantId);
  }
}
