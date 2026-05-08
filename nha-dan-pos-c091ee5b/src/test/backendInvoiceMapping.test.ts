import { describe, expect, it } from "vitest";
import { mapSalesInvoiceApiJsonToInvoice } from "@/services/adapters/backend/invoiceApiMapping";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("mapSalesInvoiceApiJsonToInvoice", () => {
  it("maps Spring invoice JSON to admin Invoice view model", () => {
    const raw = {
      id: 42,
      invoiceNo: "INV-20260430-00042",
      invoiceDate: "2026-04-30T10:15:30",
      customerId: 7,
      customerName: "Smoke Guest",
      paymentMethod: "cod",
      note: null,
      totalAmount: "120000",
      discountAmount: "20000",
      finalAmount: "115000",
      promotionName: null,
      createdBy: "admin",
      createdAt: "2026-04-30T10:15:31",
      updatedAt: "2026-04-30T10:15:31",
      status: "COMPLETED",
      sourceType: "online_pending",
      pendingOrderId: "9",
      itemGrossProfit: "25000",
      totalProfit: "32000",
      promotionSnapshot: null,
      voucherSnapshot: null,
      pricingBreakdownSnapshot: {
        subtotal: 100000,
        manualDiscount: 0,
        promotionDiscount: 0,
        voucherDiscount: 0,
        loyaltyDiscount: 5000,
        loyaltyRedeemedPoints: 50,
        shippingFee: 15000,
        shippingDiscount: 0,
        vatBase: 100000,
        vatPercent: 8,
        vatAmount: 8000,
        total: 115000,
      },
      items: [
        {
          productName: "Smoke PG",
          variantName: "Pack",
          productCode: "SMK",
          variantCode: "PK",
          quantity: 1,
          unitPrice: 100000,
          rewardLine: false,
        },
      ],
    };

    const inv = mapSalesInvoiceApiJsonToInvoice(raw);
    expect(inv.id).toBe("42");
    expect(inv.number).toBe("INV-20260430-00042");
    expect(inv.status).toBe("active");
    expect(inv.paymentType).toBe("cash");
    expect(inv.total).toBe(115000);
    expect(inv.customerId).toBe("7");
    expect(inv.pendingOrderId).toBe("9");
    expect(inv.allowPhysicalDelete).toBe(false);
    expect(inv.itemGrossProfit).toBe(25000);
    expect(inv.totalProfit).toBe(32000);
    expect(inv.lines?.length).toBe(1);
    expect(inv.lines?.[0].name).toContain("Smoke PG");
    expect(inv.breakdown?.total).toBe(115000);
    expect(inv.breakdown?.loyaltyDiscount).toBe(5000);
    expect(inv.breakdown?.loyaltyRedeemedPoints).toBe(50);
  });
});

describe("AdminInvoices hygiene", () => {
  it("does not reintroduce frozen mock date / profitFor names", () => {
    const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../pages/admin/Invoices.tsx");
    const src = readFileSync(srcPath, "utf8");
    expect(src).not.toContain("2025-04-15");
    expect(src).not.toContain("profitFor");
  });
});
