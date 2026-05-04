// Shipping adapter tests: GhnShippingAdapter calls POST /api/shipping/quote (fetch).
// HybridShippingAdapter forwards quote to the carrier and config CRUD to the fallback adapter.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ShippingQuoteInput } from "@/services/types";
import { GhnShippingAdapter } from "@/services/adapters/remote/GhnShippingAdapter";
import { HybridShippingAdapter } from "@/services/adapters/remote/HybridShippingAdapter";
import { LocalShippingAdapter } from "@/services/adapters/local/LocalShippingAdapter";

const ADDRESS_FULL = {
  receiverName: "Test",
  phone: "0901234567",
  provinceCode: "79",
  provinceName: "TP. Hồ Chí Minh",
  districtCode: "760",
  districtName: "Quận 1",
  wardCode: "26734",
  wardName: "Phường Bến Nghé",
  street: "12 Lê Lợi",
};

function input(overrides: Partial<ShippingQuoteInput> = {}): ShippingQuoteInput {
  return {
    address: ADDRESS_FULL,
    subtotal: 150_000,
    weightGrams: 500,
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  if (typeof window !== "undefined") window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GhnShippingAdapter", () => {
  it("maps successful backend quote JSON", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(
      jsonResponse({
        status: "quoted",
        source: "carrier_api",
        fee: 32_000,
        etaDays: { min: 2, max: 4 },
      }),
    );
    const q = await new GhnShippingAdapter().quote(input());
    expect(q.status).toBe("quoted");
    expect(q.source).toBe("carrier_api");
    expect(q.fee).toBe(32_000);
    expect(q.etaDays).toEqual({ min: 2, max: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("26734");
  });

  it("returns unavailable when backend returns error HTTP", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(jsonResponse({ message: "bad" }, false, 500));
    const q = await new GhnShippingAdapter().quote(input());
    expect(q.status).toBe("unavailable");
  });

  it("returns unavailable when fetch rejects", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new Error("network"));
    const q = await new GhnShippingAdapter().quote(input());
    expect(q.status).toBe("unavailable");
    expect(q.reasonIfUnavailable).toMatch(/Không thể báo giá/);
  });
});

describe("HybridShippingAdapter", () => {
  it("forwards quote to the carrier adapter", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(
      jsonResponse({
        status: "quoted",
        source: "zone_fallback",
        zoneCode: "Z1",
        fee: 18_000,
        etaDays: { min: 1, max: 2 },
        usedFallback: true,
        fallbackReason: "no_config",
      }),
    );
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q = await hybrid.quote(input());
    expect(q.status).toBe("quoted");
    expect(q.source).toBe("zone_fallback");
    expect(q.fee).toBe(18_000);
    expect(q.usedFallback).toBe(true);
  });

  it("delegates getConfig and saveConfig to the fallback adapter", async () => {
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const cfg = await hybrid.getConfig();
    expect(cfg.zoneRules.length).toBeGreaterThan(0);
    const saved = await hybrid.saveConfig(cfg);
    expect(saved.zoneRules.length).toBe(cfg.zoneRules.length);
  });
});
