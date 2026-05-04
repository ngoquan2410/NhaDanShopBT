import type {
  CreateInvoiceInput,
  InvoiceService,
  InvoiceListParams,
} from "@/services/invoices/InvoiceService";
import type { Invoice } from "@/lib/mock-data";
import type { PagedResult, ID } from "@/services/types";
import { adminFetchJson } from "@/services/auth/adminApi";
import {
  mapSalesInvoiceApiJsonToInvoice,
  type BackendSalesInvoiceJson,
} from "@/services/adapters/backend/invoiceApiMapping";

type SpringPageJson = {
  content: BackendSalesInvoiceJson[];
  totalElements: number;
  totalPages?: number;
  last?: boolean;
  number?: number;
  size?: number;
};

const CHUNK_SIZE = 100;

function isoDayRolling(): string {
  return new Date().toISOString().slice(0, 10);
}

function backendPaymentFilterMatch(inv: Invoice, paymentType?: InvoiceListParams["paymentType"]): boolean {
  if (!paymentType) return true;
  return inv.paymentType === paymentType;
}

function applyInvoiceListFilters(rows: Invoice[], params?: InvoiceListParams): Invoice[] {
  let filtered = [...rows];
  const q = (params?.query ?? "").trim().toLowerCase();
  const customerId = params?.customerId;
  const paymentType = params?.paymentType;
  const status = params?.status;
  const fromMs = params?.dateRange?.from ? new Date(params.dateRange.from).getTime() : null;
  const toMs = params?.dateRange?.to ? new Date(params.dateRange.to).getTime() : null;

  filtered = filtered.filter((inv) => {
    if (status && inv.status !== status) return false;
    if (!backendPaymentFilterMatch(inv, paymentType)) return false;
    if (customerId && inv.customerId !== customerId) return false;
    if (fromMs != null && new Date(inv.date).getTime() < fromMs) return false;
    if (toMs != null && new Date(inv.date).getTime() > toMs) return false;
    if (q) {
      const hay = `${inv.number} ${inv.customerName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const rule = params?.sort?.[0];
  if (rule) {
    const dir = rule.direction === "desc" ? -1 : 1;
    const fieldVal = (inv: Invoice): string | number => {
      switch (rule.field) {
        case "date":
          return new Date(inv.date).getTime();
        case "customer":
          return inv.customerName;
        case "number":
          return inv.number;
        case "total":
          return inv.total;
        case "profit": {
          const p = inv.itemGrossProfit ?? inv.totalProfit;
          return Number.isFinite(Number(p)) ? Number(p) : NaN;
        }
        case "status":
          return inv.status;
        default:
          return String((inv as unknown as Record<string, unknown>)[rule.field] ?? "");
      }
    };
    filtered.sort((a, b) => {
      const av = fieldVal(a);
      const bv = fieldVal(b);
      if (typeof av === "number" && typeof bv === "number") {
        if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
        if (Number.isNaN(av)) return 1 * dir;
        if (Number.isNaN(bv)) return -1 * dir;
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  return filtered;
}

async function fetchAllMappedInvoices(params?: InvoiceListParams): Promise<Invoice[]> {
  const out: Invoice[] = [];
  const dr = params?.dateRange;
  let pageIdx = 0;

  for (;;) {
    const sp = new URLSearchParams();
    sp.set("page", String(pageIdx));
    sp.set("size", String(CHUNK_SIZE));
    sp.append("sort", "invoiceDate,desc");
    if (dr?.from && dr?.to) {
      sp.set("from", dr.from.slice(0, 10));
      sp.set("to", dr.to.slice(0, 10));
    } else {
      if (params?.status) sp.set("status", params.status);
      if (params?.query?.trim()) sp.set("q", params.query.trim());
    }

    const data = await adminFetchJson<SpringPageJson>(`/api/invoices?${sp.toString()}`);
    const batch = Array.isArray(data.content) ? data.content : [];
    if (batch.length === 0) break;
    out.push(...batch.map(mapSalesInvoiceApiJsonToInvoice));

    const totalPages = typeof data.totalPages === "number" ? data.totalPages : null;
    if (data.last === true) break;
    if (batch.length < CHUNK_SIZE) break;
    if (totalPages !== null && pageIdx + 1 >= totalPages) break;
    pageIdx += 1;
    if (pageIdx > 500) break;
  }

  return out;
}

export class BackendInvoiceAdapter implements InvoiceService {
  async create(_input: CreateInvoiceInput): Promise<Invoice> {
    throw new Error(
      "Không thể tạo hóa đơn qua InvoiceService ở chế độ backend. Dùng POS (quote + POST /api/invoices) hoặc xác nhận đơn chờ (POST /api/pending-orders/{id}/confirm).",
    );
  }

  async list(params?: InvoiceListParams): Promise<PagedResult<Invoice>> {
    const rawRows = await fetchAllMappedInvoices(params);
    const filtered = applyInvoiceListFilters(rawRows, params);
    const page = Math.max(1, params?.page ?? 1);
    let pageSize = params?.pageSize;
    if (pageSize === undefined || pageSize <= 0) {
      pageSize = Math.max(1, filtered.length || 1);
    }

    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, total: filtered.length, page, pageSize };
  }

  async get(id: ID): Promise<Invoice | null> {
    if (!id || (!/^\d+$/.test(String(id)) && !Number.isFinite(Number(id)))) return null;
    try {
      const raw = await adminFetchJson<BackendSalesInvoiceJson>(`/api/invoices/${encodeURIComponent(String(id))}`);
      return mapSalesInvoiceApiJsonToInvoice(raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b404\b/i.test(msg) || /kh[oô]ng t[ìi]m th[ấa]y/i.test(msg) || /not\s+found/i.test(msg))
        return null;
      throw e;
    }
  }

  async cancel(id: ID): Promise<Invoice> {
    const raw = await adminFetchJson<BackendSalesInvoiceJson>(`/api/invoices/${encodeURIComponent(String(id))}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    return mapSalesInvoiceApiJsonToInvoice(raw);
  }

  async remove(id: ID): Promise<void> {
    void id;
    throw new Error(
      "Hóa đơn backend không hỗ trợ xóa vật lý — dùng Hủy hóa đơn để hoàn kho và giữ lịch sử (PATCH /api/invoices/{id}/cancel).",
    );
  }
}
