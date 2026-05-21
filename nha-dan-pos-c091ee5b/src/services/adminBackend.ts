import { adminFetchJson, downloadAdminBlob } from "@/services/auth/adminApi";
import type {
  Combo,
  ComboItem,
  Customer,
  InventoryReportRow,
  ProfitRow,
  RevenueRow,
  StockAdjustment,
  StockAdjustmentLine,
  Supplier,
  UserAccount,
} from "@/lib/mock-data";

type Page<T> = {
  content?: T[];
  totalElements?: number;
  size?: number;
  number?: number;
};

export type CategoryRevenueSeriesRow = {
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  categoryId: string;
  categoryName: string;
  revenue: number;
};

/** Normalize Spring Data `Page` JSON to a content array. */
export function toPageItems<T>(raw: Page<T> | T[] | null | undefined): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const c = raw.content;
  return Array.isArray(c) ? c : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function appendNumericProductIds(params: URLSearchParams, productIds?: string[]) {
  for (const id of productIds ?? []) {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) params.append("productIds", String(Math.trunc(n)));
  }
}

function mapCustomer(raw: Record<string, unknown>): Customer {
  const group = asString(raw.group, "RETAIL").toLowerCase();
  return {
    id: asString(raw.id),
    code: asString(raw.code),
    name: asString(raw.name),
    phone: asString(raw.phone),
    email: (raw.email as string | undefined) ?? undefined,
    group: group === "vip" || group === "wholesale" ? group : "retail",
    active: raw.active !== false,
    totalPurchases: asNumber(raw.totalSpend),
    orderCount: asNumber(raw.orderCount),
  };
}

function mapSupplier(raw: Record<string, unknown>): Supplier {
  return {
    id: asString(raw.id),
    code: asString(raw.code),
    name: asString(raw.name),
    phone: asString(raw.phone),
    address: asString(raw.address),
    taxCode: asString(raw.taxCode),
    email: asString(raw.email),
    note: (raw.note as string | undefined) ?? undefined,
    active: raw.active !== false,
  };
}

function mapUser(raw: Record<string, unknown>): UserAccount {
  const roles = Array.isArray(raw.roles) ? raw.roles.map(String) : [];
  const backendRoleName = roles[0] ?? "ROLE_STAFF";
  const role = backendRoleName === "ROLE_ADMIN" || roles.includes("admin") ? "admin" : "staff";
  const roleDisplayLabel = backendRoleName === "ROLE_ADMIN"
    ? "Admin"
    : backendRoleName === "ROLE_STAFF"
      ? "Nhân viên"
      : backendRoleName === "ROLE_USER" || backendRoleName === "ROLE_CUSTOMER"
        ? "Khách hàng"
        : backendRoleName;
  const assignableRole = backendRoleName === "ROLE_ADMIN" || backendRoleName === "ROLE_STAFF";
  return {
    id: asString(raw.id),
    username: asString(raw.username),
    fullName: asString(raw.fullName, asString(raw.username)),
    role,
    backendRoleName,
    roleDisplayLabel,
    assignableRole,
    active: raw.isActive !== false && raw.active !== false,
    totpEnabled: Boolean(raw.totpEnabled),
    createdAt: asString(raw.createdAt, new Date(0).toISOString()),
    lastLogin: (raw.lastLogin as string | undefined) ?? undefined,
  };
}

export type AdminRoleOption = {
  id: string;
  name: string;
  label: string;
  description?: string;
};

function mapCombo(raw: Record<string, unknown>): Combo {
  const itemsRaw = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const components: ComboItem[] = itemsRaw.map((item) => ({
    productId: asString(item.productId),
    variantId: "",
    productName: asString(item.productName),
    variantName: "Biến thể mặc định",
    quantity: asNumber(item.quantity, 1),
    stock: asNumber(raw.stockQty),
  }));
  return {
    id: asString(raw.id),
    code: asString(raw.code),
    name: asString(raw.name),
    image: asString(raw.imageUrl),
    price: asNumber(raw.sellPrice),
    active: raw.active !== false,
    components,
    derivedStock: asNumber(raw.stockQty),
    defaultVariantId: raw.defaultVariantId != null ? asString(raw.defaultVariantId) : undefined,
  };
}

