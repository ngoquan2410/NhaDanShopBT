import { adminFetchJson } from "@/services/auth/adminApi";
import type {
  ProductListParams,
  ProductService,
} from "@/services/products/ProductService";
import type { PagedResult } from "@/services/types";
import type { Product, ProductVariant } from "@/lib/mock-data";

const API = "/api/products";

/** Maps Spring Data Page JSON for GET /api/products */
interface SpringPage<T> {
  content: T[];
  totalElements: number;
  size: number;
  number: number;
}

function withDefaultSellable(isSellable: boolean | null | undefined): boolean {
  return isSellable !== false;
}

function mapVariant(v: Record<string, unknown>): ProductVariant {
  return {
    id: String(v.id),
    code: String(v.variantCode),
    name: String(v.variantName),
    sellUnit: String(v.sellUnit),
    importUnit: (v.importUnit as string) ?? "",
    piecesPerImportUnit: Number(v.piecesPerUnit ?? 1),
    sellPrice: Number(v.sellPrice ?? 0),
    costPrice: Number(v.costPrice ?? 0),
    stock: Number(v.stockQty ?? 0),
    minStock: Number(v.minStockQty ?? 0),
    expiryDays: Number(v.expiryDays ?? 0),
    isDefault: Boolean(v.isDefault),
    isSellable: withDefaultSellable(v.isSellable as boolean | undefined),
    image: (v.imageUrl as string) | undefined,
  };
}

function mapProduct(raw: Record<string, unknown>): Product {
  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Record<string, unknown>[]).map(mapVariant)
    : [];
  return {
    id: String(raw.id),
    code: String(raw.code),
    name: String(raw.name),
    categoryId: String(raw.categoryId),
    categoryName: (raw.categoryName as string) ?? "",
    image: (raw.imageUrl as string) ?? "",
    active: Boolean(raw.active),
    variants,
    type: variants.length > 1 ? "multi" : "single",
  };
}

function toCreateBody(
  input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] },
): Record<string, unknown> {
  const initial =
    input.variants?.map((v) => ({
      variantCode: v.code,
      variantName: v.name,
      sellUnit: v.sellUnit,
      importUnit: v.importUnit || null,
      piecesPerUnit: v.piecesPerImportUnit,
      sellPrice: v.sellPrice,
      costPrice: v.costPrice,
      stockQty: 0,
      minStockQty: v.minStock,
      expiryDays: v.expiryDays,
      isDefault: v.isDefault,
      imageUrl: v.image || null,
      conversionNote: null,
      active: true,
      isSellable: withDefaultSellable(v.isSellable),
    })) ?? [];
  return {
    code: input.code,
    name: input.name,
    categoryId: Number(input.categoryId),
    active: input.active,
    imageUrl: input.image || null,
    productType: input.type === "multi" || input.type === "single" ? "SINGLE" : "SINGLE",
    initialVariants: initial,
  };
}

/**
 * Product CRUD against Pack Slice 5 backend. Requires admin JWT.
 */
export class BackendProductAdapter implements ProductService {
  async list(params?: ProductListParams): Promise<PagedResult<Product>> {
    const q = new URLSearchParams();
    if (params?.query) q.set("search", params.query);
    if (params?.categoryId) q.set("categoryId", params.categoryId);
    if (params?.active === false) q.set("includeInactive", "true");
    const page0 = Math.max(0, (params?.page ?? 1) - 1);
    q.set("page", String(page0));
    q.set("size", String(params?.pageSize ?? 50));
    q.set("sort", "name,asc");
    const url = q.toString() ? `${API}?${q}` : `${API}?page=0&size=50&sort=name,asc`;
    const page = await adminFetchJson<SpringPage<Record<string, unknown>>>(url);
    return {
      items: (page.content ?? []).map(mapProduct),
      total: page.totalElements,
      page: (page.number ?? 0) + 1,
      pageSize: page.size,
    };
  }

  async get(id: string): Promise<Product | null> {
    try {
      const raw = await adminFetchJson<Record<string, unknown>>(`${API}/${encodeURIComponent(id)}`);
      return mapProduct(raw);
    } catch {
      return null;
    }
  }

  async create(input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] }): Promise<Product> {
    return mapProduct(
      (await adminFetchJson<Record<string, unknown>>(API, {
        method: "POST",
        body: JSON.stringify(toCreateBody(input)),
      })) as Record<string, unknown>,
    );
  }

  async update(id: string, patch: Partial<Product>): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    const body: Record<string, unknown> = {};
    if (patch.code != null) body.code = patch.code;
    if (patch.name != null) body.name = patch.name;
    if (patch.categoryId != null) body.categoryId = Number(patch.categoryId);
    if (patch.active != null) body.active = patch.active;
    if (patch.image != null) body.imageUrl = patch.image;
    if (Object.keys(body).length === 0) return;
    await adminFetchJson(`${API}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async remove(id: string): Promise<void> {
    await adminFetchJson(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async addVariant(productId: string, variant: Omit<ProductVariant, "id">): Promise<void> {
    await adminFetchJson(`${API}/${encodeURIComponent(productId)}/variants`, {
      method: "POST",
      body: JSON.stringify({
        variantCode: variant.code,
        variantName: variant.name,
        sellUnit: variant.sellUnit,
        importUnit: variant.importUnit || null,
        piecesPerUnit: variant.piecesPerImportUnit,
        sellPrice: variant.sellPrice,
        costPrice: variant.costPrice,
        stockQty: 0,
        minStockQty: variant.minStock,
        expiryDays: variant.expiryDays,
        isDefault: variant.isDefault,
        imageUrl: variant.image || null,
        conversionNote: null,
        active: true,
        isSellable: withDefaultSellable(variant.isSellable),
      }),
    });
  }

  async updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    const body: Record<string, unknown> = {};
    if (patch.code != null) body.variantCode = patch.code;
    if (patch.name != null) body.variantName = patch.name;
    if (patch.sellUnit != null) body.sellUnit = patch.sellUnit;
    if (patch.importUnit != null) body.importUnit = patch.importUnit;
    if (patch.piecesPerImportUnit != null) body.piecesPerUnit = patch.piecesPerImportUnit;
    if (patch.sellPrice != null) body.sellPrice = patch.sellPrice;
    if (patch.costPrice != null) body.costPrice = patch.costPrice;
    if (patch.minStock != null) body.minStockQty = patch.minStock;
    if (patch.expiryDays != null) body.expiryDays = patch.expiryDays;
    if (patch.isDefault != null) body.isDefault = patch.isDefault;
    if (patch.image != null) body.imageUrl = patch.image;
    if (patch.isSellable != null) body.isSellable = patch.isSellable;
    await adminFetchJson(`${API}/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async removeVariant(productId: string, variantId: string): Promise<void> {
    await adminFetchJson(
      `${API}/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      { method: "DELETE" },
    );
  }

  async setDefaultVariant(productId: string, variantId: string): Promise<void> {
    await adminFetchJson(
      `${API}/${encodeURIComponent(productId)}/default-variant/${encodeURIComponent(variantId)}`,
      { method: "POST" },
    );
  }
}
