import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StorefrontProductDetail from "./ProductDetail";

const mocked = vi.hoisted(() => ({
  add: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "1" }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocked.toastError,
    success: vi.fn(),
  },
}));

vi.mock("@/lib/cart", () => ({
  cartActions: { add: mocked.add },
}));

vi.mock("@/services/catalog/publicCatalog", () => ({
  getPublicProduct: vi.fn(async () => ({
    id: "1",
    code: "P1",
    name: "Product 1",
    categoryId: "10",
    categoryName: "Cat",
    active: true,
    variants: [{
      id: "v1",
      code: "V1",
      name: "Default",
      sellUnit: "cai",
      sellPrice: 10000,
      stock: 0,
      minStock: 0,
      isDefault: true,
    }],
  })),
  listPublicProducts: vi.fn(async () => []),
}));

describe("ProductDetail sellable stock guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables quantity and CTAs when sellable stock is zero", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByText("Sản phẩm hiện không có tồn bán được.")).toBeTruthy());

    expect(screen.queryByText("Số lượng")).toBeNull();
    const addButtons = screen.getAllByRole("button", { name: /Thêm/i });
    const buyButtons = screen.getAllByRole("button", { name: /Mua ngay/i });
    expect(addButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(buyButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
