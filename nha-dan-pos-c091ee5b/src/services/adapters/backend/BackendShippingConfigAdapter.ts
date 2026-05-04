import type { ShippingService } from "@/services/shipping/ShippingService";
import type { ShippingConfig, ShippingQuote, ShippingQuoteInput } from "@/services/types";
import { adminFetchJson } from "@/services/auth/adminApi";

/**
 * Admin shipping zone / parcel settings backed by {@code GET/PUT /api/shipping/settings}.
 * Quote is handled by {@link GhnShippingAdapter} / {@link HybridShippingAdapter}.
 */
export class BackendShippingConfigAdapter implements ShippingService {
  async getConfig(): Promise<ShippingConfig> {
    return adminFetchJson<ShippingConfig>("/api/shipping/settings");
  }

  async saveConfig(input: ShippingConfig): Promise<ShippingConfig> {
    return adminFetchJson<ShippingConfig>("/api/shipping/settings", {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async quote(_input: ShippingQuoteInput): Promise<ShippingQuote> {
    throw new Error("BackendShippingConfigAdapter.quote is not used; use carrier adapter");
  }
}
