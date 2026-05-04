import { describe, expect, it } from "vitest";

describe("pending confirm invoice metadata (adapter contract)", () => {
  it("parses invoice envelope like CloudPendingOrderAdapter confirm response", () => {
    const body = {
      pendingOrder: { id: 1, code: "PO-1", status: "confirmed" },
      invoice: { id: 99, invoiceNo: "INV-X" },
    };
    const invRaw = body.invoice as Record<string, unknown>;
    const invId = invRaw?.id != null ? String(invRaw.id) : undefined;
    const invNo = typeof invRaw?.invoiceNo === "string" ? invRaw.invoiceNo : undefined;
    expect(invId).toBe("99");
    expect(invNo).toBe("INV-X");
  });
});