function mapStockAdjustment(raw: Record<string, unknown>): StockAdjustment {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const status = asString(raw.status).toLowerCase() === "draft" ? "draft" : "confirmed";
  return {
    id: asString(raw.id),
    code: asString(raw.adjNo, asString(raw.code)),
    createdDate: asString(raw.adjDate, asString(raw.createdAt)),
    reason: asString(raw.reason),
    note: asString(raw.note),
    itemCount: items.length,
    status,
    createdBy: (raw.createdBy as string | undefined) ?? undefined,
    reversedAt: raw.reversedAt != null ? asString(raw.reversedAt) : undefined,
    reversalAdjustmentId: raw.reversalAdjustmentId != null ? asString(raw.reversalAdjustmentId) : undefined,
    reversesAdjustmentId: raw.reversesAdjustmentId != null ? asString(raw.reversesAdjustmentId) : undefined,
  };
}

function mapStockAdjustmentLine(raw: Record<string, unknown>): StockAdjustmentLine {
  return {
    id: asString(raw.id),
    variantCode: asString(raw.variantCode),
    productName: asString(raw.productName),
    variantName: asString(raw.variantName),
    systemQty: asNumber(raw.systemQty),
    actualQty: asNumber(raw.actualQty),
    difference: asNumber(raw.diffQty, asNumber(raw.actualQty) - asNumber(raw.systemQty)),
    note: asString(raw.note),
  };
}

