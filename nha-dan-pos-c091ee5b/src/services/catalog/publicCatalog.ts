export interface StorefrontCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface StorefrontVariant {
  id: string;
  code: string;
  name: string;
  sellUnit: string;
  importUnit?: string;
  piecesPerImportUnit?: number;
  sellPrice: number;
  costPrice?: number;
  stock: number;
  minStock: number;
  expiryDays?: number;
  isDefault?: boolean;
  isSellable?: boolean;
  image?: string;
}

export interface StorefrontProduct {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  image?: string;
  active: boolean;
  type?: string;
  variants: StorefrontVariant[];
}

interface SpringPage<T> {
  content?: T[];
  totalElements?: number;
  size?: number;
  number?: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail ?? data?.message ?? data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

function mapVariant(v: Record<string, unknown>): StorefrontVariant {
  return {
    id: String(v.id),
    code: String(v.variantCode ?? v.code ?? v.id),
    name: String(v.variantName ?? v.name ?? ""),
    sellUnit: String(v.sellUnit ?? "cái"),
    importUnit: (v.importUnit as string) ?? "",
    piecesPerImportUnit: Number(v.piecesPerUnit ?? v.piecesPerImportUnit ?? 1),
    sellPrice: Number(v.sellPrice ?? 0),
    costPrice: Number(v.costPrice ?? 0),
    stock: Number(
      v.sellableStockQty != null && Number.isFinite(Number(v.sellableStockQty))
        ? Number(v.sellableStockQty)
        : Number(v.stockQty ?? v.stock ?? 0),
    ),
    minStock: Number(v.minStockQty ?? v.minStock ?? 0),
    expiryDays: Number(v.expiryDays ?? 0),
    isDefault: Boolean(v.isDefault),
    isSellable: v.isSellable !== false,
    image: (v.imageUrl as string) ?? (v.image as string) ?? undefined,
  };
}

export function mapProduct(raw: Record<string, unknown>): StorefrontProduct {
  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Record<string, unknown>[]).map(mapVariant).filter((v) => v.isSellable !== false)
    : [];
  return {
    id: String(raw.id),
    code: String(raw.code ?? raw.id),
    name: String(raw.name ?? ""),
    categoryId: String(raw.categoryId ?? ""),
    categoryName: String(raw.categoryName ?? ""),
    image: (raw.imageUrl as string) ?? (raw.image as string) ?? "",
    active: raw.active !== false,
    variants,
    type: variants.length > 1 ? "multi" : "single",
  };
}

export function mapCategory(raw: Record<string, unknown>): StorefrontCategory {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    active: raw.active !== false,
  };
}

export async function listPublicProducts(): Promise<StorefrontProduct[]> {
  const data = await fetchJson<SpringPage<Record<string, unknown>> | Record<string, unknown>[]>(
    "/api/products?page=0&size=200&sort=name,asc",
  );
  const rows = Array.isArray(data) ? data : data.content ?? [];
  return rows.map(mapProduct).filter((p) => p.active && p.variants.length > 0);
}

export async function getPublicProduct(id: string): Promise<StorefrontProduct | null> {
  try {
    const raw = await fetchJson<Record<string, unknown>>(`/api/products/${encodeURIComponent(id)}`);
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

