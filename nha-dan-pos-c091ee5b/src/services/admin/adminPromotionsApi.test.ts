import { describe, expect, it, vi, beforeEach } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import {
  BACKEND_TO_UI_PROMOTION_TYPE,
  UI_TO_BACKEND_PROMOTION_TYPE,
  adminPromotionRowToUi,
  buildPromotionUpsertBody,
  createAdminPromotion,
  parseAdminPromotionRow,
  fetchAdminPromotionPage,
  updateAdminPromotion,
} from "./adminPromotionsApi";
import { getPromotionEffectiveStatus } from "@/lib/promotions";
import type { Promotion } from "@/lib/promotions";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("adminPromotionsApi", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("defines explicit backend/UI type mappings", () => {
    expect(UI_TO_BACKEND_PROMOTION_TYPE.percent).toBe("PERCENT_DISCOUNT");
    expect(UI_TO_BACKEND_PROMOTION_TYPE.fixed).toBe("FIXED_DISCOUNT");
    expect(UI_TO_BACKEND_PROMOTION_TYPE["buy-x-get-y"]).toBe("BUY_X_GET_Y");
    expect(UI_TO_BACKEND_PROMOTION_TYPE.gift).toBe("QUANTITY_GIFT");
    expect(UI_TO_BACKEND_PROMOTION_TYPE["free-shipping"]).toBe("FREE_SHIPPING");
    expect(BACKEND_TO_UI_PROMOTION_TYPE.FREE_SHIPPING).toBe("free-shipping");
  });

  it("maps backend row to local promotion union", () => {
    const row = parseAdminPromotionRow({
      id: 5,
      name: "Ship",
      description: null,
      type: "FREE_SHIPPING",
      discountValue: 0,
      minOrderValue: "200000",
      maxDiscount: "30000",
      startDate: "2026-04-01T00:00:00",
      endDate: "2026-04-30T23:59:59",
      active: true,
      effectiveStatus: "expired",
      appliesTo: "ALL",
      categoryIds: [],
      productIds: [],
    });

    const ui = adminPromotionRowToUi(row);
    expect(ui).toMatchObject({ id: "5", type: "free-shipping", minOrder: 200000, maxShippingDiscount: 30000, effectiveStatus: "expired" });
  });

  it("derives effective statuses separately from the admin active flag", () => {
    const now = new Date("2026-05-21T12:00:00+07:00");
    expect(getPromotionEffectiveStatus({ active: true, startDate: "2026-05-01", endDate: "2026-05-16" }, now)).toBe("expired");
    expect(getPromotionEffectiveStatus({ active: true, startDate: "2026-05-01", endDate: "2026-05-31" }, now)).toBe("running");
    expect(getPromotionEffectiveStatus({ active: true, startDate: "2026-06-01", endDate: "2026-06-30" }, now)).toBe("scheduled");
    expect(getPromotionEffectiveStatus({ active: false, startDate: "2026-05-01", endDate: "2026-05-31" }, now)).toBe("inactive");
  });

  it("builds backend upsert payload for product-scoped percent promotion", () => {
    const promo: Promotion = {
      id: "",
      name: "PCT",
      description: "",
      active: true,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      scope: { kind: "products", productIds: ["10"] },
      type: "percent",
      percent: 15,
      maxDiscount: 25000,
      minOrder: 100000,
    };

    expect(buildPromotionUpsertBody(promo)).toMatchObject({
      type: "PERCENT_DISCOUNT",
      appliesTo: "PRODUCT",
      productIds: [10],
      discountValue: 15,
      maxDiscount: 25000,
      minOrderValue: 100000,
      startDate: "2026-04-01T00:00:00",
      endDate: "2026-04-30T23:59:59",
    });
  });

  it("uses admin endpoints for create and update", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({ id: 1, name: "P", type: "FIXED_DISCOUNT", startDate: "2026-04-01T00:00:00", endDate: "2026-04-30T23:59:59" });
    await createAdminPromotion({ name: "P" });
    await updateAdminPromotion(1, { name: "P2" });
    expect(adminApi.adminFetchJson).toHaveBeenNthCalledWith(1, "/api/promotions", expect.objectContaining({ method: "POST" }));
    expect(adminApi.adminFetchJson).toHaveBeenNthCalledWith(2, "/api/promotions/1", expect.objectContaining({ method: "PUT" }));
  });

  it("sends server-side list query params for promotions page", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    await fetchAdminPromotionPage({
      page: 0,
      size: 20,
      search: "flash sale",
      status: "active",
      type: "BUY_X_GET_Y",
      includeArchived: true,
      sort: "name,asc",
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/promotions?page=0&size=20&sort=name%2Casc&search=flash+sale&status=active&type=BUY_X_GET_Y&includeArchived=true",
    );
  });

  it("sends effective status query params for admin promotion filters", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    await fetchAdminPromotionPage({ page: 0, size: 20, status: "expired" });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/promotions?page=0&size=20&sort=createdAt%2Cdesc&status=expired",
    );
  });

  it("gift promotion default repeatable=false and mapping preserves repeatable", () => {
    const gift = buildPromotionUpsertBody({
      id: "",
      name: "Gift promo",
      description: "",
      active: true,
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      scope: { kind: "all" },
      type: "gift",
      triggerType: "min-order",
      triggerValue: 100000,
      giftItems: [{ productId: "5", productName: "X", quantity: 1 }],
      repeatable: false,
    });
    expect(gift.repeatable).toBe(false);
  });
});

