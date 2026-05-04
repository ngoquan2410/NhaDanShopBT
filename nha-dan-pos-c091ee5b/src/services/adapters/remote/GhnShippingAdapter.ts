import type { ShippingService } from "@/services/shipping/ShippingService";
import type {
  ShippingConfig,
  ShippingQuote,
  ShippingQuoteInput,
} from "@/services/types";

/**
 * Backend-backed shipping quote via POST /api/shipping/quote.
 * Admin zone/parcel config is {@link BackendShippingConfigAdapter} (composed in HybridShippingAdapter).
 */
export class GhnShippingAdapter implements ShippingService {
  getConfig(): Promise<ShippingConfig> {
    return Promise.reject(
      new Error("GhnShippingAdapter.getConfig is not used; shipping config is loaded via BackendShippingConfigAdapter"),
    );
  }

  saveConfig(_input: ShippingConfig): Promise<ShippingConfig> {
    return Promise.reject(
      new Error("GhnShippingAdapter.saveConfig is not used; shipping config is saved via BackendShippingConfigAdapter"),
    );
  }

  resetBreaker(): void {
    /* backend owns carrier/fallback decisions now */
  }

  async quote(input: ShippingQuoteInput): Promise<ShippingQuote> {
    try {
      const res = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: input.address,
          subtotal: input.subtotal,
          weightGrams: input.weightGrams,
          orderCode: input.orderCode,
          parcel: input.parcel,
          declaredValue: input.declaredValue,
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      }
      return normalizeQuote(data);
    } catch {
      return {
        status: "unavailable",
        reasonIfUnavailable: "Không thể báo giá giao hàng lúc này",
      };
    }
  }
}

function normalizeQuote(raw: any): ShippingQuote {
  return {
    status: raw?.status ?? "unavailable",
    source: raw?.source ?? undefined,
    zoneCode: raw?.zoneCode ?? undefined,
    fee: raw?.fee != null ? Number(raw.fee) : undefined,
    etaDays: raw?.etaDays
      ? {
          min: Number(raw.etaDays.min),
          max: Number(raw.etaDays.max),
        }
      : undefined,
    reasonIfUnavailable: raw?.reasonIfUnavailable ?? undefined,
    freeShipApplied:
      raw?.freeShipApplied == null ? undefined : Boolean(raw.freeShipApplied),
    usedFallback: raw?.usedFallback == null ? undefined : Boolean(raw.usedFallback),
    fallbackReason: raw?.fallbackReason ?? undefined,
    latencyMs: raw?.latencyMs != null ? Number(raw.latencyMs) : undefined,
    attemptedAt: raw?.attemptedAt ?? undefined,
  };
}
