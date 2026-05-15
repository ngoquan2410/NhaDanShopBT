import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminInvoices from "./Invoices";
import type { Invoice } from "@/lib/mock-data";

const listMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services", () => ({
  invoices: {
    list: (...args: unknown[]) => listMock(...args),
    cancel: vi.fn(),
    remove: vi.fn(),
  },
}));

function inv(overrides: Partial<Invoice>): Invoice {
  return {
    id: "1",
    number: "HD-0001",
    date: "2026-05-12T09:00:00",
    customerId: "",
    customerName: "Khách lẻ",
    total: 100000,
    paymentType: "transfer",
    status: "active",
    createdBy: "admin",
    itemCount: 1,
    lines: [],
    sourceType: "online_pending",
    pendingOrderId: "17",
    pendingOrderCode: "DH-20260512-001",
    ...overrides,
  } as Invoice;
}

describe("AdminInvoices — Pending Order column", () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  function withRouter(ui: React.ReactNode) {
    return <MemoryRouter>{ui}</MemoryRouter>;
  }

  it("renders header 'Pending Order' and removes 'Người tạo' from desktop table", async () => {
    listMock.mockResolvedValue({
      items: [inv({})],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    render(withRouter(<AdminInvoices />));
    expect(await screen.findByTestId("invoices-col-pending-order")).toBeTruthy();
    expect(screen.queryByText("Người tạo")).toBeNull();
  });

  it("shows pendingOrderCode as a link, falls back to PO #id when only id is present", async () => {
    listMock.mockResolvedValue({
      items: [
        inv({ id: "11", pendingOrderCode: "DH-20260512-001", pendingOrderId: "17" }),
        inv({
          id: "12",
          number: "HD-0002",
          pendingOrderCode: undefined,
          pendingOrderId: "44",
        }),
        inv({
          id: "13",
          number: "HD-0003",
          sourceType: "pos",
          pendingOrderCode: undefined,
          pendingOrderId: undefined,
        }),
      ],
      total: 3,
      page: 1,
      pageSize: 20,
    });
    render(withRouter(<AdminInvoices />));

    const row1 = await screen.findByTestId("invoices-pending-order-11");
    expect(within(row1).getByText("DH-20260512-001")).toBeTruthy();
    const link1 = within(row1).getByRole("link", { name: /DH-20260512-001/ });
    expect(link1.getAttribute("href")).toContain("DH-20260512-001");

    const row2 = await screen.findByTestId("invoices-pending-order-12");
    expect(within(row2).getByText("PO #44")).toBeTruthy();

    const row3 = await screen.findByTestId("invoices-pending-order-13");
    expect(within(row3).getByText("POS")).toBeTruthy();
  });

  it("shows em-dash for invoices without source linkage", async () => {
    listMock.mockResolvedValue({
      items: [
        inv({
          id: "21",
          sourceType: undefined,
          pendingOrderCode: undefined,
          pendingOrderId: undefined,
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    render(withRouter(<AdminInvoices />));
    const row = await screen.findByTestId("invoices-pending-order-21");
    await waitFor(() => {
      expect(within(row).getByText("—")).toBeTruthy();
    });
  });
});
