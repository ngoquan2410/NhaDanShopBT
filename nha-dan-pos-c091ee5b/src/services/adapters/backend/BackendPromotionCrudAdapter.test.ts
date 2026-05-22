import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendPromotionCrudAdapter } from "./BackendPromotionCrudAdapter";
import * as promotionsApi from "@/services/admin/adminPromotionsApi";

vi.mock("@/services/admin/adminPromotionsApi", () => ({
  fetchAdminPromotionPage: vi.fn(),
  adminPromotionRowToUi: vi.fn((x) => x),
  buildPromotionUpsertBody: vi.fn(),
  createAdminPromotion: vi.fn(),
  updateAdminPromotion: vi.fn(),
  getAdminPromotion: vi.fn(),
  toggleAdminPromotionActive: vi.fn(),
  deleteAdminPromotion: vi.fn(),
}));

describe("BackendPromotionCrudAdapter list filters", () => {
  beforeEach(() => {
    vi.mocked(promotionsApi.fetchAdminPromotionPage).mockReset();
    vi.mocked(promotionsApi.fetchAdminPromotionPage).mockResolvedValue({
      items: [],
      total: 0,
      totalPages: 0,
      page: 0,
      size: 20,
    });
  });

  it("requests includeArchived=true when active=false filter", async () => {
    const adapter = new BackendPromotionCrudAdapter();
    await adapter.list({ active: false, page: 1, pageSize: 20 });
    expect(promotionsApi.fetchAdminPromotionPage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "inactive",
        includeArchived: true,
      }),
    );
  });

  it("passes effective status filters through to backend", async () => {
    const adapter = new BackendPromotionCrudAdapter();
    await adapter.list({ status: "expired", page: 1, pageSize: 20 });
    expect(promotionsApi.fetchAdminPromotionPage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "expired",
        includeArchived: true,
      }),
    );
  });
});

