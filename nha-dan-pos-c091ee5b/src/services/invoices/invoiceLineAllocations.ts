import type { InvoiceLineAllocation } from "@/services/types";

type RawAlloc = {
  id?: string | number;
  batchId?: string | number;
  batchCode?: string;
  lotCode?: string;
  deductedQty?: number;
  qty?: number;
};

/**
 * Read-only normalization for `SalesInvoice` item rows when the backend (later)
 * exposes `batchAllocations` or `allocations` on each line.
 * Today the Java `SalesInvoiceItemResponse` has no such field; callers receive `undefined`.
 */
export function normalizeInvoiceLineAllocationsFromApi(
  item: { batchAllocations?: RawAlloc[]; allocations?: RawAlloc[] } | null | undefined,
): InvoiceLineAllocation[] | undefined {
  if (!item) return undefined;
  const arr = item.batchAllocations ?? item.allocations;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const out: InvoiceLineAllocation[] = [];
  for (const a of arr) {
    if (a == null) continue;
    const batchId = a.batchId;
    if (batchId === undefined || batchId === null) continue;
    const nQty = a.deductedQty != null ? Number(a.deductedQty) : a.qty != null ? Number(a.qty) : 0;
    if (!Number.isFinite(nQty) || nQty <= 0) continue;
    const code = a.batchCode ?? a.lotCode;
    out.push({
      batchId: String(batchId),
      batchCode: code,
      lotCode: a.lotCode ?? a.batchCode,
      qty: nQty,
    });
  }
  return out.length > 0 ? out : undefined;
}
