import { describe, expect, it } from "vitest";
import { mapSalesInvoiceApiJsonToInvoice } from "./invoiceApiMapping";

function rawInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    invoiceNo: "HD-0042",
    invoiceDate: "2026-05-12T09:00:00",
    customerName: "Khách lẻ",
    paymentMethod: "bank_transfer",
    finalAmount: 100000,
    status: "COMPLETED",
    sourceType: "online_pending",
    items: [],
    ...overrides,
  };
}

describe("mapSalesInvoiceApiJsonToInvoice — pendingOrderCode mapping", () => {
  it("passes through pendingOrderCode and pendingOrderId from backend JSON", () => {
    const inv = mapSalesInvoiceApiJsonToInvoice(
      rawInvoice({ pendingOrderId: 17, pendingOrderCode: "DH-20260512-001" }),
    );
    expect(inv.pendingOrderId).toBe("17");
    expect(inv.pendingOrderCode).toBe("DH-20260512-001");
  });

  it("trims whitespace on pendingOrderCode and treats empty string as undefined", () => {
    const inv = mapSalesInvoiceApiJsonToInvoice(
      rawInvoice({ pendingOrderId: 17, pendingOrderCode: "  DH-20260512-002  " }),
    );
    expect(inv.pendingOrderCode).toBe("DH-20260512-002");

    const inv2 = mapSalesInvoiceApiJsonToInvoice(
      rawInvoice({ pendingOrderId: 17, pendingOrderCode: "   " }),
    );
    expect(inv2.pendingOrderCode).toBeUndefined();
    expect(inv2.pendingOrderId).toBe("17");
  });

  it("returns undefined pendingOrderCode when missing but keeps pendingOrderId for fallback rendering", () => {
    const inv = mapSalesInvoiceApiJsonToInvoice(rawInvoice({ pendingOrderId: 25 }));
    expect(inv.pendingOrderCode).toBeUndefined();
    expect(inv.pendingOrderId).toBe("25");
  });

  it("returns undefined for both when invoice has no pending order linkage", () => {
    const inv = mapSalesInvoiceApiJsonToInvoice(rawInvoice({ sourceType: "pos" }));
    expect(inv.pendingOrderCode).toBeUndefined();
    expect(inv.pendingOrderId).toBeUndefined();
  });
});
