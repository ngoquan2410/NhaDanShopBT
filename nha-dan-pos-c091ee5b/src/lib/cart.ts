// Shared storefront cart store.
// Holds real productId / variantId so promotion scope (categories/products) and
// buy-x-get-y rules can match against actual catalog data. Persists to
// localStorage so the cart survives page reloads.
//
// React components subscribe via `useCart()`. Non-React code (services / utils)
// can read the snapshot via `getCartSnapshot()` if ever needed.

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/services/types";

const STORAGE_KEY = "nhadan.cart.v1";
/** Set when persisted cart qty was clamped on load — Cart page may show a one-shot toast. */
export const CART_QTY_ADJUSTED_SESSION_KEY = "nhadan.cart.qtyAdjustedOnLoad";

export type StorefrontAvailabilityStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface CartItem extends CartLine {
  /** Known stock from trusted/admin flows only. Public storefront catalog intentionally omits raw stock. */
  stock?: number;
  /** Explicit opt-in marker for preserving persisted stock; absent public cart stock is treated as unknown. */
  stockSource?: "trusted";
  /** Public-safe aggregate from catalog (`availableQty`); never raw batch/stockQty/remainingQty. */
  availableQty?: number;
  availabilityStatus?: StorefrontAvailabilityStatus;
  /** Sell unit label for availability copy (e.g. cái, Hũ). */
  sellUnit?: string;
}

interface CartState {
  items: CartItem[];
  selectedPromotionId?: string | null;
  selectedPromotionMode?: "auto" | "manual";
}

export function parseAvailableQty(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseAvailabilityStatus(raw: unknown): StorefrontAvailabilityStatus | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s === "IN_STOCK" || s === "LOW_STOCK" || s === "OUT_OF_STOCK") return s;
  return undefined;
}

/** Upper bound for cart quantity: public `availableQty` wins over trusted `stock`. */
export function getCartQuantityCap(line: Pick<CartItem, "availableQty" | "stock" | "stockSource">): number {
  const av = parseAvailableQty(line.availableQty);
  if (av !== undefined) return Math.max(0, av);
  if (line.stockSource === "trusted" && typeof line.stock === "number" && Number.isFinite(line.stock) && line.stock >= 0) {
    return Math.max(0, Math.floor(line.stock));
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Soft UI cap when catalog did not provide `availableQty` (public storefront unknown).
 * Merge-add paths do not apply this cap — only per-line qty adjustments via setQty / normalize.
 */
const UNKNOWN_CART_UI_MAX = 20;

export function clampCartQty(line: CartItem, qty: number): number {
  const cap = getCartQuantityCap(line);
  const q = Math.floor(Number(qty)) || 1;
  if (cap === Number.MAX_SAFE_INTEGER) {
    return Math.max(1, Math.min(UNKNOWN_CART_UI_MAX, q));
  }
  if (cap === 0) {
    return 1;
  }
  return Math.max(1, Math.min(cap, q));
}

/** Max value for QuantityStepper on cart row. */
export function getCartStepperMax(line: CartItem): number {
  const cap = getCartQuantityCap(line);
  if (cap === Number.MAX_SAFE_INTEGER) return UNKNOWN_CART_UI_MAX;
  return Math.max(1, cap);
}

function sanitizeAddInput(input: Omit<CartItem, "id" | "lineSubtotal">): Omit<CartItem, "id" | "lineSubtotal"> {
  const out: Omit<CartItem, "id" | "lineSubtotal"> = { ...input };
  if (out.stockSource !== "trusted") {
    delete out.stock;
    delete out.stockSource;
  }
  const av = parseAvailableQty(out.availableQty);
  if (av !== undefined) {
    out.availableQty = av;
  } else {
    delete out.availableQty;
  }
  const st = parseAvailabilityStatus(out.availabilityStatus);
  if (st) out.availabilityStatus = st;
  else delete out.availabilityStatus;
  if (out.sellUnit != null) out.sellUnit = String(out.sellUnit).trim() || undefined;
  return out;
}

function normalizePersistedCartLine(line: CartItem): CartItem {
  let out: CartItem = { ...line };
  if (out.stockSource !== "trusted") {
    delete out.stock;
    delete out.stockSource;
  }
  const av = parseAvailableQty(out.availableQty);
  if (av === undefined && Object.prototype.hasOwnProperty.call(out, "availableQty")) {
    const { availableQty: _a, ...rest } = out;
    out = rest as CartItem;
  } else if (av !== undefined) {
    out = { ...out, availableQty: av };
  }
  const st = parseAvailabilityStatus(out.availabilityStatus);
  if (st) out = { ...out, availabilityStatus: st };
  else {
    const { availabilityStatus: _s, ...rest } = out;
    out = rest as CartItem;
  }
  const clamped = clampCartQty(out, out.qty);
  if (clamped !== out.qty) {
    return recompute({ ...out, qty: clamped });
  }
  return out;
}

function loadInitial(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], selectedPromotionId: null, selectedPromotionMode: "auto" };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    let qtyAdjustedOnLoad = false;
    const valid = parsed.items.filter(isBackendCartLine).map((line) => {
      const n = normalizePersistedCartLine(line);
      if (n.qty !== line.qty) qtyAdjustedOnLoad = true;
      return n;
    });
    const nextState = {
      items: valid,
      selectedPromotionId: typeof parsed.selectedPromotionId === "string" ? parsed.selectedPromotionId : null,
      selectedPromotionMode: parsed.selectedPromotionMode === "manual" ? "manual" as const : "auto" as const,
    };
    if (qtyAdjustedOnLoad) {
      try {
        window.sessionStorage?.setItem(CART_QTY_ADJUSTED_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (valid.length !== parsed.items.length || JSON.stringify(valid) !== JSON.stringify(parsed.items)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }
    return nextState;
  } catch {
    return { items: [], selectedPromotionId: null, selectedPromotionMode: "auto" };
  }
}

export function isBackendCartLine(line: Partial<CartItem>): line is CartItem {
  return line.catalogSource === "backend"
    && line.schemaVersion === 2
    && typeof line.productId === "string"
    && /^\d+$/.test(line.productId)
    && typeof line.variantId === "string"
    && /^\d+$/.test(line.variantId)
    && Number.isFinite(line.qty)
    && line.qty > 0;
}

let state: CartState = loadInitial();
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
    /* ignore quota / private mode */
  }
}
function emit() {
  persist();
  listeners.forEach((l) => l());
}
function setState(updater: (s: CartState) => CartState) {
  state = updater(state);
  emit();
}

