import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StorefrontProductDetail from "./ProductDetail";

const mocked = vi.hoisted(() => ({
  add: vi.fn(),
  listPublicProductsPage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
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
      isDefault: true,
    }],
  })),
  listPublicProductsPage: mocked.listPublicProductsPage,
}));

describe("ProductDetail public DTO cart flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.listPublicProductsPage.mockResolvedValue({ items: [], totalElements: 0, totalPages: 0, page: 0, size: 6 });
  });

  it("renders and adds to cart without requiring public stock fields", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByText("Sản phẩm đang mở bán")).toBeTruthy());

    expect(screen.getByText("Số lượng")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Thêm vào giỏ/i }));
    expect(mocked.add).toHaveBeenCalledWith(expect.objectContaining({
      productId: "1",
      variantId: "v1",
      unitPrice: 10000,
      catalogSource: "backend",
      schemaVersion: 2,
    }));
    expect(mocked.add.mock.calls[0][0]).not.toHaveProperty("stock");
  });

  it("loads related products from the public category page and excludes the current product", async () => {
    mocked.listPublicProductsPage.mockResolvedValue({
      items: [
        { id: "1", code: "P1", name: "Product 1", categoryId: "10", categoryName: "Cat", active: true, variants: [{ id: "v1", code: "V1", name: "Default", sellUnit: "cai", sellPrice: 10000 }] },
        { id: "2", code: "P2", name: "Related Product", categoryId: "10", categoryName: "Cat", active: true, variants: [{ id: "v2", code: "V2", name: "Related", sellUnit: "cai", sellPrice: 12000 }] },
      ],
      totalElements: 2,
      totalPages: 1,
      page: 0,
      size: 6,
    });

    render(<StorefrontProductDetail />);
    await waitFor(() => expect(mocked.listPublicProductsPage).toHaveBeenCalledWith({
      categoryId: "10",
      page: 0,
      size: 6,
      sort: "name,asc",
    }));

    await waitFor(() => expect(screen.getByText("Related Product")).toBeTruthy());
    expect(screen.getAllByTestId("storefront-product-card")).toHaveLength(1);
  });
});
