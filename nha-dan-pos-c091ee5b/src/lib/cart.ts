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
}

function loadInitial(): CartState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return seed();
    return { items: parsed.items };
  } catch {
    return seed();
  }
}

// Seed with a few real catalog entries so the storefront has something to
// demo when a fresh visitor lands on /cart. IDs match src/lib/mock-data.ts.
function seed(): CartState {
  return {
    items: [
      {
        id: "ci-seed-1",
        productId: "1",
        variantId: "v1",
        productCode: "SP001",
        variantCode: "SP001-01",
        productName: "Mì Hảo Hảo",
        variantName: "Tôm chua cay",
        categoryId: "1",
        categoryName: "Thực phẩm khô",
        qty: 10,
        unitPrice: 5000,
        lineSubtotal: 50000,
        stock: 245,
      },
      {
        id: "ci-seed-2",
        productId: "2",
        variantId: "v4",
        productCode: "SP002",
        variantCode: "SP002-01",
        productName: "Coca-Cola",
        variantName: "Lon 330ml",
        categoryId: "2",
        categoryName: "Đồ uống",
        qty: 6,
        unitPrice: 10000,
        lineSubtotal: 60000,
        stock: 180,
      },
      {
        id: "ci-seed-3",
        productId: "3",
        variantId: "v7",
        productCode: "SP003",
        variantCode: "SP003-02",
        productName: "Sữa Vinamilk 100%",
        variantName: "Hộp 1L",
        categoryId: "4",
        categoryName: "Sữa & Chế phẩm",
        qty: 2,
        unitPrice: 32000,
        lineSubtotal: 64000,
        stock: 8,
      },
    ],
  };
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

export const cartActions = {
  add(input: Omit<CartItem, "id" | "lineSubtotal">) {
    setState((s) => {
      const existing = s.items.find(
        (i) => i.productId === input.productId && i.variantId === input.variantId,
      );
      if (existing) {
        return {
          items: s.items.map((i) =>
            i === existing
              ? recompute({ ...i, qty: Math.min((i.stock || Infinity), i.qty + input.qty) })
              : i,
          ),
        };
      }
      const item: CartItem = recompute({ ...input, id: uid(), lineSubtotal: 0 });
      return { items: [...s.items, item] };
    });
  },
  setQty(id: string, qty: number) {
    setState((s) => ({
      items: s.items.map((i) =>
        i.id === id ? recompute({ ...i, qty: Math.max(1, qty) }) : i,
      ),
    }));
  },
  remove(id: string) {
    setState((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
  clear() {
    setState(() => ({ items: [] }));
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, () => state.items, () => state.items);
}
