// Lightweight global mock-data store using React's useSyncExternalStore.
// Allows Categories / Products / Variants / Combos to share mutable local state
// across pages without a backend.

import { useSyncExternalStore } from "react";
import {
  categories as initialCategories,
  products as initialProducts,
  combos as initialCombos,
  customers as initialCustomers,
  suppliers as initialSuppliers,
  userAccounts as initialUsers,
  promotions as initialPromotionsRaw,
  invoices as initialInvoices,
  pendingOrders as initialPendingOrders,
  type Category,
  type Product,
  type ProductVariant,
  type Combo,
  type ComboItem,
  type Customer,
  type Supplier,
  type UserAccount,
  type Invoice,
  type PendingOrder,
} from "./mock-data";
import { localToday } from "./localDate";
import { migratePromotion, type Promotion } from "./promotions";

interface State {
  categories: Category[];
  products: Product[];
  combos: Combo[];
  customers: Customer[];
  suppliers: Supplier[];
  users: UserAccount[];
  promotions: Promotion[];
  invoices: Invoice[];
  pendingOrders: PendingOrder[];
}

let state: State = {
  categories: [...initialCategories],
  products: JSON.parse(JSON.stringify(initialProducts)),
  combos: JSON.parse(JSON.stringify(initialCombos)),
  customers: [...initialCustomers],
  suppliers: [...initialSuppliers],
  users: [...initialUsers],
  promotions: (initialPromotionsRaw as any[]).map((p) => migratePromotion({ ...p, id: p.id })),
  invoices: [...initialInvoices],
  pendingOrders: [...initialPendingOrders],
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => listeners.forEach((l) => l());
const setState = (updater: (s: State) => State) => {
  state = updater(state);
  emit();
};

export const useStore = () =>
  useSyncExternalStore(subscribe, () => state, () => state);

// Imperative read access for non-React consumers (e.g. service adapters).
export const getStoreState = (): State => state;

// External subscribe entry point — service adapters / hooks that need to fire
// reloads (e.g. `useService` consumers in admin lists) can hook into store
// mutations without going through React. Returns an unsubscribe function.
export const subscribeStore = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const uid = (prefix = "") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ===== Categories =====
export const categoryActions = {
  create(input: { name: string; description: string }) {
    const cat: Category = { id: uid("c"), name: input.name, description: input.description, active: true, productCount: 0 };
    setState((s) => ({ ...s, categories: [cat, ...s.categories] }));
    return cat;
  },
  update(id: string, patch: Partial<Category>) {
    setState((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  toggleActive(id: string) {
    setState((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, active: !c.active } : c)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
  },
};

// ===== Products =====
export const productActions = {
  create(input: Omit<Product, "id" | "variants"> & { variants?: ProductVariant[] }) {
    const product: Product = {
      ...input,
      id: uid("p"),
      variants: input.variants ?? [],
    };
    setState((s) => ({ ...s, products: [product, ...s.products] }));
    return product;
  },
  update(id: string, patch: Partial<Product>) {
    setState((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  },
  bulkAdd(items: Product[]) {
    setState((s) => ({ ...s, products: [...items, ...s.products] }));
  },
  // Variants
  addVariant(productId: string, variant: Omit<ProductVariant, "id">) {
    setState((s) => ({
      ...s,
      products: s.products.map((p) => {
        if (p.id !== productId) return p;
        const newV: ProductVariant = {
          ...variant,
          id: uid("v"),
          isSellable: variant.isSellable !== false,
        };
        let variants = [...p.variants, newV];
        if (newV.isDefault) variants = variants.map((v) => (v.id === newV.id ? v : { ...v, isDefault: false }));
        else if (variants.length === 1) variants = [{ ...newV, isDefault: true }];
        return { ...p, variants };
      }),
    }));
  },
  updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>) {
    setState((s) => ({
      ...s,
      products: s.products.map((p) => {
        if (p.id !== productId) return p;
        let variants = p.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v));
        if (patch.isDefault) variants = variants.map((v) => (v.id === variantId ? v : { ...v, isDefault: false }));
        return { ...p, variants };
      }),
    }));
  },
  setDefaultVariant(productId: string, variantId: string) {
    setState((s) => ({
      ...s,
      products: s.products.map((p) =>
        p.id !== productId ? p : { ...p, variants: p.variants.map((v) => ({ ...v, isDefault: v.id === variantId })) }
      ),
    }));
  },
  removeVariant(productId: string, variantId: string) {
    setState((s) => ({
      ...s,
      products: s.products.map((p) => {
        if (p.id !== productId) return p;
        const filtered = p.variants.filter((v) => v.id !== variantId);
        // If we removed the default, promote the first remaining one
        if (filtered.length > 0 && !filtered.some((v) => v.isDefault)) filtered[0].isDefault = true;
        return { ...p, variants: filtered };
      }),
    }));
  },
};

// ===== Combos =====
function computeDerivedStock(components: ComboItem[]): number {
  if (components.length === 0) return 0;
  return Math.min(
    ...components.map((c) => (c.quantity > 0 ? Math.floor(c.stock / c.quantity) : 0))
  );
}

export const comboActions = {
  create(input: { code: string; name: string; price: number; active: boolean; components: ComboItem[] }) {
    const combo: Combo = {
      id: uid("cb"),
      image: "",
      ...input,
      derivedStock: computeDerivedStock(input.components),
    };
    setState((s) => ({ ...s, combos: [combo, ...s.combos] }));
    return combo;
  },
  update(id: string, patch: Partial<Combo>) {
    setState((s) => ({
      ...s,
      combos: s.combos.map((c) => {
        if (c.id !== id) return c;
        const merged = { ...c, ...patch };
        merged.derivedStock = computeDerivedStock(merged.components);
        return merged;
      }),
    }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, combos: s.combos.filter((c) => c.id !== id) }));
  },
};

export { computeDerivedStock };

// ===== Customers =====
export const customerActions = {
  create(input: Omit<Customer, "id" | "code" | "totalPurchases" | "orderCount">) {
    const code = `KH${String(state.customers.length + 1).padStart(3, "0")}`;
    const c: Customer = { ...input, id: uid("kh"), code, totalPurchases: 0, orderCount: 0 };
    setState((s) => ({ ...s, customers: [c, ...s.customers] }));
    return c;
  },
  update(id: string, patch: Partial<Customer>) {
    setState((s) => ({ ...s, customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
  },
};

// ===== Suppliers =====
export const supplierActions = {
  create(input: Omit<Supplier, "id" | "code">) {
    const code = `NCC${String(state.suppliers.length + 1).padStart(3, "0")}`;
    const s: Supplier = { ...input, id: uid("ncc"), code };
    setState((st) => ({ ...st, suppliers: [s, ...st.suppliers] }));
    return s;
  },
  update(id: string, patch: Partial<Supplier>) {
    setState((s) => ({ ...s, suppliers: s.suppliers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, suppliers: s.suppliers.filter((x) => x.id !== id) }));
  },
};

// ===== Users =====
export const userActions = {
  create(input: Omit<UserAccount, "id" | "createdAt">) {
    const u: UserAccount = { ...input, id: uid("u"), createdAt: localToday() };
    setState((s) => ({ ...s, users: [u, ...s.users] }));
    return u;
  },
  update(id: string, patch: Partial<UserAccount>) {
    setState((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
  },
};


// ===== Promotions =====
export const promotionActions = {
  create(input: Omit<Promotion, "id">) {
    const p = { ...input, id: uid("promo") } as Promotion;
    setState((s) => ({ ...s, promotions: [p, ...s.promotions] }));
    return p;
  },
  update(id: string, next: Promotion) {
    setState((s) => ({ ...s, promotions: s.promotions.map((p) => (p.id === id ? next : p)) }));
  },
  upsert(promo: Promotion) {
    setState((s) => {
      if (promo.id && s.promotions.some((p) => p.id === promo.id)) {
        return { ...s, promotions: s.promotions.map((p) => (p.id === promo.id ? promo : p)) };
      }
      const withId = promo.id ? promo : { ...promo, id: uid("promo") };
      return { ...s, promotions: [withId as Promotion, ...s.promotions] };
    });
  },
  toggleActive(id: string) {
    setState((s) => ({ ...s, promotions: s.promotions.map((p) => (p.id === id ? { ...p, active: !p.active } : p)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, promotions: s.promotions.filter((p) => p.id !== id) }));
  },
};

// ===== Invoices (POS-generated) =====
export const invoiceActions = {
  create(input: Omit<Invoice, "id">): Invoice {
    const inv: Invoice = { ...input, id: uid("inv") };
    setState((s) => ({ ...s, invoices: [inv, ...s.invoices] }));
    return inv;
  },
  update(id: string, patch: Partial<Invoice>) {
    setState((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  },
  remove(id: string) {
    setState((s) => ({ ...s, invoices: s.invoices.filter((i) => i.id !== id) }));
  },
};

// Pending Orders are now owned by the service layer (`@/services` -> pendingOrders).
// The previous in-memory `pendingOrderActions` was removed; Checkout writes via
// `pendingOrders.create()` and PendingPayment reads via `pendingOrders.get()`.

