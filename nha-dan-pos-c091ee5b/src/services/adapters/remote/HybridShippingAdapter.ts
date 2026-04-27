import type { ShippingService } from "@/services/shipping/ShippingService";
import type {
  ShippingConfig,
  ShippingQuote,
  ShippingQuoteInput,
} from "@/services/types";

/**
 * Transitional wrapper:
 * - quote path now delegates straight to the backend-backed carrier adapter
 * - config CRUD still delegates to the local adapter for admin compatibility
 */
export class HybridShippingAdapter implements ShippingService {
  constructor(
    private readonly carrier: ShippingService,
    private readonly fallback: ShippingService,
  ) {}

  getConfig(): Promise<ShippingConfig> {
    return this.fallback.getConfig();
  }

  saveConfig(input: ShippingConfig): Promise<ShippingConfig> {
    return this.fallback.saveConfig(input);
  }

  /** Transitional no-op so Checkout retry UX stays unchanged. */
  resetBreaker(): void {
    const carrier = this.carrier as { resetBreaker?: () => void };
    carrier.resetBreaker?.();
  }

  async quote(input: ShippingQuoteInput): Promise<ShippingQuote> {
    return this.carrier.quote(input);
  }
}
