import type {
  PromotionCrudService,
  PromotionListParams,
} from "@/services/promotionsCrud/PromotionCrudService";
import type { PagedResult } from "@/services/types";
import type { Promotion } from "@/lib/promotions";
import { getStoreState, promotionActions } from "@/lib/store";

export class LocalPromotionCrudAdapter implements PromotionCrudService {
  async list(params?: PromotionListParams): Promise<PagedResult<Promotion>> {
    let rows = getStoreState().promotions;
    if (params?.active !== undefined) rows = rows.filter((p) => p.active === params.active);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }
  async get(id: string) {
    return getStoreState().promotions.find((p) => p.id === id) ?? null;
  }
  async upsert(promo: Promotion): Promise<Promotion> {
    promotionActions.upsert(promo);
    return promo;
  }
  async toggleActive(id: string) {
    promotionActions.toggleActive(id);
  }
  async remove(id: string) {
    promotionActions.remove(id);
  }
}
