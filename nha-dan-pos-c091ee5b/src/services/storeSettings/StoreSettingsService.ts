import type { StorePaymentSettings } from "@/services/types";

export interface StoreSettingsService {
  getPaymentSettings(): Promise<StorePaymentSettings | null>;
  savePaymentSettings(input: StorePaymentSettings): Promise<StorePaymentSettings>;
  subscribePaymentSettings(
    cb: (settings: StorePaymentSettings | null) => void
  ): () => void;
}
