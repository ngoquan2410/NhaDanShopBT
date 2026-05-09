import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import { BackendProductionAdminAdapter } from "./BackendProductionAdminAdapter";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("BackendProductionAdminAdapter", () => {
  const adapter = new BackendProductionAdminAdapter();

  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      content: [],
      totalElements: 0,
      number: 0,
      size: 20,
    });
  });

  it("omits blank recipe query and keeps default sort", async () => {
    await adapter.listRecipes({
      page: 1,
      pageSize: 20,
      query: "   ",
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/production-recipes?page=0&size=20&sort=id%2Cdesc",
    );
  });

  it("passes order query/status/sort/page to backend", async () => {
    await adapter.listOrders({
      page: 2,
      pageSize: 10,
      query: "PO-01",
      status: "completed",
      sort: [{ field: "orderNo", direction: "asc" }],
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/production-orders?status=completed&query=PO-01&page=1&size=10&sort=orderNo%2Casc",
    );
  });
});
