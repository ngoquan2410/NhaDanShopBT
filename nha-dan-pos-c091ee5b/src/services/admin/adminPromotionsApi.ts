import type { Promotion, PromotionScope, PromotionType } from "@/lib/promotions";
import { adminFetchJson } from "@/services/auth/adminApi";

export type BackendPromotionType =
  | "PERCENT_DISCOUNT"
  | "FIXED_DISCOUNT"
  | "BUY_X_GET_Y"
  | "QUANTITY_GIFT"
  | "FREE_SHIPPING";

export const UI_TO_BACKEND_PROMOTION_TYPE: Record<PromotionType, BackendPromotionType> = {
  percent: "PERCENT_DISCOUNT",
  fixed: "FIXED_DISCOUNT",
  "buy-x-get-y": "BUY_X_GET_Y",
  gift: "QUANTITY_GIFT",
  "free-shipping": "FREE_SHIPPING",
};

export const BACKEND_TO_UI_PROMOTION_TYPE: Record<BackendPromotionType, PromotionType> = {
  PERCENT_DISCOUNT: "percent",
  FIXED_DISCOUNT: "fixed",
  BUY_X_GET_Y: "buy-x-get-y",
  QUANTITY_GIFT: "gift",
  FREE_SHIPPING: "free-shipping",
};

export type AdminPromotionRow = {
  id: number;
  name: string;
  description: string | null;
  type: BackendPromotionType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount: number;
  startDate: string;
  endDate: string;
  active: boolean;
  currentlyActive: boolean;
  appliesTo: "ALL" | "CATEGORY" | "PRODUCT";
  categoryIds: number[];
  categoryNames: string[];
  productIds: number[];
  productNames: string[];
  buyQty: number | null;
  getProductId: number | null;
  getProductName: string | null;
  getQty: number | null;
  minBuyQty: number | null;
  maxBuyQty: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SpringPage<T> = {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  size?: number;
  number?: number;
};

function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => num(x)).filter((x) => Number.isFinite(x)) : [];
}

function localDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = iso.indexOf("T");
  return t > 0 ? iso.slice(0, t) : iso.slice(0, 10);
}

function startDateTime(date: string): string {
  const s = date.trim();
  return s.includes("T") ? s : `${s}T00:00:00`;
}

function endDateTime(date: string): string {
  const s = date.trim();
  return s.includes("T") ? s : `${s}T23:59:59`;
}

function parseScope(raw: AdminPromotionRow): PromotionScope {
  if (raw.appliesTo === "CATEGORY") return { kind: "categories", categoryIds: raw.categoryIds.map(String) };
  if (raw.appliesTo === "PRODUCT") return { kind: "products", productIds: raw.productIds.map(String) };
  return { kind: "all" };
}

function scopeToBackend(scope: PromotionScope): Pick<Record<string, unknown>, "appliesTo" | "categoryIds" | "productIds"> {
  if (scope.kind === "categories") {
    return { appliesTo: "CATEGORY", categoryIds: scope.categoryIds.map(Number), productIds: [] };
  }
  if (scope.kind === "products") {
    return { appliesTo: "PRODUCT", categoryIds: [], productIds: scope.productIds.map(Number) };
  }
  return { appliesTo: "ALL", categoryIds: [], productIds: [] };
}

export function parseAdminPromotionRow(raw: Record<string, unknown>): AdminPromotionRow {
  const type = String(raw.type ?? "PERCENT_DISCOUNT") as BackendPromotionType;
  return {
    id: num(raw.id, -1),
    name: String(raw.name ?? ""),
    description: raw.description != null ? String(raw.description) : null,
    type,
    discountValue: num(raw.discountValue),
    minOrderValue: num(raw.minOrderValue),
    maxDiscount: num(raw.maxDiscount),
    startDate: String(raw.startDate ?? ""),
    endDate: String(raw.endDate ?? ""),
    active: raw.active !== false,
    currentlyActive: Boolean(raw.currentlyActive),
    appliesTo: String(raw.appliesTo ?? "ALL") as AdminPromotionRow["appliesTo"],
    categoryIds: numArray(raw.categoryIds),
    categoryNames: strArray(raw.categoryNames),
    productIds: numArray(raw.productIds),
    productNames: strArray(raw.productNames),
    buyQty: raw.buyQty == null ? null : num(raw.buyQty),
    getProductId: raw.getProductId == null ? null : num(raw.getProductId),
    getProductName: raw.getProductName != null ? String(raw.getProductName) : null,
    getQty: raw.getQty == null ? null : num(raw.getQty),
    minBuyQty: raw.minBuyQty == null ? null : num(raw.minBuyQty),
    maxBuyQty: raw.maxBuyQty == null ? null : num(raw.maxBuyQty),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : null,
  };
}