export const adminCustomers = {
  async list(params?: {
    q?: string;
    group?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Customer[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    qs.set("page", String(Math.max(0, (params?.page ?? 1) - 1)));
    qs.set("size", String(Math.min(100, Math.max(1, params?.pageSize ?? 20))));
    if (params?.q?.trim()) qs.set("q", params.q.trim());
    if (params?.group) qs.set("group", params.group);
    const raw = await adminFetchJson<Page<Record<string, unknown>>>(`/api/customers?${qs.toString()}`);
    const items = toPageItems(raw).map(mapCustomer);
    const total = typeof raw?.totalElements === "number" ? raw.totalElements : items.length;
    const pageSize = typeof raw?.size === "number" ? raw.size : Number(qs.get("size"));
    const page = typeof raw?.number === "number" ? raw.number + 1 : (params?.page ?? 1);
    return { items, total, page, pageSize };
  },
  async save(input: Partial<Customer> & Pick<Customer, "name" | "phone">): Promise<Customer> {
    const body = {
      code: input.code || null,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      group: (input.group ?? "retail").toUpperCase(),
      active: input.active ?? true,
    };
    const raw = await adminFetchJson<Record<string, unknown>>(
      input.id ? `/api/customers/${encodeURIComponent(input.id)}` : "/api/customers",
      { method: input.id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    return mapCustomer(raw);
  },
  async remove(id: string): Promise<void> {
    await adminFetchJson(`/api/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const adminSuppliers = {
  async list(params?: { q?: string; page?: number; pageSize?: number }): Promise<{
    items: Supplier[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qs = new URLSearchParams();
    qs.set("page", String(Math.max(0, (params?.page ?? 1) - 1)));
    qs.set("size", String(Math.min(100, Math.max(1, params?.pageSize ?? 20))));
    if (params?.q?.trim()) qs.set("q", params.q.trim());
    const raw = await adminFetchJson<Page<Record<string, unknown>>>(`/api/suppliers?${qs.toString()}`);
    const items = toPageItems(raw).map(mapSupplier);
    const total = typeof raw?.totalElements === "number" ? raw.totalElements : items.length;
    const pageSize = typeof raw?.size === "number" ? raw.size : Number(qs.get("size"));
    const page = typeof raw?.number === "number" ? raw.number + 1 : (params?.page ?? 1);
    return { items, total, page, pageSize };
  },
  async save(input: Partial<Supplier> & Pick<Supplier, "name">): Promise<Supplier> {
    const body = {
      code: input.code || null,
      name: input.name,
      phone: input.phone || null,
      address: input.address || null,
      taxCode: input.taxCode || null,
      email: input.email || null,
      note: input.note || null,
      active: input.active ?? true,
    };
    const raw = await adminFetchJson<Record<string, unknown>>(
      input.id ? `/api/suppliers/${encodeURIComponent(input.id)}` : "/api/suppliers",
      { method: input.id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    return mapSupplier(raw);
  },
  async remove(id: string): Promise<void> {
    await adminFetchJson(`/api/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const adminUsers = {
  async list(params?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: UserAccount[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    qs.set("page", String(Math.max(0, (params?.page ?? 1) - 1)));
    qs.set("size", String(Math.min(100, Math.max(1, params?.pageSize ?? 20))));
    if (params?.search?.trim()) qs.set("search", params.search.trim());
    const raw = await adminFetchJson<Page<Record<string, unknown>>>(`/api/admin/users?${qs.toString()}`);
    const items = toPageItems(raw).map(mapUser);
    const total = typeof raw?.totalElements === "number" ? raw.totalElements : items.length;
    const pageSize = typeof raw?.size === "number" ? raw.size : Number(qs.get("size"));
    const page = typeof raw?.number === "number" ? raw.number + 1 : (params?.page ?? 1);
    return { items, total, page, pageSize };
  },
  async save(
    input: Partial<UserAccount> & Pick<UserAccount, "fullName"> & { password?: string; roleName?: string },
  ): Promise<UserAccount> {
    const resolvedRoleName = input.roleName
      ?? (input.role === "admin" ? "ROLE_ADMIN" : input.role === "staff" ? "ROLE_STAFF" : undefined);
    if (!resolvedRoleName) {
      throw new Error("Thiếu vai trò hợp lệ để lưu người dùng");
    }
    const roles = [resolvedRoleName];
    const body = input.id
      ? { fullName: input.fullName, isActive: input.active ?? true, roles, password: input.password || undefined }
      : { username: input.username, password: input.password || "changeme123", fullName: input.fullName, roles };
    const raw = await adminFetchJson<Record<string, unknown>>(
      input.id ? `/api/admin/users/${encodeURIComponent(input.id)}` : "/api/admin/users",
      { method: input.id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    return mapUser(raw);
  },
  async remove(id: string): Promise<void> {
    await adminFetchJson(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const adminRoles = {
  async list(): Promise<AdminRoleOption[]> {
    const rows = await adminFetchJson<Record<string, unknown>[]>("/api/admin/roles");
    return rows.map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      label: asString(row.label, asString(row.name)),
      description: row.description == null ? undefined : asString(row.description),
    }));
  },
};

export const adminCombos = {
  async list(activeOnly = false): Promise<Combo[]> {
    const path = activeOnly ? "/api/combos/active" : "/api/combos";
    const rows = await adminFetchJson<Record<string, unknown>[]>(path);
    return rows.map(mapCombo);
  },
  async save(input: Partial<Combo> & Pick<Combo, "name" | "price" | "components">): Promise<Combo> {
    const body = {
      code: input.code || null,
      name: input.name,
      description: null,
      sellPrice: input.price,
      active: input.active ?? true,
      imageUrl: input.image || null,
      categoryId: null,
      items: input.components.map((c) => ({ productId: Number(c.productId), quantity: c.quantity })),
    };
    const raw = await adminFetchJson<Record<string, unknown>>(
      input.id ? `/api/combos/${encodeURIComponent(input.id)}` : "/api/combos",
      { method: input.id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    return mapCombo(raw);
  },
  async toggle(id: string): Promise<Combo> {
    return mapCombo(await adminFetchJson<Record<string, unknown>>(`/api/combos/${encodeURIComponent(id)}/toggle`, { method: "PATCH" }));
  },
  async remove(id: string): Promise<void> {
    await adminFetchJson(`/api/combos/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const adminStockAdjustments = {
  async list(params?: {
    search?: string;
    status?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: StockAdjustment[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    qs.set("page", String(Math.max(0, (params?.page ?? 1) - 1)));
    qs.set("size", String(Math.min(100, Math.max(1, params?.pageSize ?? 20))));
    if (params?.search?.trim()) qs.set("search", params.search.trim());
    if (params?.status) qs.set("status", params.status);
    const raw = await adminFetchJson<Page<Record<string, unknown>>>(`/api/stock-adjustments?${qs.toString()}`);
    const items = toPageItems(raw).map(mapStockAdjustment);
    const total = typeof raw?.totalElements === "number" ? raw.totalElements : items.length;
    const pageSize = typeof raw?.size === "number" ? raw.size : Number(qs.get("size"));
    const page = typeof raw?.number === "number" ? raw.number + 1 : (params?.page ?? 1);
    return { items, total, page, pageSize };
  },
  async getOne(id: string): Promise<StockAdjustment> {
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/stock-adjustments/${encodeURIComponent(id)}`);
    return mapStockAdjustment(raw);
  },
  async getLines(id: string): Promise<StockAdjustmentLine[]> {
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/stock-adjustments/${encodeURIComponent(id)}`);
    const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
    return items.map(mapStockAdjustmentLine);
  },
  async reverse(id: string, payload?: { reason?: string | null }): Promise<StockAdjustment> {
    const trimmed = payload?.reason != null ? String(payload.reason).trim() : "";
    const body = trimmed !== "" ? JSON.stringify({ reason: trimmed }) : JSON.stringify({});
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/stock-adjustments/${encodeURIComponent(id)}/reverse`, {
      method: "POST",
      body,
    });
    return mapStockAdjustment(raw);
  },
};

export const adminReports = {
  async inventory(from: string, to: string): Promise<InventoryReportRow[]> {
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/reports/inventory?from=${from}&to=${to}`);
    const rows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.items) ? raw.items : [];
    return (rows as Record<string, unknown>[]).map((r) => ({
      variantCode: asString(r.variantCode),
      productName: asString(r.productName),
      variantName: asString(r.variantName),
      categoryName: asString(r.categoryName),
      unit: asString(r.unit, asString(r.sellUnit)),
      openingStock: asNumber(r.openingStock),
      received: asNumber(r.received, asNumber(r.totalReceived)),
      sold: asNumber(r.sold, asNumber(r.totalSold)),
      adjusted: asNumber(r.totalAdjusted, asNumber(r.adjusted)),
      closingStock: asNumber(r.closingStock),
      closingValue: asNumber(r.closingValue, asNumber(r.closingStockValue)),
    }));
  },
  async revenue(from: string, to: string, period: string, productIds?: string[]): Promise<RevenueRow[]> {
    const params = new URLSearchParams({ from, to, period });
    appendNumericProductIds(params, productIds);
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/revenue/total?${params}`);
    const rows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.items) ? raw.items : Array.isArray(raw.series) ? raw.series : [];
    return (rows as Record<string, unknown>[]).map((r) => ({
      period: asString(r.period, asString(r.label)),
      revenue: asNumber(r.revenue, asNumber(r.amount)),
      invoiceCount: asNumber(r.invoiceCount),
      itemsSold: asNumber(r.itemsSold, asNumber(r.quantitySold)),
    }));
  },
  async revenueByProduct(from: string, to: string, period = "daily", productIds?: string[]) {
    const params = new URLSearchParams({ from, to, period });
    appendNumericProductIds(params, productIds);
    return adminFetchJson<Record<string, unknown>[]>(`/api/revenue/by-product?${params}`);
  },
  async revenueByCategory(from: string, to: string, period = "daily") {
    return adminFetchJson<Record<string, unknown>[]>(`/api/revenue/by-category?from=${from}&to=${to}&period=${period}`);
  },
  async revenueByCategorySeries(from: string, to: string, period = "daily", categoryIds?: string[]): Promise<CategoryRevenueSeriesRow[]> {
    const params = new URLSearchParams({ from, to, period });
    const numericIds = (categoryIds ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => String(Math.trunc(id)));
    if (numericIds.length > 0) params.set("categoryIds", numericIds.join(","));
    const raw = await adminFetchJson<Record<string, unknown>[]>(`/api/revenue/by-category-series?${params}`);
    return raw.map((r) => ({
      periodKey: asString(r.periodKey),
      periodLabel: asString(r.periodLabel, asString(r.periodKey)),
      periodStart: asString(r.periodStart),
      periodEnd: asString(r.periodEnd),
      categoryId: asString(r.categoryId),
      categoryName: asString(r.categoryName, "Unknown/Legacy Category"),
      revenue: asNumber(r.revenue),
    }));
  },
  async profit(from: string, to: string, productIds?: string[]): Promise<ProfitRow[]> {
    const params = new URLSearchParams({ from, to });
    appendNumericProductIds(params, productIds);
    const raw = await adminFetchJson<Record<string, unknown>>(`/api/reports/profit?${params}`);
    const revenue = asNumber(raw.totalRevenue);
    const profit = asNumber(raw.totalProfit);
    const invoiceCount = asNumber(raw.totalInvoices, asNumber(raw.invoiceCount));
    /** No sales in range — omit margin instead of collapsing null → fake 0% */
    const hasPeriodActivity = invoiceCount > 0 || revenue !== 0 || profit !== 0;
    const margin = hasPeriodActivity
      ? asNumber(raw.profitMarginPct, asNumber(raw.margin, asNumber(raw.profitMargin)))
      : undefined;
    return [{
      period: `${from} - ${to}`,
      revenue,
      cost: asNumber(raw.totalCost, asNumber(raw.totalCogs)),
      profit,
      ...(margin !== undefined ? { margin } : {}),
      invoiceCount,
    }];
  },
  async profitSeries(from: string, to: string, group: "daily" | "weekly" | "monthly", productIds?: string[]): Promise<ProfitRow[]> {
    if (group === "daily" || group === "weekly" || group === "monthly") {
      const params = new URLSearchParams({ from, to });
      appendNumericProductIds(params, productIds);
      const raw = await adminFetchJson<Record<string, unknown>[]>(`/api/reports/profit/${group}?${params}`);
      return raw.map((r) => {
        const revenue = asNumber(r.totalRevenue);
        const profit = asNumber(r.totalProfit);
        const invoiceCount = asNumber(r.totalInvoices, asNumber(r.invoiceCount));
        const margin = invoiceCount > 0 || revenue !== 0 || profit !== 0
          ? asNumber(r.profitMarginPct, asNumber(r.margin, asNumber(r.profitMargin)))
          : undefined;
        const fromDate = asString(r.fromDate, from);
        const toDate = asString(r.toDate, to);
        return {
          period: `${fromDate} - ${toDate}`,
          revenue,
          cost: asNumber(r.totalCost, asNumber(r.totalCogs)),
          profit,
          ...(margin !== undefined ? { margin } : {}),
          invoiceCount,
        };
      });
    }
    return this.profit(from, to, productIds);
  },
  async downloadInventoryExcel(
    from: string,
    to: string,
    filters?: {
      keyword?: string;
      categoryId?: number;
      categoryName?: string;
      sort?: string;
    },
  ): Promise<void> {
    const params = new URLSearchParams({ from, to });
    if (filters?.keyword != null && filters.keyword.trim() !== "") {
      params.set("keyword", filters.keyword.trim());
    }
    if (filters?.categoryId != null && Number.isFinite(filters.categoryId)) {
      params.set("categoryId", String(filters.categoryId));
    }
    if (filters?.categoryName != null && filters.categoryName.trim() !== "") {
      params.set("categoryName", filters.categoryName.trim());
    }
    if (filters?.sort != null && filters.sort.trim() !== "") {
      params.set("sort", filters.sort.trim());
    }
    await downloadAdminBlob(
      `/api/reports/inventory/export?${params.toString()}`,
      `TonKho_${from}_${to}.xlsx`,
    );
  },
  async downloadRevenueTotalExcel(from: string, to: string, period: string): Promise<void> {
    const q = new URLSearchParams({ from, to, period });
    await downloadAdminBlob(`/api/revenue/total/export?${q}`, `DoanhThu_${from}_${to}.xlsx`);
  },
  async downloadProfitExcel(from: string, to: string): Promise<void> {
    await downloadAdminBlob(
      `/api/reports/profit/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      `LoiNhuan_${from}_${to}.xlsx`,
    );
  },
};
