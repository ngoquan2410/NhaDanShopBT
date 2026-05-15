import type { PromotionType } from "@/services/types";

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  percent_discount: "% giảm giá",
  fixed_discount: "Giảm cố định",
  buy_x_get_y: "Mua X tặng Y",
  gift: "Quà tặng",
  free_shipping: "Miễn phí ship",
};

/** Best-effort parse of a Vietnamese reason string to extract progress info.
 *  Examples handled:
 *    "Cần thêm 50.000đ để đạt..."  -> { remaining: 50000, kind: "money" }
 *    "Đơn tối thiểu 200.000đ"       -> { target: 200000, kind: "money" }
 *    "Cần 2, đang có 1"             -> { target: 2, current: 1, kind: "qty" }
 */
export interface ParsedProgress {
  kind: "money" | "qty" | "unknown";
  current?: number;
  target?: number;
  remaining?: number;
  productName?: string;
}

const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export function parseProgressFromReason(reason: string | undefined, fallback?: string): ParsedProgress {
  const text = `${reason ?? ""} ${fallback ?? ""}`.trim();
  if (!text) return { kind: "unknown" };

  // Money "đ" patterns
  const mRemain = text.match(/(?:còn thiếu|cần thêm)\s+([\d.,]+)\s*đ/i);
  const mTarget = text.match(/(?:đơn tối thiểu|tối thiểu|từ)\s+([\d.,]+)\s*đ/i);
  const mCurrent = text.match(/(?:đang có|hiện có|đã có|đã đạt)\s+([\d.,]+)\s*đ/i);
  if (mRemain || mTarget || mCurrent) {
    const target = mTarget ? num(mTarget[1]) : undefined;
    const current = mCurrent ? num(mCurrent[1]) : undefined;
    const remaining = mRemain ? num(mRemain[1]) : (target != null && current != null ? Math.max(0, target - current) : undefined);
    return { kind: "money", target, current, remaining };
  }

  // Qty "cần X, đang có Y" / "cần X, còn Y"
  const qNeed = text.match(/cần\s+(\d+)/i);
  const qHave = text.match(/(?:đang có|hiện có|đã có)\s+(\d+)/i);
  const qShort = text.match(/(?:còn thiếu|thiếu)\s+(\d+)/i);
  if (qNeed || qHave || qShort) {
    const target = qNeed ? Number(qNeed[1]) : undefined;
    const current = qHave ? Number(qHave[1]) : undefined;
    const remaining = qShort ? Number(qShort[1]) : (target != null && current != null ? Math.max(0, target - current) : undefined);
    return { kind: "qty", target, current, remaining };
  }
  return { kind: "unknown" };
}
