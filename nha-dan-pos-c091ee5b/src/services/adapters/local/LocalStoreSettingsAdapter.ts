import type { StoreSettingsService } from "@/services/storeSettings/StoreSettingsService";
import type { StorePaymentSettings } from "@/services/types";
import { normalizeVietQrBankId, sanitizeBankAccountNumber } from "@/lib/vietqr";
import { readJson, writeJson } from "./storage";

const KEY = "store_payment_settings:v1";

const DEFAULT_SETTINGS: StorePaymentSettings = {
  shopName: "Nhã Đan Shop",
  qrEnabled: false,
  vietQrBankCode: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  branch: "",
  transferPrefix: "DH",
  qrTemplate: "compact2",
  momoQrImage: "",
  momoAccountName: "",
  momoPhone: "",
  zalopayQrImage: "",
  zalopayAccountName: "",
  zalopayPhone: "",
};

function merge(stored: Partial<StorePaymentSettings> | null): StorePaymentSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  return {
    ...merged,
    vietQrBankCode: normalizeVietQrBankId(merged.vietQrBankCode),
    accountNumber: sanitizeBankAccountNumber(merged.accountNumber),
  };
}

export class LocalStoreSettingsAdapter implements StoreSettingsService {
  private listeners = new Set<(s: StorePaymentSettings | null) => void>();

  async getPaymentSettings(): Promise<StorePaymentSettings> {
    const stored = readJson<Partial<StorePaymentSettings> | null>(KEY, null);
    return merge(stored);
  }

  async savePaymentSettings(input: StorePaymentSettings): Promise<StorePaymentSettings> {
    // Always persist a complete shape so newly-added wallet fields survive reload.
    const full = merge(input);
    writeJson(KEY, full);
    this.listeners.forEach((cb) => cb(full));
    return full;
  }

  subscribePaymentSettings(cb: (s: StorePaymentSettings | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
