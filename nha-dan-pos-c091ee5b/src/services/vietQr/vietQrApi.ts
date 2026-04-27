import type {
  StorePaymentSettings,
  VietQrRequest,
  VietQrResult,
} from "@/services/types";
import { adminFetchJson } from "@/services/auth/adminApi";

interface GeneratePayload extends VietQrRequest {
  settingsOverride?: StorePaymentSettings;
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function normalizeResult(raw: any): VietQrResult {
  return {
    imageUrl: raw?.imageUrl ?? "",
    scanImageUrl: raw?.scanImageUrl ?? "",
    rawPayload: raw?.rawPayload ?? "",
    bankName: raw?.bankName ?? "",
    accountNumber: raw?.accountNumber ?? "",
    accountName: raw?.accountName ?? "",
    amount: Number(raw?.amount ?? 0),
    transferContent: raw?.transferContent ?? "",
    template: raw?.template ?? "compact2",
  };
}

export async function generateVietQr(
  request: VietQrRequest,
  settingsOverride?: StorePaymentSettings,
): Promise<VietQrResult> {
  const payload: GeneratePayload = {
    ...request,
    ...(settingsOverride ? { settingsOverride } : {}),
  };
  // `settingsOverride` is reserved for admin preview flows. Public checkout and
  // pending-payment calls should rely on backend-owned stored settings only.
  if (settingsOverride) {
    const data = await adminFetchJson<any>("/api/vietqr/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalizeResult(data);
  }
  const res = await fetch("/api/vietqr/generate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.detail ?? data?.message ?? data?.error ?? `HTTP ${res.status}`);
  }
  return normalizeResult(data);
}
