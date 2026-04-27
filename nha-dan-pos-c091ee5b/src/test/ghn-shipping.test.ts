// Unit tests for the GHN + Hybrid shipping adapters.
// These verify success, timeout, fallback, and free-ship behaviour
// across different weights and address completeness, by mocking the
// supabase.functions.invoke call.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShippingQuoteInput } from "@/services/types";

// ---- Mock supabase client BEFORE importing adapters that use it ----
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

// We control AbortController.abort() via the timeout to simulate a stalled call.
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

beforeEach(() => {
  invokeMock.mockReset();
  // Wipe localStorage so the 30-min cache doesn't bleed between tests.
  if (typeof window !== "undefined") window.localStorage.clear();
});

describe("GhnShippingAdapter", () => {
  it("returns a quoted carrier_api result when the edge function succeeds", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fee: 32_000, etaDays: { min: 2, max: 4 }, serviceId: 53320 },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    const q = await adapter.quote(input());
    expect(q.status).toBe("quoted");
    expect(q.source).toBe("carrier_api");
    expect(q.fee).toBe(32_000);
    expect(q.etaDays).toEqual({ min: 2, max: 4 });
    expect(q.usedFallback).toBeUndefined();
  });

  it("applies free-ship when subtotal >= zone threshold", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fee: 32_000, etaDays: { min: 2, max: 4 }, serviceId: 1 },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    // Z1 (HCM "79") freeship threshold is 200k in default config.
    const q = await adapter.quote(input({ subtotal: 250_000 }));
    expect(q.fee).toBe(0);
    expect(q.freeShipApplied).toBe(true);
  });

  it("throws 'address_incomplete' when ward is missing", async () => {
    const adapter = new GhnShippingAdapter();
    await expect(
      adapter.quote(input({ address: { ...ADDRESS_FULL, wardName: "", wardCode: "" } })),
    ).rejects.toThrow("address_incomplete");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("throws the GHN reason when edge function returns ok:false", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, reason: "address_unmapped", message: "Ward not found" },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    await expect(adapter.quote(input())).rejects.toThrow("address_unmapped");
  });

  it("throws 'no_config' when secrets are missing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, reason: "no_config", message: "GHN secrets not configured" },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    await expect(adapter.quote(input())).rejects.toThrow("no_config");
  });

  it("dedupes concurrent identical quote calls (single edge invocation)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fee: 32_000, etaDays: { min: 2, max: 4 }, serviceId: 1 },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    const [a, b, c] = await Promise.all([adapter.quote(input()), adapter.quote(input()), adapter.quote(input())]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(a.fee).toBe(b.fee);
    expect(b.fee).toBe(c.fee);
  });

  it("uses cached result on second call for identical key", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fee: 28_000, etaDays: { min: 2, max: 4 }, serviceId: 1 },
      error: null,
    });
    const adapter = new GhnShippingAdapter();
    const first = await adapter.quote(input());
    const second = await adapter.quote(input());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(first.fee).toBe(second.fee);
  });

  it("re-fetches when weight changes (different cache key)", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { ok: true, fee: 28_000, etaDays: { min: 2, max: 4 }, serviceId: 1 }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, fee: 45_000, etaDays: { min: 2, max: 4 }, serviceId: 1 }, error: null });
    const adapter = new GhnShippingAdapter();
    const light = await adapter.quote(input({ weightGrams: 500 }));
    const heavy = await adapter.quote(input({ weightGrams: 3000 }));
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(light.fee).toBe(28_000);
    expect(heavy.fee).toBe(45_000);
  });
});

describe("HybridShippingAdapter", () => {
  it("returns the carrier quote unchanged on success", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fee: 32_000, etaDays: { min: 2, max: 4 }, serviceId: 1 },
      error: null,
    });
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q = await hybrid.quote(input());
    expect(q.status).toBe("quoted");
    expect(q.source).toBe("carrier_api");
    expect(q.usedFallback).toBeUndefined();
  });

  it("falls back to zone pricing when the carrier returns an error reason", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, reason: "ghn_error", message: "boom" },
      error: null,
    });
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q = await hybrid.quote(input());
    expect(q.status).toBe("quoted");
    expect(q.source).toBe("zone_fallback");
    expect(q.usedFallback).toBe(true);
    expect(q.fallbackReason).toBe("ghn_error");
    // HCM "79" → Z1, baseFee 18000
    expect(q.fee).toBe(18_000);
  });

  it("falls back when the supabase invoke itself errors (network)", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q = await hybrid.quote(input());
    expect(q.usedFallback).toBe(true);
    expect(q.fallbackReason).toBe("Failed to fetch");
  });

  it("trips the circuit breaker after no_config and skips carrier on the next call", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, reason: "no_config", message: "missing" },
      error: null,
    });
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q1 = await hybrid.quote(input());
    expect(q1.fallbackReason).toBe("no_config");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const q2 = await hybrid.quote(input({ subtotal: 99_000 })); // different cache key
    // Breaker should suppress the carrier call entirely.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(q2.fallbackReason).toBe("carrier_disabled");
  });

  it("falls back for incomplete address (carrier throws 'address_incomplete')", async () => {
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const partial = input({
      address: {
        ...ADDRESS_FULL,
        // Drop ward to make GHN adapter throw, but keep code-level fields so
        // the local zone fallback can still produce a quote (it only needs
        // provinceCode/districtCode/wardCode for "incomplete" check).
        wardName: "",
      },
    });
    const q = await hybrid.quote(partial);
    // Local adapter quotes against provinceCode "79" → Z1 base 18000.
    expect(q.status).toBe("quoted");
    expect(q.usedFallback).toBe(true);
    expect(q.fallbackReason).toBe("address_incomplete");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("simulated timeout: invoke rejects → falls back with reason 'timeout'", async () => {
    invokeMock.mockRejectedValueOnce(new Error("timeout"));
    const hybrid = new HybridShippingAdapter(new GhnShippingAdapter(), new LocalShippingAdapter());
    const q = await hybrid.quote(input());
    expect(q.usedFallback).toBe(true);
    expect(q.fallbackReason).toBe("timeout");
  });
});
