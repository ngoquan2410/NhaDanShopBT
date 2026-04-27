// Voucher definitions store. Lives outside React so the LocalVoucherAdapter
// can read it without importing component code, and the Admin Vouchers page
// can edit it via useSyncExternalStore.

import { useSyncExternalStore } from "react";
import type { Money } from "@/services/types";

export interface VoucherDef {
  id: string;
  code: string;
  ruleSummary: string;
  /** Minimum cart subtotal required to apply, in VND (0 = no minimum). */
  minSubtotal: Money;
  /** Discount percentage (0-100). 0 means a fixed-amount voucher. */
  percent: number;
  /** Cap for percent vouchers. 0 = no cap. */
  cap: Money;
  /** Fixed amount for non-percent vouchers (used when percent === 0). */
  fixedAmount: Money;
  /** Khi true: voucher miễn phí ship (giới hạn bởi `cap` nếu > 0). */
  freeShipping?: boolean;
  active: boolean;
  /** Optional ISO date (yyyy-mm-dd or full ISO). When set, voucher is invalid before this. */
  startAt?: string;
  /** Optional ISO date. When set, voucher is invalid after end-of-day on this date. */
  endAt?: string;
}

const STORAGE_KEY = "nhadan.vouchers.v3";

const defaults: VoucherDef[] = [
  { id: "v-nhadan10", code: "NHADAN10", ruleSummary: "Giảm 10% đơn hàng (tối đa 50.000đ)", minSubtotal: 0, percent: 10, cap: 50_000, fixedAmount: 0, active: true },
  { id: "v-nhadan20", code: "NHADAN20", ruleSummary: "Giảm 20% cho đơn từ 200.000đ (tối đa 100.000đ)", minSubtotal: 200_000, percent: 20, cap: 100_000, fixedAmount: 0, active: true },
  { id: "v-giam50k", code: "GIAM50K", ruleSummary: "Giảm 50.000đ cho đơn từ 300.000đ", minSubtotal: 300_000, percent: 0, cap: 0, fixedAmount: 50_000, active: true },
  { id: "v-freeship", code: "FREESHIP", ruleSummary: "Miễn phí giao hàng (tối đa 50.000đ)", minSubtotal: 0, percent: 0, cap: 50_000, fixedAmount: 0, freeShipping: true, active: true },
];

/** Returns true when the voucher's date window includes `now`. */
export function isWithinActiveWindow(v: VoucherDef, now: Date = new Date()): boolean {
  if (v.startAt) {
    const start = new Date(v.startAt);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (v.endAt) {
    const end = new Date(v.endAt);
    // Treat plain yyyy-mm-dd as end-of-day so the last day is fully usable.
    if (!Number.isNaN(end.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.endAt)) end.setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
  }
  return true;
}

/** Returns true when the code is already taken by a *different* voucher. */
export function isCodeTaken(code: string, excludeId?: string): boolean {
  const upper = code.trim().toUpperCase();
  if (!upper) return false;
  return state.some((v) => v.code.toUpperCase() === upper && v.id !== excludeId);
}

function load(): VoucherDef[] {
  if (typeof window === "undefined") return [...defaults];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...defaults];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaults];
    return parsed;
  } catch {
    return [...defaults];
  }
}

let state: VoucherDef[] = load();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}
function emit() {
  persist();
  listeners.forEach((l) => l());
}
function setState(next: VoucherDef[]) {
  state = next;
  emit();
}

const uid = () => `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function getVoucherDefs(): VoucherDef[] {
  return state;
}

export function findVoucherByCode(code: string): VoucherDef | undefined {
  const upper = code.trim().toUpperCase();
  return state.find((v) => v.code.toUpperCase() === upper);
}

export const voucherActions = {
  create(input: Omit<VoucherDef, "id">): VoucherDef {
    const v: VoucherDef = { ...input, id: uid(), code: input.code.trim().toUpperCase() };
    setState([v, ...state]);
    return v;
  },
  update(id: string, patch: Partial<VoucherDef>) {
    setState(state.map((v) => (v.id === id ? { ...v, ...patch, code: (patch.code ?? v.code).trim().toUpperCase() } : v)));
  },
  toggleActive(id: string) {
    setState(state.map((v) => (v.id === id ? { ...v, active: !v.active } : v)));
  },
  remove(id: string) {
    setState(state.filter((v) => v.id !== id));
  },
};

export function useVouchers(): VoucherDef[] {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
