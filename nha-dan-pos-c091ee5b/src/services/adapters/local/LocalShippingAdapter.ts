import type { ShippingService } from "@/services/shipping/ShippingService";
import type {
  ShippingConfig,
  ShippingQuote,
  ShippingQuoteInput,
  ShippingZoneRule,
} from "@/services/types";
import { readJson, writeJson } from "./storage";

const KEY = "shipping_config:v1";

const DEFAULT_CONFIG: ShippingConfig = {
  zoneRules: [
    {
      zoneCode: "Z1",
      label: "Nội thành HN / HCM",
      baseFee: 18000,
      freeShipThreshold: 200000,
      etaDays: { min: 1, max: 2 },
      provinceCodes: ["01", "79"],
    },
    {
      zoneCode: "Z2",
      label: "Lân cận / Vùng kinh tế trọng điểm",
      baseFee: 28000,
      freeShipThreshold: 350000,
      etaDays: { min: 2, max: 3 },
      provinceCodes: ["74", "75", "77", "80", "27", "33", "30", "26", "72", "31"],
    },
    {
      zoneCode: "Z3",
      label: "Toàn quốc còn lại",
      baseFee: 38000,
      freeShipThreshold: 500000,
      etaDays: { min: 3, max: 5 },
      provinceCodes: ["*"],
    },
  ],
  parcelDefaults: {
    length: 10,
    width: 10,
    height: 10,
    weightGrams: 500,
    declaredValueMode: "none",
  },
};

export class LocalShippingAdapter implements ShippingService {
  async getConfig(): Promise<ShippingConfig> {
    return readJson<ShippingConfig>(KEY, DEFAULT_CONFIG);
  }

  async saveConfig(input: ShippingConfig): Promise<ShippingConfig> {
    writeJson(KEY, input);
    return input;
  }

  async quote(input: ShippingQuoteInput): Promise<ShippingQuote> {
    const { address, subtotal, weightGrams } = input;
    const missing: string[] = [];
    if (!address?.provinceCode) missing.push("Tỉnh/Thành");
    if (!address?.districtCode) missing.push("Quận/Huyện");
    if (!address?.wardCode) missing.push("Phường/Xã");
    if (missing.length) {
      return {
        status: "incomplete",
        reasonIfUnavailable: `Thiếu: ${missing.join(", ")}`,
      };
    }

    // Simulate carrier latency so loading state is observable in UI.
    await new Promise((r) => setTimeout(r, 350));

    const cfg = await this.getConfig();
    const rule = pickZone(cfg.zoneRules, address.provinceCode);
    if (!rule) {
      return {
        status: "unavailable",
        reasonIfUnavailable: "Không hỗ trợ giao đến khu vực này",
      };
    }

    const weight = weightGrams ?? cfg.parcelDefaults?.weightGrams ?? 1000;
    const surcharge = Math.max(0, Math.ceil((weight - 1000) / 500)) * 3000;
    let fee = rule.baseFee + surcharge;
    const freeShip = rule.freeShipThreshold !== undefined && subtotal >= rule.freeShipThreshold;
    if (freeShip) fee = 0;

    return {
      status: "quoted",
      source: "zone_fallback",
      zoneCode: rule.zoneCode,
      fee,
      etaDays: rule.etaDays,
      freeShipApplied: freeShip,
    };
  }
}

function pickZone(rules: ShippingZoneRule[], provinceCode: string): ShippingZoneRule | null {
  const direct = rules.find((r) => r.provinceCodes.includes(provinceCode));
  if (direct) return direct;
  return rules.find((r) => r.provinceCodes.includes("*")) ?? null;
}