const uid = () => `ci-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function recompute(line: CartItem): CartItem {
  return { ...line, lineSubtotal: line.unitPrice * line.qty };
}

export function hasKnownCartStock(line: Pick<CartItem, "stock">): line is Pick<CartItem, "stock"> & { stock: number } {
  return Number.isFinite(line.stock);
}

export function getCartSnapshot(): CartItem[] {
  return state.items;
}

export function getSelectedPromotionId(): string | null {
  return state.selectedPromotionId ?? null;
}

export function getSelectedPromotionMode(): "auto" | "manual" {
  return state.selectedPromotionMode === "manual" ? "manual" : "auto";
}

function mergeAvailability(existing: CartItem, incoming: Omit<CartItem, "id" | "lineSubtotal">): Partial<Pick<CartItem, "availableQty" | "availabilityStatus" | "sellUnit">> {
  const patch: Partial<Pick<CartItem, "availableQty" | "availabilityStatus" | "sellUnit">> = {};
  const inAv = parseAvailableQty(incoming.availableQty);
  if (inAv !== undefined) patch.availableQty = inAv;
  else if (parseAvailableQty(existing.availableQty) !== undefined) patch.availableQty = existing.availableQty;
  const inSt = parseAvailabilityStatus(incoming.availabilityStatus);
  if (inSt) patch.availabilityStatus = inSt;
  else if (existing.availabilityStatus) patch.availabilityStatus = existing.availabilityStatus;
  if (incoming.sellUnit != null && String(incoming.sellUnit).trim()) patch.sellUnit = String(incoming.sellUnit).trim();
  else if (existing.sellUnit) patch.sellUnit = existing.sellUnit;
  return patch;
}

export const cartActions = {
  add(input: Omit<CartItem, "id" | "lineSubtotal">) {
    const cleaned = sanitizeAddInput(input);
    const av = parseAvailableQty(cleaned.availableQty);
    if (av === 0) {
      throw new Error("Sản phẩm đã hết hàng");
    }
    if (!isBackendCartLine({ ...cleaned, id: "check", lineSubtotal: 0 })) {
      throw new Error("Cart chỉ chấp nhận sản phẩm từ backend catalog");
    }
    setState((s) => {
      const existing = s.items.find(
        (i) => i.productId === cleaned.productId && i.variantId === cleaned.variantId,
      );
      if (existing) {
        const mergedBase: CartItem = {
          ...existing,
          ...cleaned,
          id: existing.id,
          lineSubtotal: existing.lineSubtotal,
          ...mergeAvailability(existing, cleaned),
        };
        const cap = getCartQuantityCap(mergedBase);
        const sum = existing.qty + cleaned.qty;
        const nextQty = cap === Number.MAX_SAFE_INTEGER ? sum : Math.min(cap, sum);
        return {
          ...s,
          items: s.items.map((i) =>
            i === existing
              ? recompute({ ...mergedBase, qty: Math.max(1, nextQty) })
              : i,
          ),
        };
      }
      const qty = clampCartQty({ ...cleaned, id: "tmp", lineSubtotal: 0 } as CartItem, cleaned.qty);
      const item: CartItem = recompute({ ...cleaned, id: uid(), lineSubtotal: 0, qty });
      const next = [...s.items, item];
      const resetPromo = s.items.length === 0;
      return {
        ...s,
        items: next,
        selectedPromotionId: resetPromo ? null : s.selectedPromotionId ?? null,
        selectedPromotionMode: resetPromo ? "auto" : (s.selectedPromotionMode ?? "auto"),
      };
    });
  },
  setQty(id: string, qty: number) {
    setState((s) => ({
      ...s,
      items: s.items.map((i) =>
        i.id === id ? recompute({ ...i, qty: clampCartQty(i, qty) }) : i,
      ),
    }));
  },
  remove(id: string) {
    setState((s) => ({
      ...s,
      items: s.items.filter((i) => i.id !== id),
      selectedPromotionId: null,
      selectedPromotionMode: "auto",
    }));
  },
  clear() {
    setState(() => ({ items: [], selectedPromotionId: null, selectedPromotionMode: "auto" }));
  },
  replace(items: CartItem[]) {
    const valid = items.filter(isBackendCartLine).map((i) => normalizePersistedCartLine(i));
    setState((s) => ({
      ...s,
      items: valid.map(recompute),
      selectedPromotionId: null,
      selectedPromotionMode: "auto",
    }));
  },
  setSelectedPromotionId(promotionId: string) {
    setState((s) => ({ ...s, selectedPromotionId: promotionId, selectedPromotionMode: "manual" }));
  },
  setSelectedPromotion(promotionId: string | null, mode: "auto" | "manual") {
    setState((s) => ({ ...s, selectedPromotionId: promotionId, selectedPromotionMode: mode }));
  },
  clearSelectedPromotion(mode: "auto" | "manual" = "auto") {
    setState((s) => ({ ...s, selectedPromotionId: null, selectedPromotionMode: mode }));
  },
  /**
   * Merge public batch availability into cart lines by variantId; clamp qty to cap.
   * @returns true if any line quantity was reduced.
   */
  mergePublicAvailabilityFromBatch(
    rows: Array<{ variantId: string | number; availableQty: number; availabilityStatus?: string; sellUnit?: string }>,
  ): boolean {
    const byVid = new Map<string, (typeof rows)[0]>();
    for (const r of rows) {
      byVid.set(String(r.variantId), r);
    }
    let clamped = false;
    setState((s) => {
      const nextItems = s.items.map((line) => {
        const u = byVid.get(line.variantId);
        if (!u) return line;
        const av = parseAvailableQty(u.availableQty);
        const st = parseAvailabilityStatus(u.availabilityStatus);
        const sellRaw = u.sellUnit != null ? String(u.sellUnit).trim() : "";
        const sellUnit = sellRaw || line.sellUnit;
        let next: CartItem = { ...line };
        if (av !== undefined) next = { ...next, availableQty: av };
        else {
          const { availableQty: _a, ...rest } = next;
          next = rest as CartItem;
        }
        if (st) next = { ...next, availabilityStatus: st };
        else {
          const { availabilityStatus: _s, ...rest } = next;
          next = rest as CartItem;
        }
        if (sellUnit) next = { ...next, sellUnit };
        const cq = clampCartQty(next, next.qty);
        if (cq !== line.qty) clamped = true;
        return recompute({ ...next, qty: cq });
      });
      return { ...s, items: nextItems };
    });
    return clamped;
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, () => state.items, () => state.items);
}

export function useSelectedPromotionId(): string | null {
  return useSyncExternalStore(subscribe, () => state.selectedPromotionId ?? null, () => state.selectedPromotionId ?? null);
}

export function useSelectedPromotionMode(): "auto" | "manual" {
  return useSyncExternalStore(
    subscribe,
    () => (state.selectedPromotionMode === "manual" ? "manual" : "auto"),
    () => (state.selectedPromotionMode === "manual" ? "manual" : "auto"),
  );
}
