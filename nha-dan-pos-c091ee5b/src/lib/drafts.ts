// Tiny draft store for goods receipts (mock persistence across pages).
import { useSyncExternalStore } from "react";

export interface ReceiptDraft {
  id: string;
  number: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  receiptDate: string;
  shippingFee: number;
  vat: number;
  note: string;
  lines: {
    id: string; productName: string; variantName: string; variantCode: string;
    quantity: number; unitCost: number; discount: number; importUnit: string;
    piecesPerUnit: number; expiryDate: string;
  }[];
}

let drafts: ReceiptDraft[] = [];
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const emit = () => listeners.forEach(l => l());

export const useDrafts = () => useSyncExternalStore(subscribe, () => drafts, () => drafts);

export const draftActions = {
  save(draft: Omit<ReceiptDraft, "id" | "createdAt"> & { id?: string }) {
    const id = draft.id ?? `dr-${Date.now()}`;
    const existing = drafts.find(d => d.id === id);
    const record: ReceiptDraft = {
      ...draft,
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    drafts = existing ? drafts.map(d => d.id === id ? record : d) : [record, ...drafts];
    emit();
    return record;
  },
  remove(id: string) {
    drafts = drafts.filter(d => d.id !== id);
    emit();
  },
  get(id: string) {
    return drafts.find(d => d.id === id);
  },
  all() { return drafts; },
};
