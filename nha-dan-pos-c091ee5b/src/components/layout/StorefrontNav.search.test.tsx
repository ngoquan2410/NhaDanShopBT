import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StorefrontNav } from "./StorefrontNav";
import type { StorefrontProduct } from "@/services/catalog/publicCatalog";

const mocks = vi.hoisted(() => ({
  listPublicProductsPage: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/services/catalog/publicCatalog", () => ({
  listPublicProductsPage: (...args: unknown[]) => mocks.listPublicProductsPage(...args),
}));

vi.mock("@/lib/cart", () => ({
  useCart: () => [],
}));

vi.mock("@/lib/admin-auth", () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    isAdmin: false,
    isStaff: false,
    signOut: mocks.signOut,
  }),
}));

function product(idx: number): StorefrontProduct {
  return {
    id: `p-${idx}`,
    code: `P${idx}`,
    name: `Product ${idx}`,
    categoryId: "cat-1",
    categoryName: "Category",
    active: true,
    variants: [
      {
        id: `v-${idx}`,
        code: `V${idx}`,
        name: "Default",
        active: true,
        sellUnit: "cai",
        sellPrice: 1000,
      },
    ],
  };
}

describe("StorefrontNav search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.listPublicProductsPage.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => product(i + 1)),
      totalElements: 65,
      totalPages: 4,
      page: 0,
      size: 20,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.listPublicProductsPage.mockReset();
    mocks.signOut.mockReset();
  });

  it("shows the full storefront search batch and total count like admin search", async () => {
    render(
      <MemoryRouter>
        <StorefrontNav />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("storefront-nav-search-input"), {
      target: { value: "banh trang" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.listPublicProductsPage).toHaveBeenCalledWith({
      search: "banh trang",
      page: 0,
      size: 20,
      sort: "name,asc",
    });
    expect(screen.getByText("Product 20")).toBeTruthy();
    expect(screen.getByText(/20\/65/)).toBeTruthy();
  });
});
