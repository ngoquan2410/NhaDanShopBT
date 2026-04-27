// PromotionCrudService — admin-side CRUD for promotion records.
// Distinct from `PromotionEvaluationService`, which evaluates a cart against
// active promotions at checkout/POS time.

import type { ListQuery, PagedResult } from "@/services/types";
import type { Promotion } from "@/lib/promotions";

/** Backend-friendly list params. `kinds` accepts a multi-select of promotion
 *  types so the BE can filter without parsing CSV. */
export interface PromotionListParams extends ListQuery {
  active?: boolean;
  kinds?: string[];
  dateRange?: { from?: string; to?: string };
}

export interface PromotionCrudService {
  list(params?: PromotionListParams): Promise<PagedResult<Promotion>>;
  get(id: string): Promise<Promotion | null>;
  upsert(promo: Promotion): Promise<Promotion>;
  toggleActive(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
