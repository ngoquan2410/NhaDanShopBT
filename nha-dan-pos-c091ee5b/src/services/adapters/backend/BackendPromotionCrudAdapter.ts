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
    const pageSize = params?.pageSize ?? 200;
    let items = (await fetchAdminPromotionPage(Math.max(0, page - 1), pageSize)).map(adminPromotionRowToUi);
    if (params?.active !== undefined) items = items.filter((p) => p.active === params.active);
    if (params?.kinds?.length) items = items.filter((p) => params.kinds!.includes(p.type));
    return { items, total: items.length, page, pageSize };
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

