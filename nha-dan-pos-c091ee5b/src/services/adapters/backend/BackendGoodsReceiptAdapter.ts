import { adminFetchJson } from "@/services/auth/adminApi";
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptListParams,
  GoodsReceiptService,
} from "@/services/goodsReceipts/GoodsReceiptService";
import type {
  GoodsReceipt,
  GoodsReceiptLine,
  ID,
  PagedResult,
} from "@/services/types";

const API = "/api/receipts";

/** Raw shapes from Spring (Jackson). */
type BeReceiptItem = {
  id: number;
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  discountedCost: number;
  vatPercent: number;
  vatAllocated: number;
  shippingAllocated: number;
  finalCost: number;
  finalCostWithVat: number;
  lineTotal: number;
  importUnitUsed: string;
  piecesUsed: number;
  retailQtyAdded: number;
  variantId: number | null;
  variantCode: string;
  variantName: string;
  sellUnit: string;
};

type BeReceipt = {
  id: number;
  receiptNo: string;
  receiptDate: string;
  supplierName: string | null;
  supplierId: number | null;
  note: string | null;
  totalAmount: number;
  shippingFee: number;
  totalVat: number;
  createdBy: string | null;
  items: BeReceiptItem[];
  status: string | null;
  canDelete: boolean;
  deleteBlockReason: string | null;
};

type SpringPage = {
  content: BeReceipt[];
  totalElements: number;
  size: number;
  number: number;
};

function mapReceiptDate(receiptDate: string): string {
  if (!receiptDate) return new Date(0).toISOString();
  if (receiptDate.length >= 10) return receiptDate.slice(0, 10);
  return receiptDate;
}

function mapLine(b: BeReceiptItem): GoodsReceiptLine {
  const retail = b.retailQtyAdded ?? 0;
  const afterLine =
    retail > 0
      ? Number(b.discountedCost) * retail
      : Number(b.lineTotal) * (1 - (Number(b.discountPercent) || 0) / 100);
  return {
    id: String(b.id),
    productCode: b.productCode,
    productName: b.productName,
    variantId: b.variantId != null ? String(b.variantId) : undefined,
    variantCode: b.variantCode,
    variantName: b.variantName,
    importUnit: b.importUnitUsed,
    piecesPerUnit: b.piecesUsed ?? 1,
    quantity: b.quantity,
    unitCost: b.unitCost,
    discountPercent: b.discountPercent,
    lineSubtotal: b.lineTotal,
    afterDiscount: afterLine,
    shippingAlloc: b.shippingAllocated * (retail > 0 ? retail : 1),
    vatAlloc: b.vatAllocated * (retail > 0 ? retail : 1),
    finalUnitCost: b.finalCostWithVat ?? b.finalCost,
  };
}

function mapReceipt(b: BeReceipt): GoodsReceipt {
  const grand = Number(b.totalAmount);
  const ship = Number(b.shippingFee ?? 0);
  const vat = Number(b.totalVat ?? 0);
  const sub = Math.max(0, grand - ship - vat);
  return {
    id: String(b.id),
    number: b.receiptNo,
    date: mapReceiptDate(b.receiptDate),
    status: (b.status as GoodsReceipt["status"]) || "confirmed",
    supplierId: b.supplierId != null ? String(b.supplierId) : "0",
    supplierName: b.supplierName ?? "",
    itemCount: b.items?.length ?? 0,
    subtotal: sub,
    shippingFee: ship,
    vat,
    totalCost: grand,
    note: b.note ?? undefined,
    createdBy: b.createdBy ?? undefined,
    canDelete: b.canDelete,
    deleteBlockReason: b.deleteBlockReason ?? undefined,
  };
}

/**
 * Admin JWT required. List uses Spring `page` 0-based and `size` (see InventoryReceiptController).
 */
export class BackendGoodsReceiptAdapter implements GoodsReceiptService {
  private buildListUrl(params?: GoodsReceiptListParams): string {
    const u = new URLSearchParams();
    const page1 = params?.page ?? 1;
    u.set("page", String(Math.max(0, page1 - 1)));
    u.set("size", String(params?.pageSize ?? 20));
    const from = params?.dateFrom ?? params?.dateRange?.from;
    const to = params?.dateTo ?? params?.dateRange?.to;
    if (from) u.set("from", from.length > 10 ? from.slice(0, 10) : from);
    if (to) u.set("to", to.length > 10 ? to.slice(0, 10) : to);
    const q = u.toString();
    return q ? `${API}?${q}` : API;
  }

  async list(params?: GoodsReceiptListParams): Promise<PagedResult<GoodsReceipt>> {
    if (params?.status && params.status !== "confirmed") {
      return {
        items: [],
        total: 0,
        page: params.page ?? 1,
        pageSize: params?.pageSize ?? 20,
      };
    }
    const raw = await adminFetchJson<SpringPage>(this.buildListUrl(params));
    if (!raw?.content) {
      return { items: [], total: 0, page: 1, pageSize: params?.pageSize ?? 20 };
    }
    return {
      items: raw.content.map(mapReceipt),
      total: raw.totalElements,
      page: (raw.number ?? 0) + 1,
      pageSize: raw.size,
    };
  }

  async get(id: ID): Promise<GoodsReceipt | null> {
    const raw = await adminFetchJson<BeReceipt | null>(
      `${API}/${encodeURIComponent(String(id))}`,
    );
    if (raw == null) return null;
    return mapReceipt(raw);
  }

  async getLines(id: ID): Promise<GoodsReceiptLine[]> {
    const full = await adminFetchJson<BeReceipt | null>(
      `${API}/${encodeURIComponent(String(id))}`,
    );
    if (!full?.items) return [];
    return full.items.map(mapLine);
  }

  async createDraft(_input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
    throw new Error(
      "createDraft: backend does not support draft/confirm; use the admin flow (POST is immediate stock-in) or the local store.",
    );
  }

  async confirm(_id: ID): Promise<GoodsReceipt> {
    throw new Error(
      "confirm: backend does not support draft/confirm; POST /api/receipts already confers stock",
    );
  }

  async remove(id: ID): Promise<void> {
    await adminFetchJson<Record<string, never>>(
      `${API}/${encodeURIComponent(String(id))}`,
      { method: "DELETE" },
    );
  }
}
