export interface StorefrontCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface StorefrontVariant {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  sellUnit: string;
  sellPrice: number;
  isDefault?: boolean;
  isSellable?: boolean;
  image?: string;
  /** Aggregate sellable units from public API (`availableQty`); never raw batch/stockQty. */
  availableQty?: number;
  availabilityStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  /**
   * Legacy explicit booleans from API (`available` / `inStock`) when present.
   * Do not derive from raw stockQty / remainingQty.
   */
  available?: boolean;
}

export interface StorefrontProduct {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  image?: string;
  active: boolean;
  /** Backend SINGLE | COMBO */
  productType?: string;
  type?: string;
  variants: StorefrontVariant[];
}

interface SpringPage<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  size?: number;
  number?: number;
}

interface PublicVariantDto {
  id: string | number;
  code?: string | null;
  name?: string | null;
  variantCode?: string | null;
  variantName?: string | null;
  sellUnit?: string | null;
  sellPrice?: string | number | null;
  imageUrl?: string | null;
  image?: string | null;
  isDefault?: boolean | null;
  active?: boolean | null;
  isSellable?: boolean | null;
  /** Backend aggregate; never map stockQty / remainingQty onto the storefront model. */
  availableQty?: number | string | null;
  availabilityStatus?: string | null;
  /** Public-safe flags only — do not map numeric stock from DTO. */
  available?: boolean | null;
  inStock?: boolean | null;
  /** Must never be copied onto StorefrontVariant (audit / forward-compat). */
  stockQty?: number | null;
  remainingQty?: number | null;
}

interface PublicProductDto {
  id: string | number;
  code?: string | null;
  name?: string | null;
  categoryId?: string | number | null;
  categoryName?: string | null;
  productType?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  active?: boolean | null;
  variants?: PublicVariantDto[] | null;
}

export interface PublicCatalogQuery {
  search?: string;
  categoryId?: string | null;
  /** Backend filter e.g. COMBO — only real catalog rows, never client-side fake combos. */
  productType?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

/** Active combos from public GET /api/combos/active (no auth). */
export type StorefrontComboSummary = {
  id: string;
  code: string;
  name: string;
  price: number;
  derivedStock: number | null;
  active: boolean;
  defaultVariantId?: string;
  components: Array<{ productName: string; variantName?: string; quantity: number }>;
};

export async function listActiveCombosPublic(): Promise<StorefrontComboSummary[]> {
  try {
    const page = await listPublicProductsPage({
      productType: "COMBO",
      page: 0,
      size: 8,
      sort: "name,asc",
    });
    return page.items
      .filter((p) => String(p.productType ?? "").toUpperCase() === "COMBO")
      .map((p) => {
        const defaultVariant = p.variants.find((v) => v.isDefault) ?? p.variants[0];
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          price: Number(defaultVariant?.sellPrice ?? 0),
          derivedStock: null,
          active: p.active,
          defaultVariantId: defaultVariant?.id,
          components: [],
        };
      })
      .filter((c) => c.id.length > 0 && c.price > 0);
  } catch {
    return [];
  }
}

export interface PublicCatalogPage {
  items: StorefrontProduct[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail ?? data?.message ?? data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Map explicit public availability booleans only — never infer from stockQty/remainingQty. */
function mapPublicAvailability(v: PublicVariantDto): boolean | undefined {
  if (v.available === false || v.inStock === false) return false;
  if (v.available === true || v.inStock === true) return true;
  return undefined;
}

function parseAvailabilityStatus(raw: string | null | undefined): StorefrontVariant["availabilityStatus"] | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "IN_STOCK" || s === "LOW_STOCK" || s === "OUT_OF_STOCK") return s;
  return undefined;
}

