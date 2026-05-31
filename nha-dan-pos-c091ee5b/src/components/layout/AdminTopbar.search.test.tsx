import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminTopbar } from "./AdminTopbar";
import type { Product } from "@/lib/catalog-types";

const mocks = vi.hoisted(() => ({
  productsList: vi.fn(),
  reloadTopbar: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useService", () => ({
  useService: () => ({
    data: {
      invoices: [],
      customers: [],
      pendingOrdersCount: 0,
      lowStockVariants: [],
      nearExpiryLots: [],
    },
    loading: false,
    error: null,
    isEmpty: false,
    reload: mocks.reloadTopbar,
  }),
}));

vi.mock("@/lib/admin-auth", () => ({
  useAdminAuth: () => ({
    user: { username: "admin", fullName: "Administrator" },
    signOut: mocks.signOut,
    primaryRoleLabel: "Quan tri",
  }),
}));

vi.mock("@/services", () => ({
  products: { list: (...args: unknown[]) => mocks.productsList(...args) },
  adminCustomers: { list: vi.fn() },
  inventory: { listInventoryProjections: vi.fn() },
  invoices: { list: vi.fn() },
  pendingOrders: { list: vi.fn() },
}));

function product(idx: number): Product {
  return {
    id: `p-${idx}`,
    code: `P${idx}`,
    name: `Product ${idx}`,
    categoryId: "cat-1",
    categoryName: "Category",
    image: "",
    active: true,
    type: "single",
    variants: [
      {
        id: `v-${idx}`,
        code: `V${idx}`,
        name: "Default",
        sellUnit: "cai",
        importUnit: "cai",
        piecesPerImportUnit: 1,
        sellPrice: 0,
        costPrice: 0,
        stock: 0,
        minStock: 0,
        expiryDays: 0,
        active: true,
        isDefault: true,
      },
    ],
  };
}

describe("AdminTopbar search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.productsList.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => product(i + 1)),
      total: 42,
      page: 1,
      pageSize: 20,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.productsList.mockReset();
    mocks.reloadTopbar.mockReset();
    mocks.signOut.mockReset();
  });

  it("shows the full product search batch instead of capping products at 5", async () => {
    render(
      <MemoryRouter>
        <AdminTopbar onMenuClick={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "phoi suong" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.productsList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      query: "phoi suong",
    });
    expect(screen.getByText("Product 6")).toBeTruthy();
    expect(screen.getByText("Product 20")).toBeTruthy();
    expect(screen.getByText(/20\/42/)).toBeTruthy();
  });
});
