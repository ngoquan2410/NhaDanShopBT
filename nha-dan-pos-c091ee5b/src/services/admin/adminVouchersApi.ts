/**
 * Admin voucher CRUD — backend source of truth (`/api/vouchers`).
 * Requires admin JWT via {@link adminFetchJson}.
 */

import { adminFetchJson } from "@/services/auth/adminApi";

/** Row as returned by Spring `VoucherResponse` (camelCase JSON). */
export type AdminVoucherRow = {
  id: number;
  code: string;
  ruleSummary: string | null;
  active: boolean;
  minSubtotal: number;
  percent: number;
  cap: number;
  fixedAmount: number;
  freeShipping: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SpringPage<T> = {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  size?: number;
  number?: number;
};

/** Normalize backend number-ish fields (BigDecimal may arrive as string). */
function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function parseAdminVoucherRow(raw: Record<string, unknown>): AdminVoucherRow {
  return {
    id: num(raw.id, -1),
    code: String(raw.code ?? ""),
    ruleSummary: raw.ruleSummary != null ? String(raw.ruleSummary) : null,
    active: bool(raw.active, false),
    minSubtotal: num(raw.minSubtotal),
    percent: num(raw.percent),
    cap: num(raw.cap),
    fixedAmount: num(raw.fixedAmount),
    freeShipping: bool(raw.freeShipping, false),
    startAt: raw.startAt != null ? String(raw.startAt) : null,
    endAt: raw.endAt != null ? String(raw.endAt) : null,
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

/** `yyyy-mm-dd` from ISO datetime or null */
export function toLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = iso.indexOf("T");
  return t > 0 ? iso.slice(0, t) : iso.slice(0, 10);
}

/** Start/end of local calendar day in ISO suitable for `LocalDateTime` (naive). */
export function dateInputToStartAt(isoDate: string): string | null {
  const s = isoDate.trim();
  if (!s) return null;
  return `${s}T00:00:00`;
}

export function dateInputToEndAt(isoDate: string): string | null {
  const s = isoDate.trim();
  if (!s) return null;
  return `${s}T23:59:59`;
}

export type AdminVoucherUpsertBody = {
  code: string;
  ruleSummary: string | null;
  active: boolean;
  minSubtotal: number;
  percent: number;
  cap: number;
  fixedAmount: number;
  freeShipping: boolean;
  startAt: string | null;
  endAt: string | null;
};

/**
 * Build JSON body for POST/PUT matching {@code VoucherRequest}.
 * When `freeShipping` is true, percent and fixedAmount are forced to 0 (aligns with client conflict rules).
 */
export function buildVoucherUpsertBody(input: AdminVoucherUpsertBody): Record<string, unknown> {
  const free = Boolean(input.freeShipping);
  const pct = free ? 0 : input.percent;
  const fix = free ? 0 : input.fixedAmount;
  return {
    code: input.code.trim(),
    ruleSummary: input.ruleSummary?.trim() || null,
    active: input.active,
    minSubtotal: input.minSubtotal,
    percent: pct,
    cap: input.cap,
    fixedAmount: fix,
    freeShipping: free,
    startAt: input.startAt,
    endAt: input.endAt,
  };
}

export async function fetchAdminVoucherPage(page = 0, size = 200): Promise<AdminVoucherRow[]> {
  const q = new URLSearchParams({ page: String(page), size: String(size), sort: "createdAt,desc" });
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/vouchers?${q.toString()}`);
  const content = raw.content as unknown[] | undefined;
  if (!Array.isArray(content)) return [];
  return content.map((row) => parseAdminVoucherRow(row as Record<string, unknown>));
}

export async function createAdminVoucher(body: Record<string, unknown>): Promise<AdminVoucherRow> {
  const raw = await adminFetchJson<Record<string, unknown>>("/api/vouchers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return parseAdminVoucherRow(raw);
}

export async function updateAdminVoucher(id: number, body: Record<string, unknown>): Promise<AdminVoucherRow> {
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/vouchers/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return parseAdminVoucherRow(raw);
}

export async function toggleAdminVoucherActive(id: number): Promise<AdminVoucherRow> {
  const raw = await adminFetchJson<Record<string, unknown>>(`/api/vouchers/${id}/toggle`, {
    method: "PATCH",
  });
  return parseAdminVoucherRow(raw);
}

export async function deleteAdminVoucher(id: number): Promise<void> {
  await adminFetchJson<unknown>(`/api/vouchers/${id}`, { method: "DELETE" });
}
