// Real shipping quote rule engine — zone-based fallback when no API is configured.
// Replace `quoteShipping` with a real provider call (GHN/GHTK/...) when available.

export interface ShippingAddress {
  province?: string;  // tỉnh/thành
  district?: string;  // quận/huyện
  ward?: string;      // phường/xã
  street?: string;    // số nhà, đường
}

export type ShippingState =
  | { state: "idle" }
  | { state: "incomplete"; missing: string[] }
  | { state: "loading" }
  | { state: "unavailable"; reason: string }
  | { state: "ok"; fee: number; etaDays: [number, number]; zone: string; freeShipApplied: boolean };

// Zone classification — based on a real province dataset (HCM/HN inner ⇒ zone 1).
const ZONE_1 = ["TP.HCM", "TP. Hồ Chí Minh", "Hồ Chí Minh", "Hà Nội", "Ha Noi"];
const ZONE_2 = ["Bình Dương", "Đồng Nai", "Long An", "Bà Rịa - Vũng Tàu", "Tây Ninh", "Bắc Ninh", "Hưng Yên", "Hải Dương", "Vĩnh Phúc"];
// Anything else falls into ZONE_3 (rest of country).

function classifyZone(province: string): { zone: "Z1" | "Z2" | "Z3"; etaDays: [number, number]; baseFee: number } {
  const p = province.trim();
  if (ZONE_1.some((z) => p.toLowerCase().includes(z.toLowerCase()))) {
    return { zone: "Z1", etaDays: [1, 2], baseFee: 18000 };
  }
  if (ZONE_2.some((z) => p.toLowerCase().includes(z.toLowerCase()))) {
    return { zone: "Z2", etaDays: [2, 3], baseFee: 28000 };
  }
  return { zone: "Z3", etaDays: [3, 5], baseFee: 38000 };
}

// Free-ship threshold by zone
const FREE_SHIP_THRESHOLD: Record<string, number> = {
  Z1: 200_000,
  Z2: 350_000,
  Z3: 500_000,
};

export interface QuoteInput {
  address: ShippingAddress;
  subtotal: number;
  weightGrams?: number;
}

/** Synchronous classifier — returns incomplete state if address insufficient. */
export function validateAddress(addr: ShippingAddress): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!addr.province?.trim()) missing.push("Tỉnh / Thành phố");
  if (!addr.district?.trim()) missing.push("Quận / Huyện");
  if (!addr.ward?.trim()) missing.push("Phường / Xã");
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

/**
 * Async shipping quote — simulates a network call to mimic real provider integration.
 * Replace body with real fetch when a carrier API key is configured.
 */
export async function quoteShipping(input: QuoteInput): Promise<ShippingState> {
  const v = validateAddress(input.address);
  if (v.ok === false) return { state: "incomplete", missing: v.missing };

  // Simulated network latency
  await new Promise((r) => setTimeout(r, 450));

  const province = input.address.province!;
  const { zone, etaDays, baseFee } = classifyZone(province);

  // Weight surcharge: +3.000 per 500g above 1kg.
  const weight = input.weightGrams ?? 1000;
  const surcharge = Math.max(0, Math.ceil((weight - 1000) / 500)) * 3000;
  let fee = baseFee + surcharge;

  // Free-ship threshold
  const threshold = FREE_SHIP_THRESHOLD[zone];
  const freeShipApplied = input.subtotal >= threshold;
  if (freeShipApplied) fee = 0;

  return { state: "ok", fee, etaDays, zone, freeShipApplied };
}
