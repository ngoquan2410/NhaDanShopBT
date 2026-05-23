import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import { searchVariantsForTransaction } from "./variantTransactionSearch";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("variantTransactionSearch", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("preserves context=pos and maps missing isSellable as sellable fallback", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      content: [{
        variantId: 1,
        variantCode: "SKU1",
        variantName: "Default",
        productId: 2,
        productCode: "P1",
        productName: "Product",
        productType: "SINGLE",
        active: true,
        stockQty: 4,
      }],
      totalElements: 1,
    });

    const res = await searchVariantsForTransaction({ search: "SKU", context: "pos", page: 0, size: 40 });

    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/products/variants/search?search=SKU&context=pos&page=0&size=40",
      { signal: undefined },
    );
    expect(res.items[0].isSellable).toBe(true);
  });
});

