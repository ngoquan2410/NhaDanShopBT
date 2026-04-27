import type { ID, InventoryProjection, InventoryProjectionBatch, Money } from "@/services/types";

/** Raw row from `GET /api/inventory/projections` (Jackson camelCase of Java records). */
type RawProjection = {
  variantId?: number | string;
  productId?: number | string;
  productCode?: string;
  productName?: string;
  variantCode?: string;
  variantName?: string;
  sellUnit?: string;
  onHand?: number;
  reserved?: number;
  available?: number;
  sellableQty?: number | string | null;
  byBatch?: RawBatch[] | null;
};

type RawBatch = {
  batchId?: number | string;
  batchCode?: string;
  qty?: number;
  costPrice?: string | number;
  expiryDate?: string | null;
  receiptId?: number | string | null;
  createdAt?: string | null;
};

function idString(v: number | string | undefined | null): ID {
  if (v === undefined || v === null) return "";
  return String(v);
}

function moneyOpt(v: string | number | undefined | null): Money | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapBatch(b: RawBatch): InventoryProjectionBatch {
  const code = b.batchCode;
  return {
    batchId: idString(b.batchId),
    lotCode: code,
    batchCode: code,
    qty: Number(b.qty ?? 0),
    costPrice: moneyOpt(b.costPrice),
    expiryDate: b.expiryDate ?? undefined,
    receiptId: b.receiptId != null && b.receiptId !== "" ? idString(b.receiptId) : undefined,
    createdAt: b.createdAt ?? undefined,
  };
}

export function normalizeInventoryProjection(raw: RawProjection): InventoryProjection {
  const onHand = Number(raw.onHand ?? 0);
  const reserved = Number(raw.reserved ?? 0);
  const available =
    raw.available != null
      ? Number(raw.available)
      : Math.max(0, onHand - reserved);
  const by =
    Array.isArray(raw.byBatch) && raw.byBatch.length > 0
      ? raw.byBatch.map(mapBatch)
      : undefined;
  const sellable =
    raw.sellableQty != null && raw.sellableQty !== ""
      ? Number(raw.sellableQty)
      : undefined;
  return {
    variantId: idString(raw.variantId),
    productId: raw.productId != null ? idString(raw.productId) : undefined,
    productCode: raw.productCode,
    productName: raw.productName,
    variantCode: raw.variantCode,
    variantName: raw.variantName,
    sellUnit: raw.sellUnit,
    onHand,
    reserved,
    available,
    sellableQty: sellable,
    byBatch: by,
  };
}
