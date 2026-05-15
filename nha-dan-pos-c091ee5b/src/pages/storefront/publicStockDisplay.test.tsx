import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeroSlider } from "@/components/storefront/HeroSlider";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontProduct } from "@/services/catalog/publicCatalog";

const mockedCartAdd = vi.hoisted(() => ({ add: vi.fn() }));

const sampleProduct = (): StorefrontProduct => ({
  id: "p1",
  code: "CODE1",
  name: "Alpha Product",
  categoryId: "10",
  categoryName: "Danh mục",
  active: true,
  variants: [
    { id: "v1", code: "V1", name: "Mặc định", sellUnit: "cái", sellPrice: 12000, isDefault: true },
  ],
});

vi.mock("@/lib/cart", () => ({
  cartActions: { add: mockedCartAdd.add },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("storefront public stock display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCartAdd.add.mockClear();
  });

  it("hero_slider_add_to_cart_includes_available_qty", async () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 9, availabilityStatus: "IN_STOCK" };
    render(
      <MemoryRouter>
        <HeroSlider items={[p]} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("storefront-hero-add-cart")).toBeEnabled());
    fireEvent.click(screen.getByTestId("storefront-hero-add-cart"));
    expect(mockedCartAdd.add).toHaveBeenCalledWith(expect.objectContaining({
      productId: "p1",
      variantId: "v1",
      availableQty: 9,
      availabilityStatus: "IN_STOCK",
      sellUnit: "cái",
    }));
    expect(mockedCartAdd.add.mock.calls[0][0]).not.toHaveProperty("stock");
  });

  it("product_card_add_to_cart_includes_available_qty", () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 9, availabilityStatus: "LOW_STOCK" };
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("storefront-add-cart"));
    expect(mockedCartAdd.add).toHaveBeenCalledWith(expect.objectContaining({
      productId: "p1",
      variantId: "v1",
      availableQty: 9,
      availabilityStatus: "LOW_STOCK",
      sellUnit: "cái",
    }));
    expect(mockedCartAdd.add.mock.calls[0][0]).not.toHaveProperty("stock");
  });

  it("storefront_hero_renders_available_qty", async () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 9, availabilityStatus: "IN_STOCK" };
    render(
      <MemoryRouter>
        <HeroSlider items={[p]} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("storefront-hero-availability")).toHaveTextContent("Còn 9 cái");
    });
  });

  it("storefront_product_card_renders_available_qty", () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 4, availabilityStatus: "IN_STOCK" };
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("storefront-product-card-availability")).toHaveTextContent("Còn 4 cái");
  });

  it("storefront_does_not_render_undefined_qty", async () => {
    render(
      <MemoryRouter>
        <HeroSlider items={[sampleProduct()]} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId("storefront-hero-availability").length).toBeGreaterThan(0);
    });
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/Còn\s+undefined/i);
    expect(txt).not.toContain("undefined");
    expect(screen.getAllByTestId("storefront-hero-availability")[0]).toHaveTextContent("Còn hàng");
    const addBtn = screen.getByTestId("storefront-hero-add-cart");
    expect(addBtn).not.toBeDisabled();
  });

  it("storefront_product_card_does_not_render_undefined_stock", () => {
    render(
      <MemoryRouter>
        <ProductCard product={sampleProduct()} />
      </MemoryRouter>,
    );
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/Còn\s+undefined/i);
    expect(txt).not.toContain("undefined");
    expect(screen.getByTestId("storefront-product-card-availability")).toHaveTextContent("Còn hàng");
  });

  it("storefront_hero_availability_uses_success_color_when_in_stock", async () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 9, availabilityStatus: "IN_STOCK" };
    render(
      <MemoryRouter>
        <HeroSlider items={[p]} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const el = screen.getByTestId("storefront-hero-availability");
      expect(el).toHaveClass("text-success");
    });
  });

  it("storefront_product_card_availability_uses_success_color_when_in_stock", () => {
    const p = sampleProduct();
    p.variants[0] = { ...p.variants[0], availableQty: 60, availabilityStatus: "IN_STOCK", sellUnit: "Hũ" };
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("storefront-product-card-availability")).toHaveClass("text-success");
    expect(screen.getByTestId("storefront-product-card-availability")).toHaveTextContent("Còn 60 Hũ");
  });

  it("storefront_product_card_availability_uses_danger_color_when_out_of_stock", () => {
    const p = sampleProduct();
    p.variants[0] = {
      ...p.variants[0],
      availableQty: 0,
      availabilityStatus: "OUT_OF_STOCK",
    };
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    const el = screen.getByTestId("storefront-product-card-availability");
    expect(el).toHaveClass("text-danger");
    expect(el).toHaveTextContent("Hết hàng");
  });

  it("storefront_availability_never_renders_undefined", async () => {
    render(
      <MemoryRouter>
        <div>
          <HeroSlider items={[sampleProduct()]} />
          <ProductCard product={sampleProduct()} />
        </div>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByTestId("storefront-hero-availability").length).toBeGreaterThan(0));
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/Còn\s+undefined/i);
    expect(txt).not.toContain("undefined");
  });
});
