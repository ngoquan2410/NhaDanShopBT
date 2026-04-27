import type { CartContext, EvaluatedPromotion } from "@/services/types";

export interface PromotionEvaluationService {
  evaluateAll(ctx: CartContext): Promise<EvaluatedPromotion[]>;
  pickBest(ctx: CartContext): Promise<EvaluatedPromotion | null>;
}
