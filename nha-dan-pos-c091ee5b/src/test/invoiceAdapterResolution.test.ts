import { describe, expect, it } from "vitest";
import { shouldUseLocalInvoiceAdapterForAdmin } from "@/services/adapters/backend/invoiceAdapterResolution";

describe("shouldUseLocalInvoiceAdapterForAdmin", () => {
  it("selects local adapter in vitest-style test mode", () => {
    expect(shouldUseLocalInvoiceAdapterForAdmin({ MODE: "test" })).toBe(true);
  });
  it("selects backend adapter for dev/prod-like modes", () => {
    expect(shouldUseLocalInvoiceAdapterForAdmin({ MODE: "development" })).toBe(false);
    expect(shouldUseLocalInvoiceAdapterForAdmin({ MODE: "production" })).toBe(false);
  });
  it("allows forcing local via VITE_ADMIN_INVOICE_LOCAL_DEMO", () => {
    expect(
      shouldUseLocalInvoiceAdapterForAdmin({
        MODE: "production",
        VITE_ADMIN_INVOICE_LOCAL_DEMO: "true",
      }),
    ).toBe(true);
  });
});
