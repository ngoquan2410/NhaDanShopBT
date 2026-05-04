import type { StorePaymentSettings } from "@/services/types";
import { adminFetchJson } from "@/services/auth/adminApi";

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function normalizeSettings(raw: any): StorePaymentSettings {
  return {
    shopName: raw?.shopName ?? "Nhã Đan Shop",
    qrEnabled: Boolean(raw?.qrEnabled),
    vietQrBankCode: raw?.vietQrBankCode ?? "",
    bankName: raw?.bankName ?? "",
    accountNumber: raw?.accountNumber ?? "",
    accountName: raw?.accountName ?? "",
    branch: raw?.branch ?? "",
    transferPrefix: raw?.transferPrefix ?? "DH",
    qrTemplate: raw?.qrTemplate ?? "compact2",
    momoQrImage: raw?.momoQrImage ?? "",
    momoAccountName: raw?.momoAccountName ?? "",
    momoPhone: raw?.momoPhone ?? "",
    zalopayQrImage: raw?.zalopayQrImage ?? "",
    zalopayAccountName: raw?.zalopayAccountName ?? "",
    zalopayPhone: raw?.zalopayPhone ?? "",
  };
}

export async function fetchPaymentSettings(): Promise<StorePaymentSettings> {
  const res = await fetch("/api/store/payment-settings", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.detail ?? data?.message ?? data?.error ?? `HTTP ${res.status}`);
  }
  return normalizeSettings(data);
}

export async function savePaymentSettings(
  input: StorePaymentSettings,
): Promise<StorePaymentSettings> {
  const data = await adminFetchJson<Record<string, unknown>>("/api/store/payment-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return normalizeSettings(data);
}
