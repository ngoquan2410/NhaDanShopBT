import type { PromotionEvaluationService } from "@/services/promotions/PromotionEvaluationService";
import type { CartContext, EvaluatedPromotion } from "@/services/types";
import {
  cartContextToPromotionEvaluationPayload,
  postPromotionEvaluate,
  postPromotionPickBest,
} from "@/services/promotions/promotionEvaluationApi";

export class BackendPromotionEvaluationAdapter implements PromotionEvaluationService {
  async evaluateAll(ctx: CartContext): Promise<EvaluatedPromotion[]> {
    return postPromotionEvaluate(cartContextToPromotionEvaluationPayload(ctx));
  }

  async pickBest(ctx: CartContext): Promise<EvaluatedPromotion | null> {
    return postPromotionPickBest(cartContextToPromotionEvaluationPayload(ctx));
  }
}

