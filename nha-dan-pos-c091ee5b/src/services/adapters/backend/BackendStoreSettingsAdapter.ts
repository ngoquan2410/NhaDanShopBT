import type { StoreSettingsService } from "@/services/storeSettings/StoreSettingsService";
import type { StorePaymentSettings } from "@/services/types";
import { fetchPaymentSettings, savePaymentSettings } from "@/services/storeSettings/paymentSettingsApi";

export class BackendStoreSettingsAdapter implements StoreSettingsService {
  private readonly listeners = new Set<(s: StorePaymentSettings | null) => void>();
  private inMemory: StorePaymentSettings | null = null;

  async getPaymentSettings(): Promise<StorePaymentSettings> {
    const backend = await fetchPaymentSettings();
    this.inMemory = backend;
    this.listeners.forEach((cb) => cb(backend));
    return backend;
  }

  async savePaymentSettings(input: StorePaymentSettings): Promise<StorePaymentSettings> {
    const saved = await savePaymentSettings(input);
    this.inMemory = saved;
    this.listeners.forEach((cb) => cb(saved));
    return saved;
  }

  subscribePaymentSettings(cb: (s: StorePaymentSettings | null) => void): () => void {
    this.listeners.add(cb);
    if (this.inMemory) {
      cb(this.inMemory);
    }
    return () => this.listeners.delete(cb);
  }
}
