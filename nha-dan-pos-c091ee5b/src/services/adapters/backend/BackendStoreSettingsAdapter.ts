import type { StoreSettingsService } from "@/services/storeSettings/StoreSettingsService";
import type { StorePaymentSettings } from "@/services/types";
import { fetchPaymentSettings, savePaymentSettings } from "@/services/storeSettings/paymentSettingsApi";
import { LocalStoreSettingsAdapter } from "../local/LocalStoreSettingsAdapter";

function isMeaningful(settings: StorePaymentSettings | null | undefined): boolean {
  if (!settings) return false;
  return Boolean(
    settings.qrEnabled ||
      settings.vietQrBankCode ||
      settings.accountNumber ||
      settings.accountName ||
      settings.momoQrImage ||
      settings.zalopayQrImage,
  );
}

function looksLikeDefault(settings: StorePaymentSettings | null | undefined): boolean {
  if (!settings) return true;
  return !isMeaningful(settings);
}

export class BackendStoreSettingsAdapter implements StoreSettingsService {
  private readonly listeners = new Set<(s: StorePaymentSettings | null) => void>();
  private readonly localBootstrap = new LocalStoreSettingsAdapter();
  private inMemory: StorePaymentSettings | null = null;
  private bootstrapAttempted = false;

  async getPaymentSettings(): Promise<StorePaymentSettings> {
    const backend = await fetchPaymentSettings();
    if (!this.bootstrapAttempted && looksLikeDefault(backend)) {
      this.bootstrapAttempted = true;
      const local = await this.localBootstrap.getPaymentSettings();
      if (isMeaningful(local)) {
        const saved = await savePaymentSettings(local);
        this.inMemory = saved;
        this.listeners.forEach((cb) => cb(saved));
        return saved;
      }
    }
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
