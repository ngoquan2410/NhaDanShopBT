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

export interface CartItem extends CartLine {
  /** Variant stock at time of add — used for over-stock warnings on Cart page. */
  stock: number;
}

interface CartState {
  items: CartItem[];
  selectedPromotionId?: string | null;
  selectedPromotionMode?: "auto" | "manual";
}

function loadInitial(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], selectedPromotionId: null, selectedPromotionMode: "auto" };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    const valid = parsed.items.filter(isBackendCartLine);
    if (valid.length !== parsed.items.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: valid, selectedPromotionId: parsed.selectedPromotionId ?? null }));
    }
    return {
      items: valid,
      selectedPromotionId: typeof parsed.selectedPromotionId === "string" ? parsed.selectedPromotionId : null,
      selectedPromotionMode: parsed.selectedPromotionMode === "manual" ? "manual" : "auto",
    };
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

export function getCartSnapshot(): CartItem[] {
  return state.items;
}

export function getSelectedPromotionId(): string | null {
  return state.selectedPromotionId ?? null;
}

export function getSelectedPromotionMode(): "auto" | "manual" {
  return state.selectedPromotionMode === "manual" ? "manual" : "auto";
}

export const cartActions = {
  add(input: Omit<CartItem, "id" | "lineSubtotal">) {
    if (!isBackendCartLine({ ...input, id: "check", lineSubtotal: 0 })) {
      throw new Error("Cart chỉ chấp nhận sản phẩm từ backend catalog");
    }
    setState((s) => {
      const existing = s.items.find(
        (i) => i.productId === input.productId && i.variantId === input.variantId,
      );
      if (existing) {
        return {
          ...s,
          items: s.items.map((i) =>
            i === existing
              ? recompute({ ...i, qty: Math.min((i.stock || Infinity), i.qty + input.qty) })
              : i,
          ),
        };
      }
      const item: CartItem = recompute({ ...input, id: uid(), lineSubtotal: 0 });
      return { ...s, items: [...s.items, item] };
    });
  },
  setQty(id: string, qty: number) {
    setState((s) => ({
      ...s,
      items: s.items.map((i) =>
        i.id === id ? recompute({ ...i, qty: Math.max(1, Math.min(i.stock ?? Number.MAX_SAFE_INTEGER, qty)) }) : i,
      ),
    }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
  },
  clear() {
    setState(() => ({ items: [], selectedPromotionId: null, selectedPromotionMode: "auto" }));
  },
  replace(items: CartItem[]) {
    const valid = items.filter(isBackendCartLine);
    setState((s) => ({ ...s, items: valid.map(recompute) }));
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
