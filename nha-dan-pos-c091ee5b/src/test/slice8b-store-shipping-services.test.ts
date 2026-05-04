import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Slice 8B store & shipping service composition", () => {
  it("BackendStoreSettingsAdapter has no local bootstrap or store_payment_settings key", () => {
    const p = resolve(process.cwd(), "src/services/adapters/backend/BackendStoreSettingsAdapter.ts");
    const src = readFileSync(p, "utf8");
    expect(src).not.toContain("LocalStoreSettingsAdapter");
    expect(src).not.toContain("store_payment_settings:v1");
    expect(src).not.toContain("localStorage");
    expect(src).toContain("fetchPaymentSettings");
  });

  it("services/index uses BackendShippingConfigAdapter instead of LocalShippingAdapter in production composition", () => {
    const p = resolve(process.cwd(), "src/services/index.ts");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("BackendShippingConfigAdapter");
    expect(src).not.toContain("new LocalShippingAdapter()");
  });

  it("HybridShippingAdapter still splits quote vs config (no direct local config)", () => {
    const p = resolve(process.cwd(), "src/services/adapters/remote/HybridShippingAdapter.ts");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("this.carrier.quote");
    expect(src).toContain("this.fallback.getConfig");
    expect(src).not.toContain("LocalShippingAdapter");
  });
});
