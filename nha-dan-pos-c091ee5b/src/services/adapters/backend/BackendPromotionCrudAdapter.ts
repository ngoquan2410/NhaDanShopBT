import type {
  PromotionCrudService,
  PromotionListParams,
} from "@/services/promotionsCrud/PromotionCrudService";
import type { PagedResult } from "@/services/types";
import type { Promotion } from "@/lib/promotions";
import {
  adminPromotionRowToUi,
  buildPromotionUpsertBody,
  createAdminPromotion,
  deleteAdminPromotion,
  fetchAdminPromotionPage,
  getAdminPromotion,
  toggleAdminPromotionActive,
  updateAdminPromotion,
} from "@/services/admin/adminPromotionsApi";

export class BackendPromotionCrudAdapter implements PromotionCrudService {
  async list(params?: PromotionListParams): Promise<PagedResult<Promotion>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const backendType = params?.kinds?.[0]
      ? ({
          percent: "PERCENT_DISCOUNT",
          fixed: "FIXED_DISCOUNT",
          "free-shipping": "FREE_SHIPPING",
          "buy-x-get-y": "BUY_X_GET_Y",
          gift: "QUANTITY_GIFT",
        }[params.kinds[0]] as
          | "PERCENT_DISCOUNT"
          | "FIXED_DISCOUNT"
          | "FREE_SHIPPING"
          | "BUY_X_GET_Y"
          | "QUANTITY_GIFT"
          | undefined)
      : undefined;
    const response = await fetchAdminPromotionPage({
      page: Math.max(0, page - 1),
      size: pageSize,
      search: params?.query,
      status: params?.active === undefined ? undefined : params.active ? "active" : "inactive",
      type: backendType,
      includeArchived: params?.active === false,
      sort: "createdAt,desc",
    });
    return {
      items: response.items.map(adminPromotionRowToUi),
      total: response.total,
      page,
      pageSize,
    };
  }

  async get(id: string): Promise<Promotion | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;
    return adminPromotionRowToUi(await getAdminPromotion(numericId));
  }

  async upsert(promo: Promotion): Promise<Promotion> {
    const body = buildPromotionUpsertBody(promo);
    const numericId = Number(promo.id);
    const row = promo.id && Number.isFinite(numericId) && numericId > 0
      ? await updateAdminPromotion(numericId, body)
      : await createAdminPromotion(body);
    return adminPromotionRowToUi(row);
  }

  async toggleActive(id: string): Promise<void> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw new Error("Promotion id không hợp lệ");
    await toggleAdminPromotionActive(numericId);
  }

  async remove(id: string): Promise<void> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw new Error("Promotion id không hợp lệ");
    await deleteAdminPromotion(numericId);
  }
}

