import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceDetailDrawer } from "./InvoiceDetailDrawer";

describe("InvoiceDetailDrawer loyalty rows", () => {
  it("shows loyalty row for positive loyalty discount", () => {
    render(
      <InvoiceDetailDrawer
        onClose={() => {}}
        invoice={{
          id: "1",
          number: "INV-1",
          date: new Date().toISOString(),
          customerId: "1",
          customerName: "C",
          total: 95000,
          paymentType: "cash",
          status: "active",
          createdBy: "admin",
          itemCount: 0,
          breakdown: {
            subtotal: 100000,
            manualDiscount: 0,
            promoDiscount: 0,
            voucherDiscount: 0,
            shippingFee: 0,
            shippingDiscount: 0,
            shippingPayable: 0,
            vatPercent: 0,
            vatBase: 0,
            vatAmount: 0,
            total: 95000,
            loyaltyDiscount: 5000,
            loyaltyRedeemedPoints: 50,
            freeItems: [],
          } as any,
          lines: [],
        }}
      />,
    );
    expect(screen.getAllByTestId("invoice-loyalty-discount").length).toBeGreaterThan(0);
  });
});
