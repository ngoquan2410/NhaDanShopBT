import { adminFetchJson } from "@/services/auth/adminApi";

export type VariantSearchContext = "pos" | "receipt" | "recipe" | "combo" | "stock_adjustment";

export interface VariantTransactionSearchHit {
  variantId: string;
  variantCode: string;
  variantName: string;
  productId: string;
  productCode: string;
  productName: string;
  productType: string;
  active: boolean;
  isSellable: boolean;
  sellUnit: string;
  importUnit: string;
  categoryId: string;
  categoryName: string;
  stockQty: number;
  sellPrice: number;
  costPrice: number;
  piecesPerUnit: number;
  minStockQty: number;
  expiryDays: number | null;
}

interface SpringPage {
  content?: Record<string, unknown>[];
  totalElements?: number;
  size?: number;
  number?: number;
}

function num(v: unknown, d = 0): number {
  if (v == null || v === "") return d;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function mapHit(r: Record<string, unknown>): VariantTransactionSearchHit {
  return {
    variantId: String(r.variantId ?? ""),
    variantCode: String(r.variantCode ?? ""),
    variantName: String(r.variantName ?? ""),
    productId: String(r.productId ?? ""),
    productCode: String(r.productCode ?? ""),
    productName: String(r.productName ?? ""),
    productType: String(r.productType ?? ""),
    active: Boolean(r.active),
    isSellable: Boolean(r.isSellable),
    sellUnit: String(r.sellUnit ?? ""),
    importUnit: String(r.importUnit ?? ""),
    categoryId: r.categoryId != null ? String(r.categoryId) : "",
    categoryName: String(r.categoryName ?? ""),
    stockQty: num(r.stockQty),
    sellPrice: num(r.sellPrice),
    costPrice: num(r.costPrice),
    piecesPerUnit: num(r.piecesPerUnit, 1),
    minStockQty: num(r.minStockQty),
    expiryDays: r.expiryDays == null ? null : num(r.expiryDays),
  };
}

export async function searchVariantsForTransaction(opts: {
  search: string;
  context: VariantSearchContext;
  page?: number;
  size?: number;
  activeOnly?: boolean;
  sellableOnly?: boolean;
  signal?: AbortSignal;
}): Promise<{ items: VariantTransactionSearchHit[]; totalElements: number }> {
  const q = new URLSearchParams();
  q.set("search", opts.search);
  q.set("context", opts.context);
  q.set("page", String(opts.page ?? 0));
  q.set("size", String(opts.size ?? 20));
  if (opts.activeOnly === false) q.set("activeOnly", "false");
  if (opts.sellableOnly !== undefined) q.set("sellableOnly", String(opts.sellableOnly));
  const page = await adminFetchJson<SpringPage>(`/api/products/variants/search?${q}`, {
    signal: opts.signal,
  });
  const items = (page.content ?? []).map((row) => mapHit(row));
  return { items, totalElements: page.totalElements ?? 0 };
}
