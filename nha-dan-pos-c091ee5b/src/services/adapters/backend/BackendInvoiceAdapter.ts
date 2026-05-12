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

function backendPaymentFilterMatch(inv: Invoice, paymentType?: InvoiceListParams["paymentType"]): boolean {
  if (!paymentType) return true;
  return inv.paymentType === paymentType;
}

function springSortParam(params?: InvoiceListParams): string {
  const rule = params?.sort?.[0];
  const dir = rule?.direction === "asc" ? "asc" : "desc";
  switch (rule?.field) {
    case "number":
      return `invoiceNo,${dir}`;
    case "date":
      return `invoiceDate,${dir}`;
    case "customer":
      return `customerName,${dir}`;
    case "total":
      return `totalAmount,${dir}`;
    case "status":
      return `status,${dir}`;
    default:
      return `invoiceDate,desc`;
  }
}

export class BackendInvoiceAdapter implements InvoiceService {
  async create(_input: CreateInvoiceInput): Promise<Invoice> {
    throw new Error(
      "Không thể tạo hóa đơn qua InvoiceService ở chế độ backend. Dùng POS (quote + POST /api/invoices) hoặc xác nhận đơn chờ (POST /api/pending-orders/{id}/confirm).",
    );
  }

  async list(params?: InvoiceListParams): Promise<PagedResult<Invoice>> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const sp = new URLSearchParams();
    sp.set("page", String(page - 1));
    sp.set("size", String(pageSize));
    sp.append("sort", springSortParam(params));
    const dr = params?.dateRange;
    if (dr?.from && dr?.to) {
      sp.set("from", dr.from.slice(0, 10));
      sp.set("to", dr.to.slice(0, 10));
    }
    if (params?.status) sp.set("status", params.status);
    if (params?.query?.trim()) sp.set("q", params.query.trim());
    if (params?.customerId) sp.set("customerId", String(params.customerId));

    const data = await adminFetchJson<SpringPageJson>(`/api/invoices?${sp.toString()}`);
    let items = (Array.isArray(data.content) ? data.content : []).map(mapSalesInvoiceApiJsonToInvoice);
    if (params?.paymentType) {
      items = items.filter((i) => backendPaymentFilterMatch(i, params.paymentType));
    }
    return {
      items,
      total: Number(data.totalElements ?? items.length),
      page: Number(data.number ?? page - 1) + 1,
      pageSize: Number(data.size ?? pageSize),
    };
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
