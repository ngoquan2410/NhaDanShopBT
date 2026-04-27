import type {
  CreateGoodsReceiptInput,
  GoodsReceiptListParams,
  GoodsReceiptService,
} from "@/services/goodsReceipts/GoodsReceiptService";
import type {
  GoodsReceipt as CanonicalGoodsReceipt,
  GoodsReceiptLine as CanonicalGoodsReceiptLine,
  ID,
  PagedResult,
} from "@/services/types";
import {
  goodsReceipts as seed,
  mockReceiptLines,
  type GoodsReceiptLine as LegacyGoodsReceiptLine,
} from "@/lib/mock-data";

/**
 * FE-skeleton adapter. Goods receipts in the legacy mock store are read-only
 * seeds; we project them into the canonical shape on the way out so consumers
 * type against `services.goodsReceipts` only.
 *
 * `getLines` slices `mockReceiptLines` by `itemCount` (matches the legacy
 * drawer behaviour) and projects each row to the canonical shape, mapping
 * `discount` → `discountPercent`.
 *
 * `remove` mutates an in-memory `removedIds` set so the UI can drop rows
 * without faking persistence — the next reload reflects the removal until
 * the page is hard-refreshed. `createDraft` / `confirm` remain no-ops; the
 * legacy admin create flow still writes to `src/lib/store.ts`.
 */
function projectLegacyReceipt(r: typeof seed[number]): CanonicalGoodsReceipt {
  const subtotal = Math.max(0, r.totalCost - r.shippingFee - r.vat);
  return {
    id: r.id,
    number: r.number,
    date: r.date,
    status: r.status ?? "confirmed",
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    itemCount: r.itemCount,
    subtotal,
    shippingFee: r.shippingFee,
    vat: r.vat,
    totalCost: r.totalCost,
    note: r.note,
    canDelete: r.canDelete,
    deleteBlockReason: undefined,
  };
}

function projectLegacyLine(l: LegacyGoodsReceiptLine): CanonicalGoodsReceiptLine {
  return {
    id: l.id,
    variantCode: l.variantCode,
    productName: l.productName,
    variantName: l.variantName,
    importUnit: l.importUnit,
    piecesPerUnit: l.piecesPerUnit,
    quantity: l.quantity,
    unitCost: l.unitCost,
    discountPercent: l.discount,
    expiryDate: l.expiryDate,
    lineSubtotal: l.lineSubtotal,
    afterDiscount: l.afterDiscount,
    shippingAlloc: l.shippingAlloc,
    vatAlloc: l.vatAlloc,
    finalUnitCost: l.finalUnitCost,
  };
}

export class LocalGoodsReceiptAdapter implements GoodsReceiptService {
  private removedIds = new Set<ID>();

  async list(params?: GoodsReceiptListParams): Promise<PagedResult<CanonicalGoodsReceipt>> {
    let rows = seed
      .filter((r) => !this.removedIds.has(r.id))
      .map(projectLegacyReceipt);
    if (params?.status) rows = rows.filter((r) => r.status === params.status);
    if (params?.supplierId) rows = rows.filter((r) => r.supplierId === params.supplierId);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }
  async get(id: ID) {
    if (this.removedIds.has(id)) return null;
    const r = seed.find((x) => x.id === id);
    return r ? projectLegacyReceipt(r) : null;
  }
  async getLines(id: ID): Promise<CanonicalGoodsReceiptLine[]> {
    const r = seed.find((x) => x.id === id);
    if (!r) return [];
    const slice = mockReceiptLines.slice(
      0,
      Math.max(1, Math.min(r.itemCount, mockReceiptLines.length)),
    );
    return slice.map(projectLegacyLine);
  }
  async createDraft(_input: CreateGoodsReceiptInput): Promise<CanonicalGoodsReceipt> {
    throw new Error("createDraft: not implemented in FE skeleton — admin UI still writes to legacy store");
  }
  async confirm(_id: ID): Promise<CanonicalGoodsReceipt> {
    throw new Error("confirm: not implemented in FE skeleton — BE will own batch creation");
  }
  async remove(id: ID): Promise<void> {
    this.removedIds.add(id);
  }
}
