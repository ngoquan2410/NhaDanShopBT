import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import { BackendProductAdapter } from "./BackendProductAdapter";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("BackendProductAdapter", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("passes forSaleOnly=true for POS catalog surfaces and maps sellability", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      content: [{
        id: 1,
        code: "P1",
        name: "Product 1",
        categoryId: 2,
        categoryName: "Cat",
        active: true,
        variants: [{
          id: 10,
          variantCode: "V1",
          variantName: "Default",
          sellUnit: "cái",
          importUnit: "cái",
          piecesPerUnit: 1,
          sellPrice: 1000,
          costPrice: 500,
          stockQty: 3,
          minStockQty: 0,
          expiryDays: 0,
          active: true,
          isDefault: true,
          isSellable: true,
        }],
      }],
      totalElements: 1,
      size: 200,
      number: 0,
    });

    const res = await new BackendProductAdapter().list({ page: 1, pageSize: 200, forSaleOnly: true });

    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/products?forSaleOnly=true&page=0&size=200&sort=name%2Casc",
    );
    expect(res.items[0].variants[0].active).toBe(true);
    expect(res.items[0].variants[0].isSellable).toBe(true);
  });
});

