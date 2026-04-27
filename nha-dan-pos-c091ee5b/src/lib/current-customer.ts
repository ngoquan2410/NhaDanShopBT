// Per-device "current customer" reference for the storefront.
// Stores only the customerId in localStorage; the actual record lives in
// CustomerService (LocalCustomerAdapter). On first use, lazily creates a
// blank profile so /account always has something to render.
//
// IMPORTANT: This is presentation-layer glue only. The CustomerService
// remains the source of truth for customer data and points history.

import { useEffect, useState, useSyncExternalStore } from "react";
import { customers } from "@/services";
import type { Customer, ShippingAddress } from "@/services/types";

const KEY_CURRENT_ID = "ndshop:current_customer_id";
const KEY_DEFAULT_ADDR = "ndshop:current_customer_default_addr";

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => listeners.forEach((l) => l());

let cachedId: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(KEY_CURRENT_ID) : null;
let cachedAddr: ShippingAddress | null = readDefaultAddress();

function readDefaultAddress(): ShippingAddress | null {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(KEY_DEFAULT_ADDR)
        : null;
    if (!raw) return null;
    return JSON.parse(raw) as ShippingAddress;
  } catch {
    return null;
  }
}

async function ensureCustomerId(): Promise<string> {
  if (cachedId) return cachedId;
  // Lazily create a blank profile.
  const created = await customers.upsert({
    id: "",
    name: "",
    phone: "",
    points: 0,
  } as Customer);
  cachedId = created.id;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_CURRENT_ID, created.id);
  }
  emit();
  return created.id;
}

export const currentCustomerActions = {
  /** Returns the persistent id for this device, creating a profile if needed. */
  async getOrCreateId(): Promise<string> {
    return ensureCustomerId();
  },
  async get(): Promise<Customer | null> {
    if (!cachedId) return null;
    return customers.get(cachedId);
  },
  async save(patch: Partial<Customer>): Promise<Customer> {
    const id = await ensureCustomerId();
    const existing = (await customers.get(id)) ?? ({
      id,
      name: "",
      phone: "",
      points: 0,
    } as Customer);
    const next: Customer = { ...existing, ...patch, id };
    const saved = await customers.upsert(next);
    emit();
    return saved;
  },
  saveDefaultAddress(addr: ShippingAddress | null) {
    cachedAddr = addr;
    if (typeof window !== "undefined") {
      if (addr) window.localStorage.setItem(KEY_DEFAULT_ADDR, JSON.stringify(addr));
      else window.localStorage.removeItem(KEY_DEFAULT_ADDR);
    }
    emit();
  },
  getDefaultAddress(): ShippingAddress | null {
    return cachedAddr;
  },
  /**
   * Switch the device pointer to an existing customer profile WITHOUT touching
   * the underlying records. Useful for quickly testing multiple users on one
   * browser. Also pulls that customer's saved address (if any) into cache.
   */
  async switchTo(customerId: string): Promise<void> {
    const c = await customers.get(customerId);
    if (!c) throw new Error("Customer not found");
    cachedId = customerId;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_CURRENT_ID, customerId);
      // Default address is per-device; clear so the next checkout pre-fills
      // from this customer's most recent order, not the previous user's data.
      window.localStorage.removeItem(KEY_DEFAULT_ADDR);
    }
    cachedAddr = null;
    emit();
  },
  /**
   * Create a brand-new blank profile and switch to it. The previous profile
   * stays intact in CustomerService so the user can switch back later.
   */
  async createAndSwitch(name = "", phone = ""): Promise<Customer> {
    const created = await customers.upsert({
      id: "",
      name,
      phone,
      points: 0,
    } as Customer);
    cachedId = created.id;
    cachedAddr = null;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_CURRENT_ID, created.id);
      window.localStorage.removeItem(KEY_DEFAULT_ADDR);
    }
    emit();
    return created;
  },
  /** Wipe local pointer (does NOT delete the underlying customer record). */
  signOut() {
    cachedId = null;
    cachedAddr = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY_CURRENT_ID);
      window.localStorage.removeItem(KEY_DEFAULT_ADDR);
    }
    emit();
  },
};

/** React hook — re-renders when the current customer record or pointer changes. */
export function useCurrentCustomer(): {
  customer: Customer | null;
  defaultAddress: ShippingAddress | null;
  loading: boolean;
} {
  // Subscribe to internal change events for cachedId / cachedAddr.
  useSyncExternalStore(subscribe, () => cachedId, () => cachedId);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const id = await ensureCustomerId();
      const c = await customers.get(id);
      if (!cancel) {
        setCustomer(c);
        setLoading(false);
      }
    })();
    const unsub = subscribe(() => {
      if (!cachedId) {
        setCustomer(null);
        return;
      }
      void customers.get(cachedId).then((c) => {
        if (!cancel) setCustomer(c);
      });
    });
    return () => {
      cancel = true;
      unsub();
    };
  }, []);

  return { customer, defaultAddress: cachedAddr, loading };
}