export function adminPromotionRowToUi(row: AdminPromotionRow): Promotion {
  const base = {
    id: String(row.id),
    name: row.name,
    description: row.description ?? "",
    active: row.active,
    startDate: localDate(row.startDate),
    endDate: localDate(row.endDate),
    scope: parseScope(row),
  };
  switch (BACKEND_TO_UI_PROMOTION_TYPE[row.type]) {
    case "fixed":
      return { ...base, type: "fixed", amount: row.discountValue, minOrder: row.minOrderValue || undefined };
    case "buy-x-get-y":
      return {
        ...base,
        type: "buy-x-get-y",
        buyItems: row.productIds.length > 0
          ? row.productIds.map((id, i) => ({ productId: id.toString(), productName: row.productNames[i] ?? "", quantity: row.buyQty ?? 1 }))
          : [{ productId: "", productName: "", quantity: row.buyQty ?? 1 }],
        getItems: [{ productId: row.getProductId?.toString() ?? "", productName: row.getProductName ?? "", quantity: row.getQty ?? 1 }],
        mode: "different",
        repeatable: true,
      };
    case "gift":
      const triggerType: "min-order" | "buy-product" | "buy-quantity" = row.minOrderValue > 0
        ? "min-order"
        : row.productIds.length > 0 && (row.minBuyQty ?? 1) <= 1
          ? "buy-product"
          : "buy-quantity";
      return {
        ...base,
        type: "gift",
        triggerType,
        triggerValue: triggerType === "min-order" ? row.minOrderValue : row.minBuyQty ?? 1,
        triggerProductId: row.productIds[0]?.toString(),
        triggerProductName: row.productNames[0],
        giftItems: [{ productId: row.getProductId?.toString() ?? "", productName: row.getProductName ?? "", quantity: row.getQty ?? 1 }],
        giftStockLimit: row.maxBuyQty ?? undefined,
      };
    case "free-shipping":
      return { ...base, type: "free-shipping", minOrder: row.minOrderValue || undefined, maxShippingDiscount: row.maxDiscount || undefined };
    case "percent":
    default:
      return { ...base, type: "percent", percent: row.discountValue, maxDiscount: row.maxDiscount || undefined, minOrder: row.minOrderValue || undefined };
  }
}

export function buildPromotionUpsertBody(promo: Promotion): Record<string, unknown> {
  const scope = scopeToBackend(promo.scope);
  const common: Record<string, unknown> = {
    name: promo.name.trim(),
    description: promo.description?.trim() || null,
    type: UI_TO_BACKEND_PROMOTION_TYPE[promo.type],
    discountValue: 0,
    minOrderValue: 0,
    maxDiscount: 0,
    startDate: startDateTime(promo.startDate),
    endDate: endDateTime(promo.endDate),
    active: promo.active,
    buyQty: null,
    getProductId: null,
    getQty: null,
    minBuyQty: null,
    maxBuyQty: null,
    ...scope,
  };
  switch (promo.type) {
    case "percent":
      return { ...common, discountValue: promo.percent, minOrderValue: promo.minOrder ?? 0, maxDiscount: promo.maxDiscount ?? 0 };
    case "fixed":
      return { ...common, discountValue: promo.amount, minOrderValue: promo.minOrder ?? 0 };
    case "free-shipping":
      return { ...common, minOrderValue: promo.minOrder ?? 0, maxDiscount: promo.maxShippingDiscount ?? 0 };
    case "buy-x-get-y": {
      const buy = promo.buyItems[0];
      const gift = promo.getItems[0];
      return {
        ...common,
        appliesTo: "PRODUCT",
        productIds: promo.buyItems.map((item) => Number(item.productId)).filter((id) => Number.isFinite(id)),
        buyQty: buy?.quantity ?? 1,
        getProductId: gift?.productId ? Number(gift.productId) : null,
        getQty: gift?.quantity ?? 1,
      };
    }
    case "gift": {
      const gift = promo.giftItems[0];
      const triggerProductId = promo.triggerProductId ? Number(promo.triggerProductId) : null;
      const triggerProductIds = triggerProductId != null && Number.isFinite(triggerProductId) ? [triggerProductId] : [];
      return {
        ...common,
        appliesTo: promo.triggerType === "min-order" ? "ALL" : triggerProductIds.length > 0 ? "PRODUCT" : scope.appliesTo,
        productIds: promo.triggerType === "min-order" ? [] : triggerProductIds.length > 0 ? triggerProductIds : scope.productIds,
        minOrderValue: promo.triggerType === "min-order" ? promo.triggerValue : 0,
        minBuyQty: promo.triggerType === "buy-quantity" ? promo.triggerValue : promo.triggerType === "buy-product" ? 1 : null,
        maxBuyQty: promo.giftStockLimit ?? null,
        getProductId: gift?.productId ? Number(gift.productId) : null,
        getQty: gift?.quantity ?? 1,
      };
    }
  }
}

export async function fetchAdminPromotionPage(page = 0, size = 200): Promise<AdminPromotionRow[]> {
  const q = new URLSearchParams({ page: String(page), size: String(size), sort: "createdAt,desc" });
  const raw = await adminFetchJson<SpringPage<Record<string, unknown>>>(`/api/promotions?${q.toString()}`);
  return Array.isArray(raw.content) ? raw.content.map(parseAdminPromotionRow) : [];
}

export async function getAdminPromotion(id: number): Promise<AdminPromotionRow> {
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/promotions/${id}`);
  return parseAdminPromotionRow(raw);
}

export async function createAdminPromotion(body: Record<string, unknown>): Promise<AdminPromotionRow> {
  const raw = await adminFetchJson<Record<string, unknown>>("/api/promotions", { method: "POST", body: JSON.stringify(body) });
  return parseAdminPromotionRow(raw);
}

export async function updateAdminPromotion(id: number, body: Record<string, unknown>): Promise<AdminPromotionRow> {
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/promotions/${id}`, { method: "PUT", body: JSON.stringify(body) });
  return parseAdminPromotionRow(raw);
}

export async function toggleAdminPromotionActive(id: number): Promise<AdminPromotionRow> {
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/promotions/${id}/toggle`, { method: "PATCH" });
  return parseAdminPromotionRow(raw);
}

export async function deleteAdminPromotion(id: number): Promise<void> {
  await adminFetchJson<unknown>(`/api/promotions/${id}`, { method: "DELETE" });
}

