import type {
  ShippingConfig,
  ShippingQuote,
  ShippingQuoteInput,
} from "@/services/types";

export interface ShippingService {
  getConfig(): Promise<ShippingConfig>;
  saveConfig(input: ShippingConfig): Promise<ShippingConfig>;
  quote(input: ShippingQuoteInput): Promise<ShippingQuote>;
}