function mapVariant(v: PublicVariantDto): StorefrontVariant {
  const availability = mapPublicAvailability(v);
  const rawQty = v.availableQty;
  let availableQty: number | undefined;
  if (rawQty != null && rawQty !== "") {
    const n = Number(rawQty);
    if (Number.isFinite(n)) availableQty = Math.max(0, Math.floor(n));
  }
  const availabilityStatus = parseAvailabilityStatus(v.availabilityStatus);
  let mergedAvailable = availability;
  if (availableQty !== undefined) {
    mergedAvailable = availableQty > 0;
  }
  return {
    id: String(v.id),
    code: String(v.variantCode ?? v.code ?? v.id),
    name: String(v.variantName ?? v.name ?? ""),
    active: v.active !== false,
    sellUnit: String(v.sellUnit ?? "cái"),
    sellPrice: Number(v.sellPrice ?? 0),
    isDefault: Boolean(v.isDefault),
    isSellable: v.isSellable !== false,
    image: (v.imageUrl as string) ?? (v.image as string) ?? undefined,
    ...(availableQty !== undefined ? { availableQty } : {}),
    ...(availabilityStatus ? { availabilityStatus } : {}),
    ...(mergedAvailable !== undefined ? { available: mergedAvailable } : {}),
  };
}

export function mapProduct(raw: PublicProductDto): StorefrontProduct {
  const variants = Array.isArray(raw.variants)
    ? raw.variants
      .map(mapVariant)
      .filter((v) => v.active !== false && v.isSellable !== false)
    : [];
  const pt = raw.productType != null ? String(raw.productType) : undefined;
  return {
    id: String(raw.id),
    code: String(raw.code ?? raw.id),
    name: String(raw.name ?? ""),
    categoryId: String(raw.categoryId ?? ""),
    categoryName: String(raw.categoryName ?? ""),
    image: (raw.imageUrl as string) ?? (raw.image as string) ?? "",
    active: raw.active !== false,
    productType: pt,
    variants,
    type: pt === "COMBO" ? "combo" : variants.length > 1 ? "multi" : "single",
  };
}

export function mapCategory(raw: Record<string, unknown>): StorefrontCategory {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    active: raw.active !== false,
  };
}

export async function listPublicProductsPage(query: PublicCatalogQuery = {}): Promise<PublicCatalogPage> {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.productType) params.set("productType", query.productType);
  params.set("page", String(query.page ?? 0));
  params.set("size", String(query.size ?? 20));
  params.set("sort", query.sort ?? "name,asc");
  const data = await fetchJson<SpringPage<PublicProductDto>>(`/api/products?${params.toString()}`);
  const rows = (data.content ?? []).map(mapProduct).filter((p) => p.active && p.variants.length > 0);
  return {
    items: rows,
    totalElements: Number(data.totalElements ?? rows.length),
    totalPages: Number(data.totalPages ?? 0),
    page: Number(data.number ?? query.page ?? 0),
    size: Number(data.size ?? query.size ?? 20),
  };
}

export type PublicVariantAvailabilityDto = {
  variantId: number;
  availableQty: number;
  availabilityStatus: string;
  sellUnit: string;
};

/**
 * Batch public availability for storefront cart reconciliation (single request, max 100 ids).
 */
export async function fetchPublicVariantAvailability(variantIds: string[]): Promise<PublicVariantAvailabilityDto[]> {
  const uniq = [...new Set(variantIds.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x)))];
  if (uniq.length === 0) return [];
  const q = uniq.slice(0, 100).join(",");
  const data = await fetchJson<PublicVariantAvailabilityDto[]>(
    `/api/products/variants/availability?variantIds=${encodeURIComponent(q)}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function listPublicProducts(): Promise<StorefrontProduct[]> {
  const page = await listPublicProductsPage({ page: 0, size: 20, sort: "name,asc" });
  return page.items;
}

export async function getPublicProduct(id: string): Promise<StorefrontProduct | null> {
  try {
    const raw = await fetchJson<PublicProductDto>(`/api/products/${encodeURIComponent(id)}`);
    const product = mapProduct(raw);
    return product.active && product.variants.length > 0 ? product : null;
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) return null;
    throw e;
  }
}

export async function listPublicCategories(): Promise<StorefrontCategory[]> {
  const data = await fetchJson<Record<string, unknown>[] | SpringPage<Record<string, unknown>>>("/api/categories");
  const rows = Array.isArray(data) ? data : data.content ?? [];
  return rows.map(mapCategory).filter((c) => c.active);
}

