import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StorefrontProductDetail from "./ProductDetail";

const mocked = vi.hoisted(() => ({
  add: vi.fn(),
  listPublicProductsPage: vi.fn(),
  toastError: vi.fn(),
  getPublicProduct: vi.fn(),
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
  getPublicProduct: mocked.getPublicProduct,
  listPublicProductsPage: mocked.listPublicProductsPage,
}));

describe("ProductDetail public DTO cart flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.listPublicProductsPage.mockResolvedValue({ items: [], totalElements: 0, totalPages: 0, page: 0, size: 6 });
    mocked.getPublicProduct.mockResolvedValue({
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
    });
  });

  it("storefront_product_detail_does_not_render_undefined_stock", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByText("Sản phẩm đang mở bán")).toBeTruthy(), { timeout: 15000 });
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/Còn\s+undefined/i);
    expect(txt).not.toContain("undefined");
  });

  it("product_detail_quantity_visible_default_one", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-quantity-section")).toBeTruthy());
    expect(screen.getByText("Số lượng")).toBeTruthy();
    expect(screen.getByText(/Đang chọn:/)).toBeTruthy();
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1");
  });

  it("product_detail_quantity_increment_decrement_updates_visible_value", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1"));
    fireEvent.click(screen.getByTestId("storefront-product-quantity-increment"));
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("storefront-product-quantity-decrement"));
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1");
  });

  it("product_detail_quantity_cannot_go_below_one", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1"));
    const dec = screen.getByTestId("storefront-product-quantity-decrement");
    expect(dec).toBeDisabled();
    fireEvent.click(dec);
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1");
  });

  it("product_detail_add_to_cart_uses_selected_quantity", async () => {
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("1"));
    fireEvent.click(screen.getByTestId("storefront-product-quantity-increment"));
    fireEvent.click(screen.getByTestId("storefront-product-quantity-increment"));
    const addBtns = screen.getAllByTestId("storefront-add-cart");
    const addDesktop = addBtns.find((b) => b.textContent?.includes("Thêm vào giỏ"));
    expect(addDesktop).toBeTruthy();
    fireEvent.click(addDesktop!);
    expect(mocked.add).toHaveBeenCalledWith(expect.objectContaining({ qty: 3 }));
  });

  it("product_detail_add_to_cart_includes_available_qty", async () => {
    mocked.getPublicProduct.mockResolvedValueOnce({
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
        sellUnit: "cái",
        sellPrice: 10000,
        isDefault: true,
        availableQty: 9,
        availabilityStatus: "IN_STOCK",
      }],
    });
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-detail-availability")).toHaveTextContent("Còn 9 cái"));
    fireEvent.click(screen.getByRole("button", { name: /Thêm vào giỏ/i }));
    expect(mocked.add).toHaveBeenCalledWith(expect.objectContaining({
      availableQty: 9,
      availabilityStatus: "IN_STOCK",
      sellUnit: "cái",
    }));
    expect(mocked.add.mock.calls[0][0]).not.toHaveProperty("stock");
  });

  it("storefront_product_detail_renders_available_qty", async () => {
    mocked.getPublicProduct.mockResolvedValueOnce({
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
        sellUnit: "cái",
        sellPrice: 10000,
        isDefault: true,
        availableQty: 12,
        availabilityStatus: "IN_STOCK",
      }],
    });
    render(<StorefrontProductDetail />);
    await waitFor(() => {
      expect(screen.getByTestId("storefront-product-detail-availability")).toHaveTextContent("Còn 12 cái");
    });
    expect(screen.getByTestId("storefront-product-detail-availability")).toHaveClass("text-success");
  });

  it("storefront_product_detail_availability_uses_success_color_when_in_stock", async () => {
    mocked.getPublicProduct.mockResolvedValueOnce({
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
        sellUnit: "cái",
        sellPrice: 10000,
        isDefault: true,
        availableQty: 7,
        availabilityStatus: "IN_STOCK",
      }],
    });
    render(<StorefrontProductDetail />);
    await waitFor(() => {
      expect(screen.getByTestId("storefront-product-detail-availability")).toHaveTextContent("Còn 7 cái");
    });
    expect(screen.getByTestId("storefront-product-detail-availability")).toHaveClass("text-success");
  });

  it("storefront_out_of_stock_disables_add_to_cart", async () => {
    mocked.getPublicProduct.mockResolvedValueOnce({
      id: "1",
      code: "P1",
      name: "Out",
      categoryId: "10",
      categoryName: "Cat",
      active: true,
      variants: [{
        id: "v1",
        code: "V1",
        name: "Default",
        sellUnit: "cái",
        sellPrice: 10000,
        isDefault: true,
        availableQty: 0,
        availabilityStatus: "OUT_OF_STOCK",
      }],
    });
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByTestId("storefront-product-detail-availability")).toHaveTextContent("Hết hàng"));
    expect(screen.getByTestId("storefront-product-detail-availability")).toHaveClass("text-danger");
    const addBtns = screen.getAllByTestId("storefront-add-cart");
    addBtns.forEach((b) => expect(b).toBeDisabled());
    expect(mocked.add).not.toHaveBeenCalled();
  });

  it("product_detail_quantity_section_visible_when_multiple_variants", async () => {
    mocked.getPublicProduct.mockResolvedValueOnce({
      id: "1",
      code: "P1",
      name: "Product 1",
      categoryId: "10",
      categoryName: "Cat",
      active: true,
      variants: [
        { id: "v1", code: "V1", name: "Size S", sellUnit: "cai", sellPrice: 10000, isDefault: true },
        { id: "v2", code: "V2", name: "Size M", sellUnit: "cai", sellPrice: 11000, isDefault: false },
      ],
    });
    render(<StorefrontProductDetail />);
    await waitFor(() => expect(screen.getByText("Size M")).toBeTruthy());
    fireEvent.click(screen.getByTestId("storefront-product-quantity-increment"));
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Size M" }));
    expect(screen.getByTestId("storefront-product-quantity-section")).toBeTruthy();
    expect(screen.getByTestId("storefront-product-quantity-value")).toHaveTextContent("2");
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
