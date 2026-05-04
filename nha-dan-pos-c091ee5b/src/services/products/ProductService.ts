// ProductService — canonical interface for product/variant CRUD.
// Local adapter wraps `productActions` from `src/lib/store.ts` so the admin UI
// keeps working unchanged. When BE arrives, swap the binding in
// `src/services/index.ts`; screens are not affected.

import type { ListQuery, PagedResult } from "@/services/types";
import type { Product, ProductVariant } from "@/lib/catalog-types";

/** Backend-friendly list params. `filters` mirrors the typed scalars below
 *  so a future BE can accept either flat fields or `filters[...]` and behave
 *  the same. UI should keep using the typed fields. */
export interface ProductListParams extends ListQuery {
  categoryId?: string;
  active?: boolean;
  /** Inventory threshold filter, e.g. `{ to: 5 }` for low-stock. */
  stockRange?: { from?: number; to?: number };
}

export interface ProductService {
  list(params?: ProductListParams): Promise<PagedResult<Product>>;
  get(id: string): Promise<Product | null>;
  create(input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] }): Promise<Product>;
  update(id: string, patch: Partial<Product>): Promise<void>;
  remove(id: string): Promise<void>;

  addVariant(productId: string, variant: Omit<ProductVariant, "id">): Promise<void>;
  updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>): Promise<void>;
  removeVariant(productId: string, variantId: string): Promise<void>;
  setDefaultVariant(productId: string, variantId: string): Promise<void>;
}
